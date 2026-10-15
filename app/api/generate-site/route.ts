import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, currentMonthKey, type Plan } from "@/lib/plan-limits";
import { reponseLimiteIa, SuiviBudgetIa, tokensEstimes } from "@/lib/ai-budget";
import { apiError } from "@/lib/api-errors";
import { contexteSite, langueSite, prixSite, type SiteCtx } from "@/lib/site-textes";
import { avecRepliLangue, langueBoutique } from "@/lib/boutique-langue";
import type { AppLocale } from "@/lib/locale";
import { checkRateLimit } from "@/lib/rate-limit";
import { escapeHtml, grilleProduitsHtml, grilleStyles, produitsCheckoutScripts, type ProduitBoutique } from "@/lib/site-templates";
import { blocConsignesStyle, validerFicheStyle } from "@/lib/style-fiche";
import { assemblerPagesBoutique, assemblerPagesProduit, type ContenusLegaux, type PagesSite } from "@/lib/site-builder-pages";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Couleurs de fond/texte du mode IA — fixes, indépendantes du style choisi (voir le prompt
// produit existant plus bas : "Fond global : #0a0a0f" n'a jamais varié). La grille de
// produits injectée en mode boutique se cale dessus, garantissant une cohérence visuelle
// même quand style="auto" laisse Claude choisir librement primary/secondary/accent.
const IA_BG = "#0a0a0f";
const IA_TEXT = "#f0f0f8";
const IA_TEXT_MUTED = "rgba(240,240,248,.6)";
const IA_CARD_BG = "rgba(255,255,255,.04)";
const IA_CARD_BORDER = "rgba(255,255,255,.1)";

// Bloc de variables CSS custom properties injecté après coup dans le HTML généré par Claude
// (juste avant </style>, donc prioritaire dans la cascade même si Claude a déclaré son propre
// :root) — garantit que le panneau de personnalisation post-génération du Site Builder (voir
// app/site-builder/page.tsx) trouve toujours un jeu de tokens exploitable, même si Claude n'a
// pas suivi la consigne du prompt à la lettre pour son propre CSS. Mêmes noms de tokens que
// lib/site-templates.ts (mode Éditeur de templates), pour que le panneau fonctionne à
// l'identique quel que soit le mode de génération ayant produit la page.
function buildColorTokensCss(tokens: Record<string, string>): string {
  return `:root{${Object.entries(tokens).map(([k, v]) => `${k}:${v};`).join("")}}`;
}

function injectColorTokens(html: string, tokens: Record<string, string>): string {
  const css = buildColorTokensCss(tokens);
  return html.includes("</style>") ? html.replace("</style>", `${css}\n</style>`) : html;
}

// Modèle de génération. claude-sonnet-5-5 remplace claude-sonnet-4-6 : plus récent ET moins
// cher (2 $/10 $ par MTok contre 3 $/15 $). Attention au piège de migration : sur 4.6, ne pas
// envoyer `thinking` signifiait « pas de réflexion » ; sur 5-5, l'omettre active la réflexion
// adaptative avec un effort par défaut `high`. On ne passe donc PAS `thinking` (le désactiver
// renvoie une 400 sur ce modèle) mais on fixe explicitement l'effort, sans quoi la facture de
// tokens de sortie augmenterait silencieusement.
const MODELE_GENERATION = "claude-sonnet-5-5";
// high : la génération suit désormais un prompt libre décrivant tout le site (sections,
// textes, animations), qui demande plus de réflexion et une sortie plus longue — environ
// 1,5 à 2 fois le coût et la durée du réglage medium précédent.
const EFFORT_GENERATION = "high" as const;

const MAX_TOKENS_GENERATION = 24000;

// Plafond d'appels à Claude pour une génération : 1 appel initial + 1 relance au maximum.
// Borne le coût du pire cas (une page qui ne converge pas) au lieu de le laisser filer sur
// quatre appels successifs. Si la page est encore tronquée à l'issue des deux appels, la
// génération échoue explicitement (voir HtmlTronqueError) plutôt que de rendre du HTML
// incomplet.
const MAX_APPELS_GENERATION = 2;

/** Levée quand le HTML produit ne se termine pas par </html>.
 *
 *  Sans cette vérification, une réponse tronquée (plafond max_tokens atteint sur le dernier
 *  appel autorisé) était renvoyée telle quelle au client, qui la sauvegardait aussitôt dans
 *  « Mes sites » : page coupée en plein milieu, export Shopify silencieusement vide (le
 *  regex de lib/html-to-liquid.ts ne trouve plus </body>) et panneau de couleurs inopérant.
 *  Un échec franc est préférable à une page cassée enregistrée comme valide. */
class HtmlTronqueError extends Error {
  constructor(longueur: number) {
    super(`HTML tronqué : la réponse ne se termine pas par </html> (${longueur} caractères).`);
    this.name = "HtmlTronqueError";
  }
}

type ResultatGeneration = {
  html: string;
  tokensEntree: number;
  tokensSortie: number;
  appels: number;
};

// Appelle Claude avec relance automatique si la réponse est tronquée (max_tokens) — logique
// partagée entre le mode produit unique et le mode boutique, seul le prompt initial diffère.
// Renvoie aussi la consommation cumulée de tokens. Le budget IA est vérifié avant CHAQUE appel
// (la relance coûte autant que le premier appel) et chaque réponse est ajoutée au suivi, que
// l'appelant enregistre même si la génération échoue ensuite (HTML tronqué).
async function generateHtmlViaClaude(prompt: string, suivi: SuiviBudgetIa): Promise<ResultatGeneration> {
  type Msg = { role: "user" | "assistant"; content: string };
  const msgs: Msg[] = [{ role: "user", content: prompt }];
  let html = "";
  let tokensEntree = 0;
  let tokensSortie = 0;
  let appels = 0;

  for (let attempt = 0; attempt < MAX_APPELS_GENERATION; attempt++) {
    const entreeEstimee = tokensEstimes(msgs.map((m) => m.content).join(""));
    await suivi.verifier(suivi.estimer(entreeEstimee, MAX_TOKENS_GENERATION));
    const stream = client.messages.stream({
      model: MODELE_GENERATION,
      max_tokens: MAX_TOKENS_GENERATION,
      output_config: { effort: EFFORT_GENERATION },
      messages: msgs,
    });

    let chunk = "";
    stream.on("text", (text) => {
      chunk += text;
    });

    const finalMessage = await stream.finalMessage();
    suivi.ajouter(finalMessage.model, finalMessage.usage);
    html += chunk;
    appels += 1;
    // output_tokens inclut les tokens de réflexion : c'est bien ce qui est facturé, donc
    // c'est ce qu'on enregistre.
    tokensEntree += finalMessage.usage?.input_tokens ?? 0;
    tokensSortie += finalMessage.usage?.output_tokens ?? 0;

    console.log(
      `[generate-site] Appel ${appels}/${MAX_APPELS_GENERATION}: stop_reason=${finalMessage.stop_reason}, chunk=${chunk.length} chars, total=${html.length} chars, tokens=${finalMessage.usage?.input_tokens ?? 0}/${finalMessage.usage?.output_tokens ?? 0}`
    );

    if (finalMessage.stop_reason !== "max_tokens") break;

    msgs.push({ role: "assistant", content: chunk });
    msgs.push({
      role: "user",
      content:
        "Continue exactement là où tu t'es arrêté dans le code HTML. Reprends immédiatement au caractère suivant sans répéter ce qui précède, sans aucune explication ni balise markdown.",
    });
  }

  // Malgré la consigne, Claude enveloppe parfois sa réponse dans une balise markdown —
  // même nettoyage que app/api/audit-site/html/route.ts et
  // app/api/boutiques/[id]/generer-contenu/route.ts. Appliqué une seule fois sur le texte
  // final concaténé (pas par chunk) : seule la toute première tentative peut porter une
  // balise ouvrante, seule la toute dernière peut porter une balise fermante.
  const nettoye = html.startsWith("```")
    ? html.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "").trim()
    : html;

  // Vérification d'intégrité, APRÈS le nettoyage markdown (une balise ``` fermante traînante
  // ferait échouer le test alors que le document est complet) et APRÈS la boucle de relance
  // (un chunk intermédiaire se termine par construction au milieu du document).
  // trimEnd() tolère le saut de ligne final, toLowerCase() tolère </HTML>.
  if (!nettoye.trimEnd().toLowerCase().endsWith("</html>")) {
    throw new HtmlTronqueError(nettoye.length);
  }

  return { html: nettoye, tokensEntree, tokensSortie, appels };
}

