import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { blocAvisPrompt, validerAvis } from "../lib/avis-produit";
import { SYSTEM_GENERATION_SITE } from "../lib/cadre-createur-site";
import { EXPERT_MODELS, type ExpertModel } from "../lib/expert-pricing";
import { contexteSite, langueSite, prixSite } from "../lib/site-textes";
import { assemblerPagesProduit } from "../lib/site-builder-pages";
import { blocConsignesStyle, validerFicheStyle } from "../lib/style-fiche";
import type { AppLocale } from "../lib/locale";

// Test isolé : compare Claude Fable 5.2 et Claude Opus 5.5 sur la génération d'un site, sans
// passer par les routes de production. Chaque lancement consomme de vrais tokens. Le prompt est
// recopié de app/api/generate-site/route.ts : à reporter ici si la route change.
//
//   npx tsx scripts/test-modeles-expert.ts               prompt de la route
//   npx tsx scripts/test-modeles-expert.ts --multipage   ajoute la demande d'un site de 5 pages
//   npx tsx scripts/test-modeles-expert.ts --effort=low  effort low, medium ou high (high par défaut)
//   npx tsx scripts/test-modeles-expert.ts --apercu      affiche le prompt, sans appel à l'API

const DOSSIER_SORTIE = ".tests-modeles";
const MAX_TOKENS = 64000;
const MAX_TENTATIVES = 4;
// Effort identique pour comparer à armes égales : sans ce réglage, Fable 5.2 tourne en "high"
// et Opus 5.5 en "medium".
const EFFORTS = ["low", "medium", "high"] as const;
const EFFORT = EFFORTS.find((effort) => process.argv.includes(`--effort=${effort}`)) ?? "high";
const MULTIPLICATEUR_ECRITURE_CACHE = 1.25;
const MULTIPAGE = process.argv.includes("--multipage");

const IA_BG = "#0a0a0f";
const IA_TEXT = "#f0f0f8";
const IA_TEXT_MUTED = "rgba(240,240,248,.6)";
const IA_CARD_BG = "rgba(255,255,255,.04)";
const IA_CARD_BORDER = "rgba(255,255,255,.1)";

type ProduitTest = {
  productName: string;
  description: string;
  colorPrimary: string;
  colorSecondary: string;
  colorAccent: string;
  style: string;
  imageUrl: string;
  rating: string;
  salePrice: string;
  originalPrice: string;
  corrections?: string[];
  langue?: string;
  ficheStyle?: unknown;
  avis?: unknown;
};

const PRODUIT: ProduitTest = {
  productName: "Ceinture Chauffante Lombaire",
  description:
    "Ceinture chauffante et vibrante pour soulager le bas du dos, sans fil, avec 3 niveaux de chaleur et une batterie rechargeable.",
  colorPrimary: "#7c3aed",
  colorSecondary: "#1a0533",
  colorAccent: "#f59e0b",
  style: "premium",
  imageUrl: "",
  rating: "4.8",
  salePrice: "49.90",
  originalPrice: "79.90",
};

const CONSIGNE_MULTIPAGE = `

SITE MULTIPAGE (prioritaire sur toute consigne contraire ci-dessus) : génère un site complet de 5 pages, chacune étant un fichier HTML standalone complet de <!DOCTYPE html> à </html> :
- index.html : la page décrite ci-dessus ;
- produit.html : fiche détaillée du produit (caractéristiques, utilisation, contenu du colis) ;
- a-propos.html : présentation de la marque ;
- faq.html : au moins 8 questions fréquentes ;
- contact.html : formulaire de contact et informations de livraison et de retour.
Toutes les pages partagent la même navbar, avec des liens relatifs vers les 5 pages, le même style et le même footer. Sur les pages autres que index.html, les boutons CTA pointent vers "index.html#commander".
Écris chaque page à la suite, précédée d'une ligne contenant exactement : <!-- FICHIER: nom.html -->`;

function buildColorTokensCss(tokens: Record<string, string>): string {
  return `:root{${Object.entries(tokens).map(([k, v]) => `${k}:${v};`).join("")}}`;
}


function injectColorTokens(html: string, tokens: Record<string, string>): string {
  const css = buildColorTokensCss(tokens);
  return html.includes("</style>") ? html.replace("</style>", `${css}\n</style>`) : html;
}

