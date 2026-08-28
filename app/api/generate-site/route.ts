import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, currentMonthKey } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { grilleStyles, productGridSection, produitsCheckoutScripts, type ProduitBoutique } from "@/lib/site-templates";

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

// Appelle Claude avec relance automatique si la réponse est tronquée (max_tokens) — logique
// partagée entre le mode produit unique et le mode boutique, seul le prompt initial diffère.
async function generateHtmlViaClaude(prompt: string): Promise<string> {
  type Msg = { role: "user" | "assistant"; content: string };
  const msgs: Msg[] = [{ role: "user", content: prompt }];
  let html = "";

  for (let attempt = 0; attempt < 4; attempt++) {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      messages: msgs,
    });

    let chunk = "";
    stream.on("text", (text) => {
      chunk += text;
    });

    const finalMessage = await stream.finalMessage();
    html += chunk;

    console.log(
      `[generate-site] Attempt ${attempt + 1}: stop_reason=${finalMessage.stop_reason}, chunk=${chunk.length} chars, total=${html.length} chars`
    );

    if (finalMessage.stop_reason !== "max_tokens") break;

    msgs.push({ role: "assistant", content: chunk });
    msgs.push({
      role: "user",
      content:
        "Continue exactement là où tu t'es arrêté dans le code HTML. Reprends immédiatement au caractère suivant sans répéter ce qui précède, sans aucune explication ni balise markdown.",
    });
  }

  return html;
}

// Injecte la grille de produits (construite déterministiquement, voir lib/site-templates.ts)
// dans la coquille générée par Claude en mode boutique — celui-ci ne connaît que le nom de
// la boutique et son propos général, jamais le détail des produits (prix/images exacts),
// pour éviter qu'il invente ou déforme des données réelles. Repli par simple insertion avant
// </style>/</body> si Claude n'a pas laissé les marqueurs demandés tels quels.
function injectProductGrid(html: string, produits: ProduitBoutique[], accent: string): string {
  const gridCss = grilleStyles(accent, IA_CARD_BG, IA_CARD_BORDER, IA_TEXT, IA_TEXT_MUTED);
  const gridHtml = productGridSection(produits, accent, "Commander");
  const gridScripts = produitsCheckoutScripts(produits);

  let result = html.includes("/* GRILLE_PRODUITS_CSS */")
    ? html.replace("/* GRILLE_PRODUITS_CSS */", gridCss)
    : html.replace("</style>", `${gridCss}\n</style>`);

  result = result.includes("<!-- GRILLE_PRODUITS -->")
    ? result.replace("<!-- GRILLE_PRODUITS -->", gridHtml)
    : result.replace("</body>", `${gridHtml}\n</body>`);

  return result.replace("</body>", `${gridScripts}\n</body>`);
}