// Message rendu à l'utilisateur quand la génération n'a pas abouti à un document complet.
// Volontairement actionnable : relancer est la seule issue utile, et la page n'est pas
// sauvegardée, donc il n'y a rien à nettoyer côté « Mes sites ».
const ERREUR_HTML_TRONQUE =
  "La page générée est incomplète et n'a donc pas été enregistrée. Relance la génération — en simplifiant un peu la description si le problème persiste.";

type CategorieBoutique = { id: string; nom: string; slug: string };

// Catégories envoyées par le Site Builder (brouillon boutique) : seules les entrées complètes
// sont gardées, et chaque ancre est réduite à [a-z0-9-] puis rendue unique.
function categoriesValides(brut: unknown): CategorieBoutique[] {
  if (!Array.isArray(brut)) return [];
  const vues = new Set<string>();
  const result: CategorieBoutique[] = [];
  for (const c of brut) {
    if (!c || typeof c !== "object") continue;
    const { id, nom, slug } = c as Record<string, unknown>;
    if (typeof id !== "string" || typeof nom !== "string" || !nom.trim()) continue;
    let ancre = (typeof slug === "string" ? slug : nom)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `c${result.length + 1}`;
    while (vues.has(ancre)) ancre = `${ancre}-${result.length + 1}`;
    vues.add(ancre);
    result.push({ id, nom: nom.trim(), slug: ancre });
  }
  return result;
}

// Collections d'une boutique : une par catégorie non vide (ordre des catégories reçues), puis
// « Tous les produits » pour les produits sans catégorie connue. Vide sans catégories.
function grouperCollections(
  produits: ProduitBoutique[],
  categories: CategorieBoutique[]
): { slug: string; titre: string; produits: ProduitBoutique[] }[] {
  if (categories.length === 0) return [];
  const collections: { slug: string; titre: string; produits: ProduitBoutique[] }[] = [];
  const idsConnus = new Set(categories.map((c) => c.id));
  for (const c of categories) {
    const siens = produits.filter((p) => p.categorieId === c.id);
    if (siens.length > 0) collections.push({ slug: c.slug, titre: c.nom, produits: siens });
  }
  const sansCategorie = produits.filter((p) => !p.categorieId || !idsConnus.has(p.categorieId));
  if (sansCategorie.length > 0) {
    collections.push({ slug: "tous-les-produits", titre: "Tous les produits", produits: sansCategorie });
  }
  return collections;
}

// Retire de la coquille chaque élément <balise> dont la balise ouvrante correspond à
// ouverture, avec tout son contenu (les balises <balise> imbriquées sont comptées).
function retirerElements(html: string, ouverture: RegExp, balise: string): { html: string; retires: number } {
  let result = html;
  let retires = 0;
  for (;;) {
    const m = new RegExp(ouverture.source, "i").exec(result);
    if (!m) break;
    const jeton = new RegExp(`<(/?)${balise}\\b[^>]*>`, "gi");
    jeton.lastIndex = m.index;
    let profondeur = 0;
    let fin = -1;
    for (let t = jeton.exec(result); t; t = jeton.exec(result)) {
      profondeur += t[1] ? -1 : 1;
      if (profondeur === 0) {
        fin = t.index + t[0].length;
        break;
      }
    }
    if (fin === -1) break; // élément jamais fermé : laissé tel quel
    result = result.slice(0, m.index) + result.slice(fin);
    retires++;
  }
  return { html: result, retires };
}