// ─── Recopié de app/api/generate-site/route.ts ──────────────────────────────

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

async function buildPrompt(body: ProduitTest) {
  const { productName, description, colorPrimary, colorSecondary, colorAccent, style, imageUrl, rating, salePrice, originalPrice, corrections } = body;
  const langue = langueSite(body.langue);
  const ctx = await contexteSite(langue);
  // Prix tels qu'affichés dans la langue du site (« 29,99 € », « €29.99 »).
  const prixVenteTxt = salePrice ? prixSite(salePrice, langue) : "";
  const prixBarreTxt = originalPrice ? prixSite(originalPrice, langue) : "";
  const consignesStyle = consignesStyleDepuis(body.ficheStyle);
  const promptUtilisateur = promptUtilisateurDe(body);
  // Avis réels lus sur des captures (app/api/avis-capture/route.ts), revalidés ici : seuls
  // les 4 et 5 étoiles passent. Absents : prompt inchangé.
  const avis = validerAvis(body.avis);

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

ANIMATIONS PAR DÉFAUT (base minimale : le prompt peut en demander de bien plus riches, voir ANIMATIONS ET EFFETS ; ROBUSTESSE DES ANIMATIONS s'applique toujours) :
- Apparition au défilement : sections et cartes .reveal révélées en fondu avec translateY(20px) → 0 (transition 0.6s) quand elles entrent à l'écran (IntersectionObserver), avec un léger décalage entre les cartes d'une même grille.
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

INTERDIT (NON NÉGOCIABLE) : noms de marques, journaux, magazines, médias, célébrités, plateformes e-commerce (AliExpress, Amazon, etc.). Aucun avis client inventé, aucun nom fictif, aucune citation fabriquée${avis.length > 0 ? " : les seuls avis autorisés sont ceux de la section AVIS CLIENTS ci-dessous" : ""}.
AUCUN CHIFFRE NON FOURNI (NON NÉGOCIABLE) : n'écris jamais un délai (livraison, réponse du support, durée, garantie), un pourcentage, une note, un avis compté ou une quantité qui ne figure pas explicitement dans les données ci-dessus. Si une information chiffrée te manque, reformule sans chiffre (« livraison rapide », « support réactif », « paiement sécurisé ») plutôt que d'inventer une valeur plausible.
${blocAvisPrompt(avis, NOMS_LANGUE[langue])}${consignesStyle}${correctionsList.length > 0 ? `
POINTS À CORRIGER PAR RAPPORT À UN AUDIT PRÉCÉDENT (prioritaire — cette page a déjà été générée une première fois et auditée par un expert CRO/UX ; corrige spécifiquement chacun de ces points dans cette nouvelle version, en plus de respecter toutes les règles ci-dessus) :
${correctionsList.map((c) => `- ${c}`).join("\n")}
` : ""}
${RAPPEL_PRIORITES}

Réponds UNIQUEMENT avec le code HTML, sans explication ni balise markdown.`;

  return { prompt: MULTIPAGE ? prompt + CONSIGNE_MULTIPAGE : prompt, colorTokens, ctx };
}

// ─── Test ───────────────────────────────────────────────────────────────────

function decouperPages(texte: string): { nom: string; html: string }[] {
  const nettoye = texte.replace(/^```(?:html)?\n?/gm, "").replace(/^```\s*$/gm, "");
  const morceaux = nettoye.split(/<!--\s*FICHIER:\s*([\w-]+\.html)\s*-->/);
  if (morceaux.length === 1) return [{ nom: "index.html", html: nettoye.trim() }];
  const pages: { nom: string; html: string }[] = [];
  for (let i = 1; i < morceaux.length; i += 2) {
    pages.push({ nom: morceaux[i], html: morceaux[i + 1].trim() });
  }
  return pages;
}

async function generer(client: Anthropic, model: ExpertModel, prompt: string, colorTokens: Record<string, string>, ctx: Awaited<ReturnType<typeof contexteSite>>) {
  const { apiId, inputUsdParMillion, outputUsdParMillion, cacheLectureUsdParMillion } = EXPERT_MODELS[model];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
  const debut = Date.now();
  let texte = "";
  let tokensEntree = 0;
  let cacheEcriture = 0;
  let cacheLecture = 0;
  let tokensSortie = 0;
  let tokensReflexion: number | null = null;
  let tentatives = 0;
  let stopReason: string | null = null;

  while (tentatives < MAX_TENTATIVES) {
    tentatives++;
    const stream = client.messages.stream({
      model: apiId,
      max_tokens: MAX_TOKENS,
      output_config: { effort: EFFORT },
      system: [{ type: "text", text: SYSTEM_GENERATION_SITE, cache_control: { type: "ephemeral" } }],
      messages,
    });
    const message = await stream.finalMessage();

    const { usage } = message;
    tokensEntree += usage.input_tokens;
    cacheEcriture += usage.cache_creation_input_tokens ?? 0;
    cacheLecture += usage.cache_read_input_tokens ?? 0;
    tokensSortie += usage.output_tokens;
    const reflexion = usage.output_tokens_details?.thinking_tokens;
    if (typeof reflexion === "number") tokensReflexion = (tokensReflexion ?? 0) + reflexion;
    stopReason = message.stop_reason;

    if (stopReason === "refusal") break;
    for (const block of message.content) {
      if (block.type === "text") texte += block.text;
    }
    if (stopReason !== "max_tokens") break;

    // Historique en ajout seul : les blocs de réflexion sont renvoyés tels quels, comme l'exige
    // la vérification d'historique de Fable 5.2 et d'Opus 5.5.
    messages.push({ role: "assistant", content: message.content });
    messages.push({
      role: "user",
      content:
        "Continue exactement là où tu t'es arrêté dans le code HTML. Reprends immédiatement au caractère suivant sans répéter ce qui précède, sans aucune explication ni balise markdown.",
    });
  }

  const dossier = path.join(DOSSIER_SORTIE, `${apiId}-${EFFORT}${MULTIPAGE ? "-multipage" : ""}`);
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, "reponse-brute.txt"), texte);
  const pages = decouperPages(texte);
  for (const page of pages) {
    fs.writeFileSync(path.join(dossier, page.nom), injectColorTokens(page.html, colorTokens));
  }
  const pagesLegales = MULTIPAGE ? null : assemblerPagesProduit(injectColorTokens(pages[0]?.html ?? "", colorTokens), ctx);

  return {
    Modèle: apiId,
    Effort: EFFORT,
    "Tokens entrée": tokensEntree + cacheEcriture + cacheLecture,
    "Dont cache": cacheEcriture + cacheLecture,
    "Tokens sortie": tokensSortie,
    "Dont réflexion": tokensReflexion ?? "n/d",
    "Coût ($)": (
      ((tokensEntree + cacheEcriture * MULTIPLICATEUR_ECRITURE_CACHE) * inputUsdParMillion +
        cacheLecture * cacheLectureUsdParMillion +
        tokensSortie * outputUsdParMillion) /
      1_000_000
    ).toFixed(2),
    "Durée (s)": Math.round((Date.now() - debut) / 1000),
    Requêtes: tentatives,
    Fin: stopReason,
    Pages: pagesLegales ? Object.keys(pagesLegales).length : pages.length,
    Dossier: dossier,
  };
}

async function main() {
  const { prompt, colorTokens, ctx } = await buildPrompt(PRODUIT);

  if (process.argv.includes("--apercu")) {
    console.log(SYSTEM_GENERATION_SITE);
    console.log("\n──────────\n");
    console.log(prompt);
    console.log(`\n${prompt.length} caractères, ${Object.keys(colorTokens).length} tokens CSS`);
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY manquante : ajoute-la dans .env.local.");
  }

  const client = new Anthropic();
  const resultats = [];

  for (const model of Object.keys(EXPERT_MODELS) as ExpertModel[]) {
    console.log(`Génération avec ${EXPERT_MODELS[model].apiId}…`);
    try {
      resultats.push(await generer(client, model, prompt, colorTokens, ctx));
    } catch (error) {
      console.error(`Échec avec ${EXPERT_MODELS[model].apiId} :`, error instanceof Error ? error.message : error);
    }
    if (resultats.length) console.table(resultats);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