export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserAndPlan();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour générer une landing page." }, { status: 401 });
  }

  // Garde-fou technique indépendant du quota métier (sitesParMoisMax, illimité en Pro/
  // Agency) : chaque appel déclenche un appel Claude facturé, donc même un plan illimité
  // ne doit pas pouvoir enchaîner des centaines de générations d'affilée (script, compte
  // compromis...).
  if (!checkRateLimit(`generate-site:${user.id}`, { max: 10, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de générations en peu de temps. Réessaie dans quelques minutes." },
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
      .gte("created_at", debutMois);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    if ((count ?? 0) >= maxSites) {
      return NextResponse.json(
        {
          error: `Tu as atteint la limite de ${maxSites} sites générés ce mois-ci sur le plan ${planLabel(plan)}. Passe Pro pour un accès illimité.`,
        },
        { status: 403 }
      );
    }
  }

  const body = await request.json();

  // Mode boutique (plusieurs produits, voir app/site-builder/{page.tsx,TemplateEditor.tsx})
  // — payload distingué par la présence d'un tableau produits, branché ici avant la
  // validation productName/description (propre au mode produit unique, inchangée ci-dessous).
  if (Array.isArray(body.produits)) {
    return handleGenerateBoutique(body);
  }

  const { productName, description, colorPrimary, colorSecondary, colorAccent, style, imageUrl, rating, orders, salePrice, originalPrice } = body;

  const imageInstruction = imageUrl
    ? `\nImage du produit : une balise <img src="${imageUrl}" alt="${productName}" style="max-width:100%;max-height:420px;object-fit:contain;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.18);"> doit apparaître de façon prominente dans la section hero, centrée ou côte à côte avec le texte.`
    : "\nPas d'image fournie : utilise un placeholder visuel stylé (gradient ou icône SVG) dans la section hero.";

  if (!productName || !description) {
    return NextResponse.json(
      { error: "productName et description sont requis" },
      { status: 400 }
    );
  }

  const primaryColor   = colorPrimary   || "#7c3aed";
  const secondaryColor = colorSecondary || "#1a0533";
  const accentColor    = colorAccent    || "#f59e0b";

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
   Chaque stat : grand chiffre ou texte en couleur brand, label en dessous, fond rgba(255,255,255,0.04), bordure rgba(255,255,255,0.08), padding généreux. Aucun nom de personne, aucune citation, aucun avis inventé.`;

  const prompt = `Tu es un développeur front-end expert. Génère une landing page HTML standalone complète et fonctionnelle pour le produit suivant.

PRODUIT : ${productName}
DESCRIPTION : ${description}
COULEURS : ${style === "auto" ? "À déterminer par toi selon le produit (choisis une palette cohérente de 3 couleurs)" : `Principale: ${primaryColor} | Secondaire: ${secondaryColor} | Accent: ${accentColor}`}
STYLE & TON : ${stylePrompt}
PRIX : ${salePrice ? `Prix de vente affiché : ${salePrice}€${originalPrice ? ` — Prix barré : ${originalPrice}€` : ""}. Affiche EXACTEMENT ces prix dans le hero et le CTA final. Prix barré rendu en <span style="text-decoration:line-through;opacity:0.5">${originalPrice}€</span> suivi du prix de vente en gros et en couleur brand. NE PAS inventer d'autres prix.` : "Aucun prix fourni : n'affiche aucun prix dans le HTML."}
${imageInstruction}

SECTIONS (dans cet ordre) :

1. NAVBAR sticky — logo texte à gauche, bouton CTA à droite. Fond transparent → semi-transparent au scroll (JS scrollY).

2. HERO (100vh) — fond dégradé animé linear-gradient(135deg, ${primaryColor}, ${accentColor}). Titre H1 Playfair Display, sous-titre Inter, badge "Édition Limitée" (couleur accent ${accentColor}), bouton CTA principal (couleur principale ${primaryColor}).
${imageUrl
  ? `Image hero : <img class="product-image-hero" src="${imageUrl}" alt="${productName}" style="max-width:480px;width:100%;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.5)"> affichée en split-screen à droite du texte (flex row, gap 60px). Sur mobile : image en dessous du texte.`
  : "Bloc visuel coloré avec icône SVG simple en placeholder."}

3. BÉNÉFICES — minimum 6 cartes (grille 3×2 sur desktop, 1 colonne mobile). Chaque carte : icône SVG inline pertinent au produit, titre court percutant, texte de 2-3 lignes avec argument concret et spécifique basé sur "${productName}" et sa description. Fond rgba(255,255,255,0.05), bordure rgba(255,255,255,0.1). Hover : translateY(-4px) + box-shadow. Les bénéfices doivent être 100% liés au produit réel, pas génériques.

4. DESCRIPTION PRODUIT — section en deux colonnes (desktop) : colonne gauche = texte détaillé avec caractéristiques techniques (liste à puces avec icône ✓, minimum 6 points), paragraphe de présentation approfondie basé sur la description fournie ; colonne droite = ${imageUrl ? `<img class="product-image-detail" src="${imageUrl}" alt="${productName} — détail" style="width:100%;max-width:420px;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.4)">` : "bloc avec gradient et caractéristiques visuelles"}. Sur mobile : colonnes empilées.

${socialProofSection}

${imageUrl ? `6. GALERIE PRODUIT — 3 cartes côte à côte présentant le même produit sous des angles différents :
   • Carte 1 : <img class="product-image-gallery-1" src="${imageUrl}" alt="${productName} — vue principale" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px"> + légende "Vue principale"
   • Carte 2 : <img class="product-image-gallery-2" src="${imageUrl}" alt="${productName} — en situation" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;filter:brightness(1.05) contrast(1.05)"> + légende "En situation"
   • Carte 3 : <img class="product-image-gallery-3" src="${imageUrl}" alt="${productName} — zoom détail" style="width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:12px;object-position:center;transform:scale(1.08);overflow:hidden"> + légende "Détail"
   Chaque carte : fond rgba(255,255,255,0.03), bordure rgba(255,255,255,0.08), overflow:hidden, hover scale(1.02). Sur mobile : grille 1 colonne.` : ""}

${imageUrl ? "7." : "6."} CTA FINAL — section pleine largeur, fond dégradé linear-gradient(135deg, ${primaryColor}, ${secondaryColor}).${imageUrl ? ` Image produit <img class="product-image-cta" src="${imageUrl}" alt="${productName}" style="max-width:320px;width:100%;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,0.5);margin:0 auto 32px;display:block"> affichée au-dessus du titre.` : ""} Titre Playfair Display, bouton blanc, texte garantie 30 jours.${salePrice ? ` Affiche le prix : ${originalPrice ? `<span style="text-decoration:line-through;opacity:0.5">${originalPrice}€</span> ` : ""}<strong style="font-size:2rem">${salePrice}€</strong>.` : ""}

${imageUrl ? "8." : "7."} FOOTER — logo texte, liens légaux (Mentions légales, CGV, Confidentialité), copyright. 1 ligne simple.

TYPOGRAPHIE :
- Google Fonts : Playfair Display (700) + Inter (400, 600)
- H1 : clamp(2.2rem, 5vw, 4rem), Playfair Display
- H2 : clamp(1.6rem, 3vw, 2.4rem), Playfair Display
- Body : Inter

COULEURS :
- Fond global : #0a0a0f
- Texte : #f0f0f8 · Texte secondaire : rgba(240,240,248,0.55)
- Couleur principale (CTA, boutons, accents forts, liens hover) : ${primaryColor}
- Couleur secondaire (fonds de sections alternées : utiliser rgba(${secondaryColor.replace("#","")},0.15) ou directement ${secondaryColor} en bg semi-transparent) : ${secondaryColor}
- Couleur accent (badges, icônes, étoiles, détails, hover cards) : ${accentColor}
- Cards : rgba(255,255,255,0.04)
- Glow CTA : box-shadow 0 0 32px ${primaryColor}55
- Dégradé hero : linear-gradient(135deg, ${primaryColor}, ${accentColor})

ANIMATIONS (simples uniquement) :
- Fade-in au chargement : les éléments .reveal ont TOUJOURS opacity:1 et transform:none dans le CSS — ils sont visibles par défaut. Au chargement de la page, JS applique d'abord opacity:0 + translateY(20px) sur tous les .reveal, puis avec setTimeout décalé (100ms, 200ms, 300ms… par index) remet opacity:1 + translateY(0) + transition:0.5s. NE PAS utiliser IntersectionObserver (non fiable en iframe).
- Hover bouton : scale(1.03), transition 0.2s
- Fond hero : @keyframes gradientShift sur background-position (10s infinite)
- Navbar : opacity/background au scroll

TECHNIQUE :
- HTML standalone, tout CSS dans <style>, tout JS dans <script> avant </body>
- Responsive : media query 768px
- scroll-behavior: smooth
- Boutons CTA pointent vers "#commander"
- Textes en français, copywriting persuasif, aucun Lorem Ipsum
- Code COMPLET de <!DOCTYPE html> à </html>

RÈGLES UX & CONVERSION OBLIGATOIRES (Nielsen Norman Group / Unbounce / McKinsey) :
Ces règles sont non négociables. La page sera auditée sur ces critères précis.

- HIÉRARCHIE VISUELLE : le H1 est l'élément visuellement dominant, immédiatement visible à l'ouverture sans aucun scroll. Taille minimale 3rem. Structure de lecture en Z : H1 en haut à gauche → image en haut à droite → bénéfices au centre → CTA en bas. Pas d'éléments décoratifs qui concurrencent le titre principal.

- ESPACE BLANC GÉNÉREUX : padding vertical minimum 80px entre les sections. Maximum ~40% de la surface de chaque section occupée par du contenu visible. Les éléments doivent "respirer" : ne pas surcharger avec trop de blocs côte à côte.

- TYPOGRAPHIE STRICTE : exactement 2 polices (Playfair Display + Inter), exactement 3 niveaux de taille utilisés (H1 clamp(2.5rem,5vw,4rem) · H2 clamp(1.6rem,3vw,2.4rem) · body 1rem/1.05rem). Aucune taille intermédiaire inventée.

- CTA UNIQUE ET CONTRASTÉ : un seul bouton CTA principal par section, couleur ${primaryColor} très contrastée sur fond sombre, visible IMMÉDIATEMENT sans scroll dans le hero. Texte du CTA orienté bénéfice et action : exemples valides "Obtenir le mien", "Je veux ce produit", "Commander maintenant${salePrice ? ` — ${salePrice}€` : ""}". INTERDIT d'utiliser simplement "Acheter" ou "En savoir plus".

- PRIX DANS LE HERO : ${salePrice ? `le prix ${salePrice}€ DOIT apparaître en GROS dans la section hero (font-size ≥ 2rem, couleur ${accentColor} ou blanc, font-weight 800) ET sur le bouton CTA final. Ne pas enterrer le prix hors du viewport initial.` : "aucun prix fourni : n'invente aucun prix."}

- PHRASES COURTES (niveau CM1-CM2) : tout le copywriting utilise des phrases de MOINS DE 12 MOTS. Vocabulaire courant, mots de tous les jours. Préfère les listes à puces aux paragraphes denses. Les bénéfices sont formulés en résultats chiffrés concrets ("économise 2h par semaine", "résultats en 7 jours") et jamais en vagues qualités ("haute qualité", "excellent produit").

- PREUVES SOCIALES CHIFFRÉES : tous les badges et stats de preuve sociale contiennent des chiffres précis. Exemples valides : "4.8/5 étoiles", "Livraison en 5 à 7 jours", "Garantie satisfait ou remboursé 30 jours", "Paiement 100% sécurisé". Interdit : formulations sans chiffres comme "qualité garantie" ou "livraison rapide".

- IMAGE PRODUIT DOMINANTE : ${imageUrl ? `l'image <img src="${imageUrl}"> doit être visible IMMÉDIATEMENT à l'ouverture de la page (above the fold dans le hero), taille minimum 300px de large, clairement mise en valeur. Ne pas la réduire, la cacher derrière du texte, ou la pousser sous la ligne de flottaison.` : "pas d'image fournie : utilise un bloc visuel stylé (SVG ou gradient) en placeholder."}

INTERDIT : noms de marques, journaux, magazines, médias, célébrités, plateformes e-commerce (AliExpress, Amazon, etc.). Aucun avis client inventé, aucun nom fictif, aucune citation fabriquée.

Réponds UNIQUEMENT avec le code HTML, sans explication ni balise markdown.`;

  try {
    const html = await generateHtmlViaClaude(prompt);
    return NextResponse.json({ html });
  } catch (err) {
    console.error("[generate-site] Erreur Anthropic complète :", err);
    if (err instanceof Error) {
      console.error("[generate-site] Message :", err.message);
      console.error("[generate-site] Stack :", err.stack);
    }
    const errObj = err as Record<string, unknown>;
    if (errObj?.status) console.error("[generate-site] HTTP status :", errObj.status);
    if (errObj?.error)  console.error("[generate-site] Détail API :", JSON.stringify(errObj.error));
    return NextResponse.json(
      { error: "Erreur lors de la génération de la landing page" },
      { status: 500 }
    );
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
async function handleGenerateBoutique(body: {
  nomBoutique?: string;
  descriptionBoutique?: string;
  produits?: ProduitBoutique[];
  colorPrimary?: string;
  colorSecondary?: string;
  colorAccent?: string;
  style?: string;
}): Promise<NextResponse> {
  const { nomBoutique, descriptionBoutique, produits, colorPrimary, colorSecondary, colorAccent, style } = body;

  if (!nomBoutique || !Array.isArray(produits) || produits.length === 0) {
    return NextResponse.json(
      { error: "nomBoutique et au moins un produit sont requis" },
      { status: 400 }
    );
  }

  const primaryColor   = colorPrimary   || "#7c3aed";
  const secondaryColor = colorSecondary || "#1a0533";
  const accentColor    = colorAccent    || "#f59e0b";

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
    .map((p) => `- ${p.nom}${p.prixVente ? ` (${p.prixVente}€)` : ""}`)
    .join("\n");

  const prompt = `Tu es un développeur front-end expert. Génère la COQUILLE HTML d'une page catalogue pour la boutique en ligne suivante — un système externe insère la grille de produits à ta place, tu ne dois JAMAIS écrire toi-même de fiche produit détaillée.

BOUTIQUE : ${nomBoutique}
DESCRIPTION : ${descriptionBoutique || "Boutique en ligne généraliste."}
NOMBRE DE PRODUITS DANS LA BOUTIQUE : ${produits.length}
APERÇU (pour inspirer le ton uniquement — ne décris jamais ces produits en détail, ni leur prix exact) :
${apercuProduits}

COULEURS (fixes, ne pas dévier) : Principale ${primaryColor} | Secondaire ${secondaryColor} | Accent ${accentColor}
STYLE & TON : ${stylePrompt}

SECTIONS (dans cet ordre, RIEN D'AUTRE) :

1. NAVBAR sticky — logo texte "${nomBoutique}" à gauche, bouton CTA "Voir les produits" à droite (ancre href="#produits"). Fond transparent → semi-transparent au scroll (JS scrollY).

2. HERO (80vh) — fond dégradé animé linear-gradient(135deg, ${primaryColor}, ${accentColor}). Titre H1 = accroche de la boutique dans son ensemble (jamais le nom d'un produit précis), sous-titre = reformulation persuasive de la description en 1-2 phrases. Bouton CTA vers #produits.

3. CONFIANCE — section avec 4 stats visuelles en grille : "🚚 Livraison rapide & sécurisée", "🔒 Paiement 100% sécurisé", "↩ Satisfait ou remboursé 30 jours", "💬 Support client réactif". Fond rgba(255,255,255,0.04), bordure rgba(255,255,255,0.08).

4. Sur sa propre ligne, EXACTEMENT ce commentaire HTML, sans rien avant ni après, sans l'expliquer ni le modifier :
<!-- GRILLE_PRODUITS -->

5. FOOTER — logo texte, liens légaux (Mentions légales, CGV, Confidentialité), copyright. 1 ligne simple.

TYPOGRAPHIE :
- Google Fonts : Playfair Display (700) + Inter (400, 600)
- H1 : clamp(2.2rem, 5vw, 4rem), Playfair Display · H2 : clamp(1.6rem, 3vw, 2.4rem), Playfair Display · Body : Inter

COULEURS DE BASE (fixes, ne pas dévier — la grille injectée s'y cale) :
- Fond global : ${IA_BG} · Texte : ${IA_TEXT} · Texte secondaire : ${IA_TEXT_MUTED}

ANIMATIONS (simples uniquement) :
- Fade-in au chargement : éléments .reveal opacity:1/transform:none par défaut dans le CSS ; JS applique opacity:0+translateY(20px) au chargement puis setTimeout décalé (100/200/300ms) remet l'état normal avec transition 0.5s. Pas d'IntersectionObserver (non fiable en iframe).
- Hover bouton : scale(1.03). Fond hero : @keyframes gradientShift sur background-position (10s infinite). Navbar : opacity/background au scroll.

TECHNIQUE :
- HTML standalone, tout CSS dans un unique <style>, tout JS dans un <script> avant </body>.
- Juste avant la fermeture </style>, sur sa propre ligne, EXACTEMENT ce commentaire CSS, sans rien avant ni après :
/* GRILLE_PRODUITS_CSS */
- Responsive (media query 768px), scroll-behavior: smooth.
- Textes en français, copywriting persuasif, aucun Lorem Ipsum.
- Code COMPLET de <!DOCTYPE html> à </html>.

INTERDIT : décrire, nommer, chiffrer ou lister un produit précis de la boutique (tu ne connais que l'aperçu ci-dessus, à titre de contexte uniquement) ; noms de marques, journaux, magazines, médias, célébrités, plateformes e-commerce (AliExpress, Amazon, etc.) ; avis client inventé, nom fictif, citation fabriquée.

Réponds UNIQUEMENT avec le code HTML, sans explication ni balise markdown.`;

  try {
    const rawHtml = await generateHtmlViaClaude(prompt);
    const html = injectProductGrid(rawHtml, produits, primaryColor);
    return NextResponse.json({ html });
  } catch (err) {
    console.error("[generate-site] Erreur Anthropic complète (mode boutique) :", err);
    if (err instanceof Error) {
      console.error("[generate-site] Message :", err.message);
      console.error("[generate-site] Stack :", err.stack);
    }
    return NextResponse.json(
      { error: "Erreur lors de la génération du site boutique" },
      { status: 500 }
    );
  }
}