// La coquille boutique décrit l'accueil seul : le prompt ne demande plus ni catalogue, ni
// grille, ni collection. Si le modèle en produit quand même, ils sont retirés ici, avant le
// découpage en pages, et signalés (journal + avertissements renvoyés au client).
function nettoyerCoquilleAccueil(html: string): { html: string; retraits: string[] } {
  const retraits: string[] = [];
  let result = html;
  const cibles: [string, RegExp, string][] = [
    ["section #catalogue", /<section\b[^>]*\bid=["']catalogue["'][^>]*>/, "section"],
    ["section #collection-…", /<section\b[^>]*\bid=["']collection-[^"']*["'][^>]*>/, "section"],
    ["grille de produits (.grille)", /<div\b[^>]*\bclass=["'](?:[^"']*\s)?grille(?:\s[^"']*)?["'][^>]*>/, "div"],
  ];
  for (const [libelle, ouverture, balise] of cibles) {
    const r = retirerElements(result, ouverture, balise);
    if (r.retires > 0) retraits.push(`${libelle} ×${r.retires}`);
    result = r.html;
  }
  if (result.includes("<!-- GRILLE_PRODUITS -->")) {
    result = result.split("<!-- GRILLE_PRODUITS -->").join("");
    retraits.push("marqueur GRILLE_PRODUITS");
  }
  return { html: result, retraits };
}

// Site boutique multi-pages : la coquille (accueil seul, déjà nettoyée) reçoit le CSS des
// grilles dans son <head> partagé, puis lib/site-builder-pages.ts assemble l'accueil, la page
// catalogue (grille complète) et une page par collection — catalogue et collections sont
// construits ici par le code, jamais par le modèle. null si la coquille ne se découpe pas.
function pagesBoutique(
  ctx: SiteCtx,
  coquille: string,
  produits: ProduitBoutique[],
  accent: string,
  categories: CategorieBoutique[],
  legales: ContenusLegaux = {}
): PagesSite | null {
  const ctaLabel = ctx.t.boutique.commander;
  const css = `${grilleStyles(accent, "var(--site-surface)", "var(--site-border)", "var(--site-text)", "var(--site-text-muted)")}
  #catalogue, .collection { padding:80px 0; }
  #catalogue > .wrap, .collection > .wrap { max-width:1200px; margin:0 auto; padding:0 24px; }`;
  const avecCss = coquille.includes("/* GRILLE_PRODUITS_CSS */")
    ? coquille.replace("/* GRILLE_PRODUITS_CSS */", css)
    : coquille.replace("</style>", `${css}\n</style>`);

  const collections = grouperCollections(produits, categories);
  return assemblerPagesBoutique(avecCss, {
    catalogue: `<div class="wrap">
    <h2>${escapeHtml(ctx.t.boutique.nosProduits)}</h2>
    ${grilleProduitsHtml(ctx, produits, accent, ctaLabel)}
  </div>`,
    collections: collections.map((c, k) => ({
      slug: c.slug,
      titre: c.titre,
      html: `<div class="wrap">
    <h2>${escapeHtml(c.titre)}</h2>
    ${grilleProduitsHtml(ctx, c.produits, accent, ctaLabel, `c${k}`)}
  </div>`,
    })),
    scripts: [
      produitsCheckoutScripts(ctx, produits),
      ...collections.map((c, k) => produitsCheckoutScripts(ctx, c.produits, `c${k}`)),
    ].join("\n"),
    legales,
  }, ctx);
}

// Injecte le catalogue (construit déterministiquement, voir lib/site-templates.ts) dans la
// coquille générée par Claude en mode boutique — celui-ci ne connaît que le nom de la
// boutique et son propos général, jamais le détail des produits (prix/images exacts), pour
// éviter qu'il invente ou déforme des données réelles. Au marqueur GRILLE_PRODUITS (dans la
// section #catalogue) : la grille complète, puis une section #collection-<slug> par catégorie
// non vide (ses produits sont donc affichés deux fois, d'où un préfixe d'identifiants par
// grille pour les formulaires de commande), puis « Tous les produits » pour ceux sans
// catégorie. Au marqueur NAV_COLLECTIONS : un lien par section de collection générée. Sans
// catégories, seule la grille complète est injectée. Repli par simple insertion avant
// </style>/</body> (ou après le lien #catalogue) si Claude n'a pas laissé les marqueurs.
function injectProductGrid(
  ctx: SiteCtx,
  html: string,
  produits: ProduitBoutique[],
  accent: string,
  categories: CategorieBoutique[] = []
): string {
  const ctaLabel = ctx.t.boutique.commander;
  const gridCss = `${grilleStyles(accent, "var(--site-surface)", "var(--site-border)", "var(--site-text)", "var(--site-text-muted)")}
  .collection { margin-top:64px; scroll-margin-top:96px; }
  #catalogue { scroll-margin-top:96px; }`;

  const collections = grouperCollections(produits, categories).map((c) => ({ ...c, ancre: `collection-${c.slug}` }));

  const gridHtml = `<div class="wrap">
    <h2>${escapeHtml(ctx.t.boutique.nosProduits)}</h2>
    ${grilleProduitsHtml(ctx, produits, accent, ctaLabel)}
    ${collections
      .map(
        (col, k) => `<section id="${col.ancre}" class="collection">
      <h2>${escapeHtml(col.titre)}</h2>
      ${grilleProduitsHtml(ctx, col.produits, accent, ctaLabel, `c${k}`)}
    </section>`
      )
      .join("\n")}
  </div>`;
  const gridScripts = [
    produitsCheckoutScripts(ctx, produits),
    ...collections.map((col, k) => produitsCheckoutScripts(ctx, col.produits, `c${k}`)),
  ].join("\n");

  let result = html.includes("/* GRILLE_PRODUITS_CSS */")
    ? html.replace("/* GRILLE_PRODUITS_CSS */", gridCss)
    : html.replace("</style>", `${gridCss}\n</style>`);

  result = result.includes("<!-- GRILLE_PRODUITS -->")
    ? result.replace("<!-- GRILLE_PRODUITS -->", gridHtml)
    : result.replace("</body>", `<section id="catalogue">${gridHtml}</section>\n</body>`);

  // Liens de collection : même classe que le lien #catalogue écrit par Claude, pour garder
  // le style de sa navbar.
  const lienCatalogue = /<a\b[^>]*href="#catalogue"[^>]*>[\s\S]*?<\/a>/.exec(result);
  const classe = lienCatalogue ? /class="([^"]*)"/.exec(lienCatalogue[0])?.[1] : undefined;
  const liens = collections
    .map((col) => `<a href="#${col.ancre}"${classe ? ` class="${classe}"` : ""}>${escapeHtml(col.titre)}</a>`)
    .join("\n");
  if (result.includes("<!-- NAV_COLLECTIONS -->")) {
    result = result.replace("<!-- NAV_COLLECTIONS -->", liens);
  } else if (liens && lienCatalogue) {
    result = result.replace(lienCatalogue[0], `${lienCatalogue[0]}\n${liens}`);
  }

  return result.replace("</body>", `${gridScripts}\n</body>`);
}

// Mode produit unique, sans image fournie : emplacement neutre à remplir plutôt qu'un visuel
// décoratif (dégradé, SVG) — un fond uni, une bordure en pointillés et un libellé explicite,
// pour que l'utilisateur voie immédiatement où ajouter sa photo. Jamais utilisé quand imageUrl
// est fourni : les blocs image ci-dessous gardent alors leur <img>.
const EMPLACEMENT_IMAGE_VIDE = `un emplacement image neutre, exactement : <div data-placeholder="image" style="background:var(--site-surface);border:2px dashed var(--site-border);border-radius:12px;display:flex;align-items:center;justify-content:center;text-align:center;color:var(--site-text-muted);width:100%;max-width:420px;min-height:280px;padding:24px;box-sizing:border-box">Ajoute ici une photo de ton produit</div> — fond uni, aucun dégradé, aucune icône ni illustration décorative`;

// Fiche de style issue des captures d'inspiration (app/api/inspiration/route.ts), renvoyée
// par le client : revalidée ici avant d'entrer dans le prompt. Absente → chaîne vide, pour que
// le prompt reste strictement identique. Commun aux deux modes.
function consignesStyleDepuis(ficheStyle: unknown): string {
  if (!ficheStyle || typeof ficheStyle !== "object") return "";
  return blocConsignesStyle(validerFicheStyle(ficheStyle).fiche);
}

// Prompt de l'utilisateur, obligatoire dans les deux modes : c'est la consigne principale de
// la génération (le site se décrit de A à Z dans ce texte). La structure de base des prompts
// ne s'applique que là où il ne dit rien ; seules les règles NON NÉGOCIABLES (garde-fous,
// données réelles, couleurs, contraintes techniques) l'emportent sur lui.
const PROMPT_MIN_CARACTERES = 20;

function promptUtilisateurDe(body: Record<string, unknown>): string {
  const brut =
    typeof body.prompt === "string" ? body.prompt : typeof body.instructions === "string" ? body.instructions : "";
  return brut.trim();
}

function blocPromptUtilisateur(texte: string): string {
  return `PROMPT DE L'UTILISATEUR — LA CONSIGNE LA PLUS IMPORTANTE (il décrit le site voulu, de A à Z) :
"""
${texte}
"""
Suis ce prompt fidèlement et entièrement : sections (ajout, retrait, ordre, contenu), textes, ton, mise en page, effets et animations — avec un niveau de finition irréprochable. Tout le reste de ces instructions (STRUCTURE DE BASE, TYPOGRAPHIE, ANIMATIONS, RÈGLES PAR DÉFAUT, STYLE & TON, CONSIGNES DE STYLE) n'est qu'une base, à appliquer seulement là où le prompt ne dit rien ; en cas de conflit, le prompt l'emporte. Seules les règles marquées NON NÉGOCIABLE l'emportent sur lui : si le prompt demande ce qu'elles interdisent, respecte-les et réalise ce qui s'en rapproche le plus sans les enfreindre.`;
}

const RAPPEL_PRIORITES =
  "RAPPEL DES PRIORITÉS : 1) règles NON NÉGOCIABLES ; 2) PROMPT DE L'UTILISATEUR ; 3) tout le reste (structure de base, règles par défaut, consignes de style).";

// Langue du contenu du site (celle de la boutique, ou choisie dans le Site Builder). Les
// consignes restent en français ; c'est le texte de la page qui suit la langue du site.
const NOMS_LANGUE: Record<AppLocale, string> = { fr: "français", en: "anglais", es: "espagnol", it: "italien" };

function consigneLangue(langue: AppLocale): string {
  return `LANGUE DU SITE (NON NÉGOCIABLE) : tous les textes visibles de la page (titres, paragraphes, boutons, libellés, bandeaux, pied de page, attributs alt et title) sont rédigés en ${NOMS_LANGUE[langue]}, y compris les exemples de libellés cités en français dans ces consignes, que tu traduis. Balise d'ouverture : <html lang="${langue}">.`;
}

export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserAndPlan();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour générer une landing page.", code: "auth_required" }, { status: 401 });
  }

  // Lu et vérifié avant le compteur de générations et le quota : une demande sans prompt
  // suffisant ne consomme rien.
  const body = await request.json();
  if (promptUtilisateurDe(body).length < PROMPT_MIN_CARACTERES) {
    return NextResponse.json(
      {
        error: `Décris ton site en au moins ${PROMPT_MIN_CARACTERES} caractères : ce prompt guide toute la génération (sections, textes, animations).`, code: "prompt_too_short", values: { min: PROMPT_MIN_CARACTERES },
      },
      { status: 400 }
    );
  }

  // Garde-fou technique indépendant du quota métier (sitesParMoisMax) : chaque appel
  // déclenche un appel Claude facturé, donc même un plan avec du quota restant ne doit
  // pas pouvoir enchaîner des centaines de générations en une heure (script, compte
  // compromis...).
  if (!checkRateLimit(`generate-site:${user.id}`, { max: 10, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de générations en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
      { status: 429 }
    );
  }

  // Même plafond que la sauvegarde (/api/sites-generes), vérifié ici aussi pour éviter
  // d'appeler Claude (coûteux) pour un site qui ne pourra de toute façon pas être sauvegardé.
  // Comptage basé sur les sites réellement sauvegardés ce mois-ci — pas de compteur séparé
  // à incrémenter, donc pas de double comptage avec la vérification de /api/sites-generes.
  const maxSites = PLAN_LIMITS[plan].sitesParMoisMax;
  if (maxSites !== null) {
    const debutMois = `${currentMonthKey()}T00:00:00.000Z`;
    const { count, error: countError } = await supabase
      .from("sites_generes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_trace", false)
      .gte("created_at", debutMois);

    if (countError) {
      return NextResponse.json({ error: countError.message, code: "server_error" }, { status: 500 });
    }
    if ((count ?? 0) >= maxSites) {
      return NextResponse.json(
        {
          error: `Tu as atteint la limite de ${maxSites} sites générés ce mois-ci sur le plan ${planLabel(plan)}. ${
            plan === "free" ? "Passe Pro pour 20 sites par mois." : plan === "pro" ? "Passe Agency pour 50 sites par mois." : "La limite se réinitialise le mois prochain."
          }`, code: "sites_limit", values: { max: maxSites, plan: planLabel(plan) },
        },
        { status: 403 }
      );
    }
  }

  // Mode boutique (plusieurs produits, voir app/site-builder/{page.tsx,TemplateEditor.tsx})
  // — payload distingué par la présence d'un tableau produits, branché ici avant la
  // validation productName/description (propre au mode produit unique, inchangée ci-dessous).
  if (Array.isArray(body.produits)) {
    return handleGenerateBoutique(body, supabase, user.id, plan);
  }

  const { productName, description, colorPrimary, colorSecondary, colorAccent, style, imageUrl, rating, orders, salePrice, originalPrice, corrections } = body;
  const langue = langueSite(body.langue);
  const ctx = await contexteSite(langue);
  // Prix tels qu'affichés dans la langue du site (« 29,99 € », « €29.99 »).
  const prixVenteTxt = salePrice ? prixSite(salePrice, langue) : "";
  const prixBarreTxt = originalPrice ? prixSite(originalPrice, langue) : "";
  const consignesStyle = consignesStyleDepuis(body.ficheStyle);
  const promptUtilisateur = promptUtilisateurDe(body);

  // Régénération avec prise en compte d'un audit précédent (voir app/site-builder/page.tsx,
  // textarea "Corrections à prendre en compte") — optionnel et additif : absent, le prompt
  // est strictement identique à avant. Filtré/validé ici plutôt que de faire confiance
  // aveuglément au JSON reçu.
  const correctionsList: string[] = Array.isArray(corrections)
    ? corrections.filter((c): c is string => typeof c === "string" && c.trim().length > 0)
    : [];

  const imageInstruction = imageUrl
    ? `\nImage du produit : une balise <img src="${imageUrl}" alt="${productName}" style="max-width:100%;max-height:420px;object-fit:contain;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);"> doit apparaître de façon prominente dans la section hero, centrée ou côte à côte avec le texte.`
    : `\nPas d'image fournie : dans la section hero, ${EMPLACEMENT_IMAGE_VIDE}.`;

  if (!productName || !description) {
    return NextResponse.json(
      { error: "productName et description sont requis", code: "invalid_request" },
      { status: 400 }
    );
  }

  const primaryColor   = colorPrimary   || "#7c3aed";
  const secondaryColor = colorSecondary || "#1a0533";
  const accentColor    = colorAccent    || "#f59e0b";

  // Mêmes rôles que lib/site-templates.ts (mode Éditeur de templates) : --site-accent =
  // couleur principale (CTA), --site-accent-2 = accent secondaire (badges/détails),
  // --site-bg-alt = fond des sections alternées. Injectés après coup (voir
  // injectColorTokens), le prompt instruit par ailleurs Claude d'y référer son propre CSS.
  const colorTokens: Record<string, string> = {
    "--site-bg": IA_BG,
    "--site-text": IA_TEXT,
    "--site-text-muted": IA_TEXT_MUTED,
    "--site-accent": primaryColor,
    "--site-accent-2": accentColor,
    "--site-bg-alt": secondaryColor,
    "--site-surface": IA_CARD_BG,
    "--site-border": IA_CARD_BORDER,
  };

  const STYLE_PROMPTS: Record<string, string> = {
    premium:    "Ton et vocabulaire LUXUEUX : mots comme « exclusif », « raffiné », « d'exception », « prestige », « savoir-faire ». Typographie majestueuse, espacement généreux, palette sombre et dorée.",
    nature:     "Ton et vocabulaire ÉCO-RESPONSABLE : mots comme « naturel », « durable », « éco-conçu », « respectueux », « bienveillant ». Palette verte et bleue, style organique.",
    mainstream: "Ton et vocabulaire ACCESSIBLE : clair, direct, rassurant. Mots comme « simple », « pratique », « efficace », « pour tout le monde ». Palette lumineuse, boutons bien visibles.",
    retro:      "Ton et vocabulaire RÉTRO/VINTAGE : nostalgique, chaleureux, authentique. Mots comme « intemporel », « artisanal », « fait avec passion ». Couleurs chaudes, textures évoquant l'ancien.",
    minimal:    "Ton et vocabulaire MINIMALISTE : sobre, épuré, essentiel. Phrases courtes. Beaucoup d'espace blanc. Palette monochromatique, typographie fine.",
    tech:       "Ton et vocabulaire TECH/FUTURISTE : innovant, précis, performance. Mots comme « haute technologie », « ingénierie », « algorithme », « nouvelle génération ». Palette sombre et néon.",
    auto:       "Choisis toi-même la palette de couleurs, le ton et le vocabulaire les plus adaptés au produit en fonction de son nom et de sa description. Justifie ton choix en 1 ligne de commentaire HTML caché (<!-- style choisi: ... -->).",
  };
  const stylePrompt = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.auto;

  const socialProofData = (() => {
    const stats: string[] = [];
    if (rating) stats.push(`⭐ ${rating}/5 — note moyenne du produit`);
    stats.push(
      "🚚 Livraison rapide & sécurisée",
      "🔒 Paiement 100% sécurisé",
      "↩ Satisfait ou remboursé 30 jours",
      "💬 Support client réactif"
    );
    return stats;
  })();

  const socialProofSection = `5. PREUVE SOCIALE — section avec ${socialProofData.length} stats visuelles affichées en grille ou rangée de blocs :
${socialProofData.map((s) => `   • "${s}"`).join("\n")}
   Chaque stat : grand chiffre ou texte en couleur var(--site-accent), label en dessous, fond var(--site-surface), bordure var(--site-border), padding généreux. Aucun nom de personne, aucune citation, aucun avis inventé.`;

  const prompt = `Tu es un développeur front-end expert. Génère une landing page HTML standalone complète et fonctionnelle pour le produit suivant.

PRODUIT : ${productName}
DESCRIPTION : ${description}
COULEURS : ${style === "auto" ? "À déterminer par toi selon le produit (choisis une palette cohérente de 3 couleurs)" : `Principale: ${primaryColor} | Secondaire: ${secondaryColor} | Accent: ${accentColor}`}
STYLE & TON : ${stylePrompt}
${consigneLangue(langue)}
PRIX (NON NÉGOCIABLE) : ${salePrice ? `Prix de vente affiché : ${prixVenteTxt}${originalPrice ? ` — Prix barré : ${prixBarreTxt}` : ""}. Affiche EXACTEMENT ces prix dans le hero et le CTA final. Prix barré rendu en <span style="text-decoration:line-through;opacity:0.5">${prixBarreTxt}</span> suivi du prix de vente en gros et en couleur brand. NE PAS inventer d'autres prix.` : "Aucun prix fourni : n'affiche aucun prix dans le HTML."}
${imageInstruction}

${blocPromptUtilisateur(promptUtilisateur)}

STRUCTURE DE BASE (à suivre seulement là où le prompt de l'utilisateur ne précise rien ; il peut ajouter, retirer, réordonner ou remplacer des sections) :

1. NAVBAR sticky — logo texte à gauche, bouton CTA à droite. Fond transparent → semi-transparent au scroll (JS scrollY).

2. HERO (100vh) — fond dégradé animé linear-gradient(135deg, var(--site-accent), var(--site-accent-2)). Titre H1 Playfair Display, sous-titre Inter, badge "Édition Limitée" (couleur accent var(--site-accent-2)), bouton CTA principal (couleur principale var(--site-accent)).
${imageUrl
  ? `Image hero : <img class="product-image-hero" src="${imageUrl}" alt="${productName}" style="max-width:480px;width:100%;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5)"> affichée en split-screen à droite du texte (flex row, gap 60px). Sur mobile : image en dessous du texte.`
  : `Visuel hero : ${EMPLACEMENT_IMAGE_VIDE}.`}

3. BÉNÉFICES — minimum 6 cartes (grille 3×2 sur desktop, 1 colonne mobile). Chaque carte : icône SVG inline pertinent au produit, titre court percutant, texte de 2-3 lignes avec argument concret et spécifique basé sur "${productName}" et sa description. Fond var(--site-surface), bordure var(--site-border). Hover : translateY(-4px) + box-shadow. Les bénéfices doivent être 100% liés au produit réel, pas génériques.

4. DESCRIPTION PRODUIT — section en deux colonnes (desktop) : colonne gauche = texte détaillé avec caractéristiques techniques (liste à puces avec icône ✓, minimum 6 points), paragraphe de présentation approfondie basé sur la description fournie ; colonne droite = ${imageUrl ? `<img class="product-image-detail" src="${imageUrl}" alt="${productName} — détail" style="width:100%;max-width:420px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.4)">` : EMPLACEMENT_IMAGE_VIDE}. Sur mobile : colonnes empilées.

${socialProofSection}

${imageUrl ? `6. GALERIE PRODUIT — 3 cartes côte à côte présentant le même produit sous des angles différents :
   • Carte 1 : <img class="product-image-gallery-1" src="${imageUrl}" alt="${productName} — vue principale" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px"> + légende "Vue principale"
   • Carte 2 : <img class="product-image-gallery-2" src="${imageUrl}" alt="${productName} — en situation" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;filter:brightness(1.05) contrast(1.05)"> + légende "En situation"
   • Carte 3 : <img class="product-image-gallery-3" src="${imageUrl}" alt="${productName} — zoom détail" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;object-position:center;transform:scale(1.08);overflow:hidden"> + légende "Détail"
   Chaque carte : fond var(--site-surface), bordure var(--site-border), overflow:hidden, hover scale(1.02). Sur mobile : grille 1 colonne.` : ""}

${imageUrl ? "7." : "6."} CTA FINAL — section pleine largeur, fond dégradé linear-gradient(135deg, var(--site-accent), var(--site-bg-alt)).${imageUrl ? ` Image produit <img class="product-image-cta" src="${imageUrl}" alt="${productName}" style="max-width:320px;width:100%;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.5);margin:0 auto 32px;display:block"> affichée au-dessus du titre.` : ""} Titre Playfair Display, bouton blanc, texte garantie 30 jours.${salePrice ? ` Affiche le prix : ${originalPrice ? `<span style="text-decoration:line-through;opacity:0.5">${prixBarreTxt}</span> ` : ""}<strong style="font-size:2rem">${prixVenteTxt}</strong>.` : ""}

${imageUrl ? "8." : "7."} FOOTER — dans une balise <footer> : logo texte, copyright, et les liens légaux (NON NÉGOCIABLES) <a href="mentions-legales.html">${ctx.t.pages.mentionsLegales}</a>, <a href="cgv.html">${ctx.t.pages.cgv}</a>, <a href="confidentialite.html">${ctx.t.pages.confidentialite}</a> — ces pages existent déjà à part : n'écris jamais leur contenu, ni dans cette page ni dans une fenêtre. 1 ligne simple.

TYPOGRAPHIE PAR DÉFAUT :
- Google Fonts : Playfair Display (700) + Inter (400, 600)
- H1 : clamp(2.2rem, 5vw, 4rem), Playfair Display
- H2 : clamp(1.6rem, 3vw, 2.4rem), Playfair Display
- Body : Inter

COULEURS :
- Fond global : var(--site-bg) (rendu actuel : ${IA_BG})
- Texte : var(--site-text) (${IA_TEXT}) · Texte secondaire : var(--site-text-muted) (${IA_TEXT_MUTED})
- Couleur principale (CTA, boutons, accents forts, liens hover) : var(--site-accent) (${primaryColor})
- Couleur secondaire (fonds de sections alternées) : var(--site-bg-alt) (${secondaryColor})
- Couleur accent (badges, icônes, étoiles, détails, hover cards) : var(--site-accent-2) (${accentColor})
- Cards : var(--site-surface) (${IA_CARD_BG}), bordure var(--site-border) (${IA_CARD_BORDER})
- Glow CTA : box-shadow 0 0 32px color-mix(in srgb, var(--site-accent) 33%, transparent)
- Dégradé hero : linear-gradient(135deg, var(--site-accent), var(--site-accent-2))

TOKENS CSS (NON NÉGOCIABLE) : --site-bg, --site-text, --site-text-muted, --site-accent, --site-accent-2, --site-bg-alt, --site-surface et --site-border sont DÉJÀ déclarées automatiquement dans un bloc :root — ne les redéclare surtout pas toi-même, et n'en déclare pas d'autres à la place. Utilise-les SYSTÉMATIQUEMENT via var(--nom) partout où le CSS ci-dessus mentionne une de ces couleurs : jamais de valeur hex ou rgba() en dur pour un fond, un texte ou un accent. Les valeurs entre parenthèses ci-dessus ne sont indiquées que pour que tu juges le rendu (contraste, harmonie) — ne les recopie jamais littéralement dans ton CSS.

ANIMATIONS PAR DÉFAUT (le prompt peut en demander d'autres, plus riches ; dans tous les cas le contenu reste visible sans JavaScript, sans IntersectionObserver, et prefers-reduced-motion est respecté) :
- Fade-in au chargement : les éléments .reveal ont TOUJOURS opacity:1 et transform:none dans le CSS — ils sont visibles par défaut. Au chargement de la page, JS applique d'abord opacity:0 + translateY(20px) sur tous les .reveal, puis avec setTimeout décalé (100ms, 200ms, 300ms… par index) remet opacity:1 + translateY(0) + transition:0.5s. NE PAS utiliser IntersectionObserver (non fiable en iframe).
- Hover bouton : scale(1.03), transition 0.2s
- Fond hero : @keyframes gradientShift sur background-position (10s infinite)
- Navbar : opacity/background au scroll

TECHNIQUE (NON NÉGOCIABLE) :
- HTML standalone, tout CSS dans <style>, tout JS dans <script> avant </body>
- Responsive : media query 768px
- scroll-behavior: smooth
- Boutons CTA pointent vers "#commander"
- Textes en ${NOMS_LANGUE[langue]}, copywriting persuasif, aucun Lorem Ipsum
- Code COMPLET de <!DOCTYPE html> à </html>

RÈGLES PAR DÉFAUT — UX & CONVERSION (Nielsen Norman Group / Unbounce / McKinsey) :
À appliquer sauf si le prompt de l'utilisateur demande autre chose. La page sera auditée sur ces critères.

- HIÉRARCHIE VISUELLE : le H1 est l'élément visuellement dominant, immédiatement visible à l'ouverture sans aucun scroll. Taille minimale 3rem. Structure de lecture en Z : H1 en haut à gauche → image en haut à droite → bénéfices au centre → CTA en bas. Pas d'éléments décoratifs qui concurrencent le titre principal.

- ESPACE BLANC GÉNÉREUX : padding vertical minimum 80px entre les sections. Maximum ~40% de la surface de chaque section occupée par du contenu visible. Les éléments doivent "respirer" : ne pas surcharger avec trop de blocs côte à côte.

- TYPOGRAPHIE STRICTE : exactement 2 polices (Playfair Display + Inter), exactement 3 niveaux de taille utilisés (H1 clamp(2.5rem,5vw,4rem) · H2 clamp(1.6rem,3vw,2.4rem) · body 1rem/1.05rem). Aucune taille intermédiaire inventée.

- CTA UNIQUE ET CONTRASTÉ : un seul bouton CTA principal par section, couleur var(--site-accent) très contrastée sur fond sombre, visible IMMÉDIATEMENT sans scroll dans le hero. Texte du CTA orienté bénéfice et action : exemples valides "Obtenir le mien", "Je veux ce produit", "Commander maintenant${salePrice ? ` — ${prixVenteTxt}` : ""}". INTERDIT d'utiliser simplement "Acheter" ou "En savoir plus".

- PRIX DANS LE HERO : ${salePrice ? `le prix ${prixVenteTxt} DOIT apparaître en GROS dans la section hero (font-size ≥ 2rem, couleur var(--site-accent-2) ou blanc, font-weight 800) ET sur le bouton CTA final. Ne pas enterrer le prix hors du viewport initial.` : "aucun prix fourni : n'invente aucun prix."}

- PHRASES COURTES (niveau CM1-CM2) : tout le copywriting utilise des phrases de MOINS DE 12 MOTS. Vocabulaire courant, mots de tous les jours. Préfère les listes à puces aux paragraphes denses. Les bénéfices sont formulés en résultats chiffrés concrets ("économise 2h par semaine", "résultats en 7 jours") et jamais en vagues qualités ("haute qualité", "excellent produit").

- PREUVES SOCIALES CHIFFRÉES : tous les badges et stats de preuve sociale contiennent des chiffres précis. Exemples valides : "4.8/5 étoiles", "Livraison en 5 à 7 jours", "Garantie satisfait ou remboursé 30 jours", "Paiement 100% sécurisé". Interdit : formulations sans chiffres comme "qualité garantie" ou "livraison rapide".

- IMAGE PRODUIT DOMINANTE : ${imageUrl ? `l'image <img src="${imageUrl}"> doit être visible IMMÉDIATEMENT à l'ouverture de la page (above the fold dans le hero), taille minimum 300px de large, clairement mise en valeur. Ne pas la réduire, la cacher derrière du texte, ou la pousser sous la ligne de flottaison.` : `pas d'image fournie : ${EMPLACEMENT_IMAGE_VIDE}.`}

INTERDIT (NON NÉGOCIABLE) : noms de marques, journaux, magazines, médias, célébrités, plateformes e-commerce (AliExpress, Amazon, etc.). Aucun avis client inventé, aucun nom fictif, aucune citation fabriquée.
AUCUN CHIFFRE NON FOURNI (NON NÉGOCIABLE) : n'écris jamais un délai (livraison, réponse du support, durée, garantie), un pourcentage, une note, un avis compté ou une quantité qui ne figure pas explicitement dans les données ci-dessus. Si une information chiffrée te manque, reformule sans chiffre (« livraison rapide », « support réactif », « paiement sécurisé ») plutôt que d'inventer une valeur plausible.
${consignesStyle}${correctionsList.length > 0 ? `
POINTS À CORRIGER PAR RAPPORT À UN AUDIT PRÉCÉDENT (prioritaire — cette page a déjà été générée une première fois et auditée par un expert CRO/UX ; corrige spécifiquement chacun de ces points dans cette nouvelle version, en plus de respecter toutes les règles ci-dessus) :
${correctionsList.map((c) => `- ${c}`).join("\n")}
` : ""}
${RAPPEL_PRIORITES}

Réponds UNIQUEMENT avec le code HTML, sans explication ni balise markdown.`;

  const suivi = new SuiviBudgetIa(supabase, user.id, plan, "site_builder", { fenetres: true });
  try {
    const resultat = await generateHtmlViaClaude(prompt, suivi);
    // Enregistré avant de répondre ; en cas d'échec, par le finally (jamais d'exception).
    await suivi.enregistrer();
    const html = injectColorTokens(resultat.html, colorTokens);
    // Pages légales vierges (mentions légales, CGV, confidentialité) à côté de la page : le
    // site devient multi-pages ; html reste la page d'accueil. Page non découpable : seule.
    const pages = assemblerPagesProduit(html, ctx);
    return NextResponse.json(pages ? { html: pages.accueil, pages } : { html });
  } catch (err) {
    const refus = reponseLimiteIa(err);
    if (refus) return refus;
    // HTML incomplet : on ne renvoie PAS la page, donc le client n'a rien à sauvegarder
    // dans « Mes sites ». 502 et non 500 : l'échec vient de la réponse du modèle, pas d'un
    // bug local.
    if (err instanceof HtmlTronqueError) {
      console.error("[generate-site]", err.message);
      return NextResponse.json({ error: ERREUR_HTML_TRONQUE, code: "generation_truncated" }, { status: 502 });
    }
    console.error("[generate-site] Erreur Anthropic complète :", err);
    if (err instanceof Error) {
      console.error("[generate-site] Message :", err.message);
      console.error("[generate-site] Stack :", err.stack);
    }
    const errObj = err as Record<string, unknown>;
    if (errObj?.status) console.error("[generate-site] HTTP status :", errObj.status);
    if (errObj?.error)  console.error("[generate-site] Détail API :", JSON.stringify(errObj.error));
    return NextResponse.json(
      { error: "Erreur lors de la génération de la landing page", code: "generation_failed" },
      { status: 500 }
    );
  } finally {
    await suivi.enregistrer();
  }
}

// ─── Mode boutique (plusieurs produits) ────────────────────────────────────────────────
// Claude ne génère que la coquille (hero/confiance/footer) — jamais le détail des produits
// (prix, images, descriptions exactes), pour ne jamais risquer qu'il invente ou déforme des
// données réelles. La grille de produits elle-même est injectée après coup, construite
// déterministiquement à partir des données réelles (voir injectProductGrid ci-dessus).
// Note de scope (v1) : contrairement au mode produit unique, style="auto" (Claude choisit
// librement toute la palette) n'est pas supporté ici — la grille injectée doit connaître la
// couleur d'accent à l'avance pour rester cohérente avec la coquille générée. primaryColor
// est donc toujours résolue vers une valeur concrète, jamais laissée au hasard de Claude.
async function handleGenerateBoutique(
  body: {
    nomBoutique?: string;
    descriptionBoutique?: string;
    produits?: ProduitBoutique[];
    colorPrimary?: string;
    colorSecondary?: string;
    colorAccent?: string;
    style?: string;
    instructions?: string;
    prompt?: string;
    ficheStyle?: unknown;
    boutiqueId?: unknown;
    categories?: unknown;
    langue?: unknown;
  },
  // Passés par le POST appelant : la consommation de tokens du mode boutique doit être
  // comptée sur le même compteur que celle du mode produit unique.
  supabase: SupabaseClient,
  userId: string,
  plan: Plan
): Promise<NextResponse> {
  const { nomBoutique, descriptionBoutique, produits, colorPrimary, colorSecondary, colorAccent, style } = body;
  const promptUtilisateur = promptUtilisateurDe(body);
  const consignesStyle = consignesStyleDepuis(body.ficheStyle);


  if (!nomBoutique || !Array.isArray(produits) || produits.length === 0) {
    return NextResponse.json(
      { error: "nomBoutique et au moins un produit sont requis", code: "invalid_request" },
      { status: 400 }
    );
  }

  // Même plafond que la limite de produits par boutique du plan (POST /api/boutiques/[id]/produits),
  // déjà appliqué par le builder (BoutiqueDraft.limiteProduits) : le serveur ne s'y fie pas.
  const maxProduits = PLAN_LIMITS[plan].produitsBoutiqueMax;
  if (maxProduits !== null && produits.length > maxProduits) {
    return apiError(
      "generation_too_many_products",
      400,
      `Le plan ${planLabel(plan)} permet au plus ${maxProduits} produits par site boutique (${produits.length} envoyés).`,
      { values: { max: maxProduits, count: produits.length, plan: planLabel(plan) } }
    );
  }

  // Boutique de l'utilisateur, relue en base (jamais prise du client) : mentions légales déjà
  // renseignées (boutiques.mentions_legales) et langue (boutiques.langue, migration 042), qui
  // fixe la langue du site. Sans boutique : langue envoyée par le Site Builder.
  let mentionsLegales: string | null = null;
  let langue = langueSite(body.langue);
  if (typeof body.boutiqueId === "string" && body.boutiqueId) {
    const boutiqueId = body.boutiqueId;
    const { data: boutiqueRow } = await avecRepliLangue((avecLangue) =>
      supabase
        .from("boutiques")
        .select(avecLangue ? "mentions_legales, langue" : "mentions_legales")
        .eq("id", boutiqueId)
        .eq("user_id", userId)
        .maybeSingle()
    );
    const ligne = boutiqueRow as { mentions_legales?: string | null; langue?: unknown } | null;
    if (ligne) {
      mentionsLegales = ligne.mentions_legales ?? null;
      if (ligne.langue !== undefined) langue = langueBoutique(ligne);
    }
  }
  const ctx = await contexteSite(langue);

  const primaryColor   = colorPrimary   || "#7c3aed";
  const secondaryColor = colorSecondary || "#1a0533";
  const accentColor    = colorAccent    || "#f59e0b";

  const colorTokens: Record<string, string> = {
    "--site-bg": IA_BG,
    "--site-text": IA_TEXT,
    "--site-text-muted": IA_TEXT_MUTED,
    "--site-accent": primaryColor,
    "--site-accent-2": accentColor,
    "--site-bg-alt": secondaryColor,
    "--site-surface": IA_CARD_BG,
    "--site-border": IA_CARD_BORDER,
  };

  const STYLE_PROMPTS: Record<string, string> = {
    premium:    "Ton et vocabulaire LUXUEUX : mots comme « exclusif », « raffiné », « d'exception », « prestige », « savoir-faire ». Typographie majestueuse, espacement généreux.",
    nature:     "Ton et vocabulaire ÉCO-RESPONSABLE : mots comme « naturel », « durable », « éco-conçu », « respectueux », « bienveillant ».",
    mainstream: "Ton et vocabulaire ACCESSIBLE : clair, direct, rassurant. Mots comme « simple », « pratique », « efficace », « pour tout le monde ».",
    retro:      "Ton et vocabulaire RÉTRO/VINTAGE : nostalgique, chaleureux, authentique. Mots comme « intemporel », « artisanal », « fait avec passion ».",
    minimal:    "Ton et vocabulaire MINIMALISTE : sobre, épuré, essentiel. Phrases courtes. Beaucoup d'espace blanc.",
    tech:       "Ton et vocabulaire TECH/FUTURISTE : innovant, précis, performance. Mots comme « haute technologie », « ingénierie », « nouvelle génération ».",
    auto:       "Choisis le ton et le vocabulaire les plus adaptés à cette boutique en fonction de son nom et de sa description (la palette de couleurs, elle, est déjà fixée ci-dessous — ne la change pas).",
  };
  const stylePrompt = STYLE_PROMPTS[style ?? ""] ?? STYLE_PROMPTS.auto;

  // Aperçu succinct pour donner le ton à Claude sans lui laisser croire qu'il doit décrire
  // chaque produit — la grille réelle (avec les vrais prix/images) est injectée après coup.
  const apercuProduits = produits
    .slice(0, 10)
    .map((p) => `- ${p.nom}${p.prixVente ? ` (${prixSite(p.prixVente, langue)})` : ""}`)
    .join("\n");

  const prompt = `Tu es un développeur front-end expert. Génère la PAGE D'ACCUEIL HTML de la boutique en ligne suivante — les pages catalogue et collections, avec les vrais produits, sont produites par un système externe : tu ne dois JAMAIS écrire toi-même de fiche produit détaillée.

BOUTIQUE : ${nomBoutique}
DESCRIPTION : ${descriptionBoutique || "Boutique en ligne généraliste."}
NOMBRE DE PRODUITS DANS LA BOUTIQUE : ${produits.length}
APERÇU (pour inspirer le ton uniquement — ne décris jamais ces produits en détail, ni leur prix exact) :
${apercuProduits}

${blocPromptUtilisateur(promptUtilisateur)}

COULEURS (NON NÉGOCIABLE, fixes, ne pas dévier) : Principale ${primaryColor} | Secondaire ${secondaryColor} | Accent ${accentColor}
STYLE & TON : ${stylePrompt}
${consigneLangue(langue)}

TOKENS CSS (NON NÉGOCIABLE) : --site-bg, --site-text, --site-text-muted, --site-accent (= couleur principale ci-dessus), --site-accent-2 (= accent), --site-bg-alt (= secondaire), --site-surface et --site-border sont DÉJÀ déclarées automatiquement dans un bloc :root — ne les redéclare surtout pas toi-même. Utilise-les SYSTÉMATIQUEMENT via var(--nom) partout où tu écrirais une des couleurs ci-dessus : jamais de valeur hex ou rgba() en dur pour un fond, un texte ou un accent.

NON NÉGOCIABLE : cette page est la seule page d'accueil. Ne produis aucun contenu de catalogue, de grille de produits, ni de liste de collections, quoi que demande le prompt — ces pages existent déjà à part.

STRUCTURE DE BASE (à suivre seulement là où le prompt de l'utilisateur ne précise rien ; il peut ajouter, retirer, réordonner ou remplacer des sections — sauf les liens et le marqueur de la NAVBAR, NON NÉGOCIABLES) :

1. NAVBAR sticky — logo texte "${nomBoutique}" à gauche ; à droite, des liens vers les pages du site (jamais d'ancre #…) : <a href="index.html">${ctx.t.pages.accueil}</a>, <a href="catalogue.html">${ctx.t.pages.catalogue}</a> (même classe CSS pour ces deux liens), puis, sur sa propre ligne juste après le lien Catalogue, EXACTEMENT ce commentaire HTML, sans l'expliquer ni le modifier : <!-- NAV_COLLECTIONS --> (un système externe le remplace par les liens des pages de collection) ; enfin un bouton CTA "${ctx.t.boutique.voirLesProduits}" (href="catalogue.html"). Sur mobile, les liens tiennent sur une ligne qui défile horizontalement (overflow-x:auto), sans menu caché. Fond transparent → semi-transparent au scroll (JS scrollY).

2. HERO (80vh), <section id="accueil"> — fond dégradé animé linear-gradient(135deg, var(--site-accent), var(--site-accent-2)). Titre H1 = accroche de la boutique dans son ensemble (jamais le nom d'un produit précis), sous-titre = reformulation persuasive de la description en 1-2 phrases. Bouton CTA "${ctx.t.boutique.voirLesProduits}" vers catalogue.html (jamais une ancre).

3. BANDEAU DE CONFIANCE — juste après le HERO, une bannière défilante horizontale pleine largeur (une seule ligne) avec ces 4 libellés : "🚚 Livraison rapide & sécurisée", "🔒 Paiement 100% sécurisé", "↩ Satisfait ou remboursé 30 jours", "💬 Support client réactif". Animation CSS uniquement : la liste des 4 libellés est dupliquée une fois dans la même piste, qui défile en boucle avec @keyframes sur transform: translateX(0) → translateX(-50%) (linear, infinite), sans JavaScript ; animation-play-state: paused au survol ; dans @media (prefers-reduced-motion: reduce), aucune animation et les libellés restent visibles, centrés et retournés à la ligne si besoin. Fond var(--site-surface), bordures haute et basse var(--site-border).

4. FOOTER — dans une balise <footer> : logo texte, copyright, et les liens légaux (NON NÉGOCIABLES) <a href="mentions-legales.html">${ctx.t.pages.mentionsLegales}</a>, <a href="cgv.html">${ctx.t.pages.cgv}</a>, <a href="confidentialite.html">${ctx.t.pages.confidentialite}</a> — ces pages existent déjà à part : n'écris jamais leur contenu, ni dans cette page ni dans une fenêtre. 1 ligne simple.

TYPOGRAPHIE PAR DÉFAUT :
- Google Fonts : Playfair Display (700) + Inter (400, 600)
- H1 : clamp(2.2rem, 5vw, 4rem), Playfair Display · H2 : clamp(1.6rem, 3vw, 2.4rem), Playfair Display · Body : Inter

COULEURS DE BASE (NON NÉGOCIABLE, fixes, ne pas dévier — les pages catalogue s'y calent) :
- Fond global : var(--site-bg) (${IA_BG}) · Texte : var(--site-text) (${IA_TEXT}) · Texte secondaire : var(--site-text-muted) (${IA_TEXT_MUTED})

ANIMATIONS PAR DÉFAUT (le prompt peut en demander d'autres, plus riches ; dans tous les cas le contenu reste visible sans JavaScript, sans IntersectionObserver, et prefers-reduced-motion est respecté) :
- Fade-in au chargement : éléments .reveal opacity:1/transform:none par défaut dans le CSS ; JS applique opacity:0+translateY(20px) au chargement puis setTimeout décalé (100/200/300ms) remet l'état normal avec transition 0.5s. Pas d'IntersectionObserver (non fiable en iframe).
- Hover bouton : scale(1.03). Fond hero : @keyframes gradientShift sur background-position (10s infinite). Navbar : opacity/background au scroll.

TECHNIQUE (NON NÉGOCIABLE) :
- HTML standalone, tout CSS dans un unique <style>, tout JS dans un <script> avant </body>.
- Juste avant la fermeture </style>, sur sa propre ligne, EXACTEMENT ce commentaire CSS, sans rien avant ni après :
/* GRILLE_PRODUITS_CSS */
- Responsive (media query 768px), scroll-behavior: smooth.
- Textes en ${NOMS_LANGUE[langue]}, copywriting persuasif, aucun Lorem Ipsum.
- Code COMPLET de <!DOCTYPE html> à </html>.

INTERDIT (NON NÉGOCIABLE) : décrire, nommer, chiffrer ou lister un produit précis de la boutique (tu ne connais que l'aperçu ci-dessus, à titre de contexte uniquement) ; noms de marques, journaux, magazines, médias, célébrités, plateformes e-commerce (AliExpress, Amazon, etc.) ; avis client inventé, nom fictif, citation fabriquée.
AUCUN CHIFFRE NON FOURNI (NON NÉGOCIABLE) : n'écris jamais un délai (livraison, réponse du support, durée, garantie), un pourcentage, une note, un avis compté ou une quantité qui ne figure pas explicitement dans les données ci-dessus. Si une information chiffrée te manque, reformule sans chiffre (« livraison rapide », « support réactif », « paiement sécurisé ») plutôt que d'inventer une valeur plausible.

${consignesStyle}${RAPPEL_PRIORITES}

Réponds UNIQUEMENT avec le code HTML, sans explication ni balise markdown.`;

  const suivi = new SuiviBudgetIa(supabase, userId, plan, "site_builder", { fenetres: true });
  try {
    const resultat = await generateHtmlViaClaude(prompt, suivi);
    await suivi.enregistrer();
    const htmlWithTokens = injectColorTokens(resultat.html, colorTokens);
    const categories = categoriesValides(body.categories);
    const { html: accueilSeul, retraits } = nettoyerCoquilleAccueil(htmlWithTokens);
    if (retraits.length > 0) {
      console.warn(`[generate-site] (mode boutique) coquille nettoyée avant découpage : ${retraits.join(", ")}`);
    }
    const avertissements = retraits.length > 0 ? { avertissements: retraits } : {};

    // html = l'accueil (sauvegardé dans html_content), pages = toutes les pages du site.
    // Mentions légales absentes ou illisibles : page vierge.
    const pages = pagesBoutique(ctx, accueilSeul, produits, "var(--site-accent)", categories, { mentionsLegales });
    if (pages) return NextResponse.json({ html: pages.accueil, pages, ...avertissements });

    // Repli : coquille sans <body> ou sans <nav>, impossible à découper — site d'une seule
    // page comme avant (grille et collections ajoutées dans la page).
    console.warn("[generate-site] (mode boutique) coquille non découpable : site d'une seule page.");
    const html = injectProductGrid(ctx, accueilSeul, produits, "var(--site-accent)", categories);
    return NextResponse.json({ html, ...avertissements });
  } catch (err) {
    const refus = reponseLimiteIa(err);
    if (refus) return refus;
    if (err instanceof HtmlTronqueError) {
      console.error("[generate-site] (mode boutique)", err.message);
      return NextResponse.json({ error: ERREUR_HTML_TRONQUE, code: "generation_truncated" }, { status: 502 });
    }
    console.error("[generate-site] Erreur Anthropic complète (mode boutique) :", err);
    if (err instanceof Error) {
      console.error("[generate-site] Message :", err.message);
      console.error("[generate-site] Stack :", err.stack);
    }
    return NextResponse.json(
      { error: "Erreur lors de la génération du site boutique", code: "generation_failed" },
      { status: 500 }
    );
  } finally {
    await suivi.enregistrer();
  }
}
