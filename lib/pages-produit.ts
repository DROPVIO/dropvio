// Page produit et page d'achat des sites boutique (Site Builder, mode boutique).
//
// L'IA dessine une seule fois, au design du site, le gabarit de la page produit et celui de la
// page d'achat (app/api/generate-site/route.ts) ; le code les remplit avec les vraies données,
// jamais l'IA (aucun prix ni texte inventé). Une seule page « produit » sert tous les produits :
// le produit affiché est celui choisi dans une grille (lien data-dv-produit), retrouvé par
// window.__dvSelection (site en un fichier), sessionStorage (pages séparées : hébergement,
// Shopify), window.DV_SELECTION (aperçu du Site Builder) ou ?p= dans l'adresse.
//
// Les éléments à remplir portent un attribut data-dv : voir ATTRIBUTS_PRODUIT / ATTRIBUTS_COMMANDE.
import type Anthropic from "@anthropic-ai/sdk";
import { escapeHtml } from "@/lib/site-templates";
import { tokensEstimes, type SuiviBudgetIa } from "@/lib/ai-budget";
import type { SiteCtx } from "@/lib/site-textes";
import { toIntlTag } from "@/lib/locale";
import type { ProduitBoutique } from "@/lib/site-templates";

export const CLE_PRODUIT = "produit";
export const CLE_COMMANDE = "commande";

export type GabaritsPages = { css: string; produit: string; commande: string };

// Attributs que l'IA doit placer (obligatoires) ou peut placer (facultatifs).
export const ATTRIBUTS_PRODUIT = {
  obligatoires: ["image", "nom", "prix", "quantite", "moins", "plus", "total", "acheter"],
  facultatifs: ["prix-barre", "description", "collection"],
} as const;
export const ATTRIBUTS_COMMANDE = {
  obligatoires: ["recap-nom", "recap-quantite", "recap-total", "formulaire"],
  facultatifs: ["recap-image", "recap-prix-unitaire", "recap-moins", "recap-plus"],
} as const;

export const SCHEMA_GABARITS = {
  type: "object",
  properties: {
    css: { type: "string" },
    produit: { type: "string" },
    commande: { type: "string" },
  },
  required: ["css", "produit", "commande"],
  additionalProperties: false,
};

const aAttribut = (html: string, nom: string) => new RegExp(`\\bdata-dv=["']${nom}["']`).test(html);

/** Retire tout ce qui pourrait exécuter du code : les scripts sont fournis par le code. */
export function nettoyerGabarit(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(["'])[\s\S]*?\1/gi, "")
    .replace(/javascript:/gi, "");
}

/** Gabarits de l'IA s'ils contiennent tout ce que le code doit remplir, sinon null. */
export function gabaritsValides(g: Partial<GabaritsPages> | null | undefined): GabaritsPages | null {
  if (!g || typeof g.produit !== "string" || typeof g.commande !== "string") return null;
  const produit = nettoyerGabarit(g.produit);
  const commande = nettoyerGabarit(g.commande);
  if (!ATTRIBUTS_PRODUIT.obligatoires.every((a) => aAttribut(produit, a))) return null;
  if (!ATTRIBUTS_COMMANDE.obligatoires.every((a) => aAttribut(commande, a))) return null;
  return { css: typeof g.css === "string" ? g.css.replace(/<\/?style[^>]*>/gi, "") : "", produit, commande };
}

/** Gabarits de secours (code), au design du site par ses variables --site-*. */
export function gabaritsParDefaut(ctx: SiteCtx): GabaritsPages {
  const t = ctx.t.produitPage;
  return {
    css: `
  .dv-pp { padding:72px 0; }
  .dv-pp .wrap { max-width:1100px; margin:0 auto; padding:0 24px; }
  .dv-pp-retour { display:inline-block; margin-bottom:24px; color:var(--site-text-muted); text-decoration:none; font-size:var(--fs-small, .85rem); }
  .dv-pp-grille { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:48px; align-items:start; }
  .dv-pp-img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:20px; border:1px solid var(--site-border); background:var(--site-surface); }
  .dv-pp h1 { font-size:var(--fs-h2, 2rem); line-height:1.15; margin-bottom:12px; }
  .dv-pp-collection { display:inline-block; margin-bottom:12px; font-size:var(--fs-small, .8rem); letter-spacing:.08em; text-transform:uppercase; color:var(--site-accent); }
  .dv-pp-prix { display:flex; align-items:baseline; gap:12px; font-size:1.6rem; font-weight:700; color:var(--site-accent); margin:16px 0 20px; }
  .dv-pp-prix s { font-size:1rem; font-weight:400; color:var(--site-text-muted); }
  .dv-pp-desc { color:var(--site-text-muted); line-height:1.7; white-space:pre-line; margin-bottom:28px; }
  .dv-pp-qte { display:flex; align-items:center; gap:14px; margin-bottom:18px; }
  .dv-pp-qte button { width:40px; height:40px; border-radius:10px; border:1px solid var(--site-border); background:var(--site-surface); color:var(--site-text); font-size:1.2rem; cursor:pointer; }
  .dv-pp-total { margin-bottom:22px; color:var(--site-text-muted); }
  .dv-pp-acheter { display:inline-block; padding:16px 36px; border:none; border-radius:12px; background:var(--site-accent); color:#fff; font-weight:700; font-size:1rem; cursor:pointer; font-family:inherit; }
  .dv-pp-recap { display:flex; gap:20px; align-items:center; padding:20px; border:1px solid var(--site-border); border-radius:16px; background:var(--site-surface); margin-bottom:32px; }
  .dv-pp-recap img { width:96px; height:96px; object-fit:cover; border-radius:12px; }
  .dv-pp-form { max-width:560px; }`,
    produit: `<section id="${CLE_PRODUIT}" class="dv-pp"><div class="wrap">
  <a href="catalogue.html" class="dv-pp-retour">${escapeHtml(t.retourCatalogue)}</a>
  <div class="dv-pp-grille">
    <img data-dv="image" class="dv-pp-img" src="" alt="">
    <div>
      <span data-dv="collection" class="dv-pp-collection"></span>
      <h1 data-dv="nom"></h1>
      <div class="dv-pp-prix"><span data-dv="prix"></span><s data-dv="prix-barre"></s></div>
      <p data-dv="description" class="dv-pp-desc"></p>
      <div class="dv-pp-qte"><span>${escapeHtml(t.quantite)}</span><button type="button" data-dv="moins" aria-label="${escapeHtml(ctx.t.checkout.diminuer)}">−</button><strong data-dv="quantite">1</strong><button type="button" data-dv="plus" aria-label="${escapeHtml(ctx.t.checkout.augmenter)}">+</button></div>
      <p class="dv-pp-total">${escapeHtml(ctx.t.checkout.total)} <strong data-dv="total"></strong></p>
      <button type="button" data-dv="acheter" class="dv-pp-acheter">${escapeHtml(ctx.t.boutique.commander)}</button>
    </div>
  </div>
</div></section>`,
    commande: `<section id="${CLE_COMMANDE}" class="dv-pp"><div class="wrap">
  <a href="catalogue.html" class="dv-pp-retour">${escapeHtml(t.retourCatalogue)}</a>
  <h1>${escapeHtml(t.votreCommande)}</h1>
  <div class="dv-pp-recap">
    <img data-dv="recap-image" src="" alt="">
    <div><strong data-dv="recap-nom"></strong><p>${escapeHtml(t.quantite)} : <span data-dv="recap-quantite"></span> · <span data-dv="recap-prix-unitaire"></span></p><p>${escapeHtml(ctx.t.checkout.total)} <strong data-dv="recap-total"></strong></p></div>
  </div>
  <h3>${escapeHtml(ctx.t.checkout.titre)}</h3>
  <div data-dv="formulaire" class="dv-pp-form"></div>
</div></section>`,
  };
}

/** Formulaire de commande (le même que celui des cartes : livraison, paiement pas encore actif). */
function formulaireCommande(ctx: SiteCtx): string {
  const c = ctx.t.checkout;
  // Sans titre : la page d'achat dessinée par l'IA a déjà le sien (le gabarit de secours aussi).
  return `<div class="dv-checkout" style="display:block">
      <div class="dv-field"><label>${escapeHtml(c.nom)}</label><input type="text" placeholder="${escapeHtml(c.nomPlaceholder)}"></div>
      <div class="dv-field"><label>${escapeHtml(c.adresse)}</label><input type="text" placeholder="${escapeHtml(c.adressePlaceholder)}"></div>
      <div class="dv-field"><label>${escapeHtml(c.email)}</label><input type="email" placeholder="${escapeHtml(c.emailPlaceholder)}"></div>
      <button type="button" class="dv-pay-btn" disabled>${escapeHtml(c.paiement)}</button>
      <p class="dv-pay-note">${escapeHtml(c.paiementNote)}</p>
    </div>`;
}

const STYLES_FORMULAIRE = `
  .dv-checkout h3 { margin-bottom:16px; }
  .dv-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
  .dv-field input { padding:12px 14px; border-radius:10px; border:1px solid var(--site-border); background:var(--site-surface); color:var(--site-text); font:inherit; }
  .dv-pay-btn { width:100%; padding:14px; border:none; border-radius:12px; background:var(--site-accent); color:#fff; font-weight:700; opacity:.6; cursor:not-allowed; font-family:inherit; }
  .dv-pay-note { margin-top:10px; font-size:var(--fs-small, .8rem); color:var(--site-text-muted); }`;

/** Clé d'URL de chaque produit (unique), dans l'ordre des produits. */
export function slugsProduits(produits: ProduitBoutique[]): string[] {
  const pris = new Set<string>();
  return produits.map((p, i) => {
    const base =
      p.nom
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 60) || `produit-${i + 1}`;
    let slug = base;
    for (let n = 2; pris.has(slug); n++) slug = `${base}-${n}`;
    pris.add(slug);
    return slug;
  });
}

function donneesProduits(produits: ProduitBoutique[], slugs: string[], collectionDe: (p: ProduitBoutique) => string | null): string {
  const donnees = produits.map((p, i) => ({
    slug: slugs[i],
    nom: p.nom,
    description: p.description,
    image: p.image?.trim() || "",
    prix: parseFloat(p.prixVente) || 0,
    prixBarre: parseFloat(p.prixOriginal) || 0,
    collection: collectionDe(p),
  }));
  // « </ » échappé : le JSON ne peut pas fermer la balise <script> qui le contient.
  return `<script type="application/json" id="dv-produits">${JSON.stringify(donnees).replace(/<\//g, "<\\/")}</script>`;
}

// Choix d'un produit dans une grille : mémorisé avant la navigation (écouteur en capture sur
// window, déclenché avant celui de la navigation du site en un fichier). Ajouté à toutes les pages.
export const SCRIPT_SELECTION_PRODUIT = `<script>
(function () {
  if (window.__dvSelectionLiee) return;
  window.__dvSelectionLiee = true;
  window.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("[data-dv-produit]") : null;
    if (!a) return;
    var sel = { p: a.getAttribute("data-dv-produit"), q: parseInt(a.getAttribute("data-dv-quantite") || "1", 10) || 1 };
    window.__dvSelection = sel;
    try { sessionStorage.setItem("dv-selection", JSON.stringify(sel)); } catch (err) {}
    setTimeout(function () { window.dispatchEvent(new Event("dv-selection")); }, 0);
  }, true);
})();
</script>`;

function scriptPages(ctx: SiteCtx): string {
  return `<script>
(function () {
  if (window.__dvPagesProduit) return;
  window.__dvPagesProduit = true;
  var fmt = new Intl.NumberFormat(${JSON.stringify(toIntlTag(ctx.langue))}, { style: "currency", currency: "EUR" });
  function donnees() {
    var el = document.getElementById("dv-produits");
    try { return el ? JSON.parse(el.textContent) : []; } catch (e) { return []; }
  }
  function selection() {
    var s = window.__dvSelection || window.DV_SELECTION || null;
    if (!s) { try { s = JSON.parse(sessionStorage.getItem("dv-selection") || "null"); } catch (e) {} }
    if (!s) { var q = new URLSearchParams(location.search); if (q.get("p")) s = { p: q.get("p"), q: parseInt(q.get("q") || "1", 10) || 1 }; }
    return s || {};
  }
  function produitDe(sel, liste) {
    for (var i = 0; i < liste.length; i++) if (liste[i].slug === sel.p) return liste[i];
    return liste[0];
  }
  function els(zone, nom) { return zone.querySelectorAll('[data-dv="' + nom + '"]'); }
  function texte(zone, nom, valeur) { els(zone, nom).forEach(function (n) { n.textContent = valeur; }); }
  function visible(zone, nom, oui) { els(zone, nom).forEach(function (n) { n.style.display = oui ? "" : "none"; }); }
  function image(zone, nom, p) {
    els(zone, nom).forEach(function (n) {
      if (!p.image) { n.style.display = "none"; return; }
      n.style.display = "";
      if (n.tagName === "IMG") { n.src = p.image; n.alt = p.nom; } else { n.style.backgroundImage = "url(" + JSON.stringify(p.image) + ")"; }
    });
  }
  function rendre() {
    var liste = donnees();
    if (!liste.length) return;
    var sel = selection();
    var p = produitDe(sel, liste);
    var qte = Math.max(1, sel.p === p.slug ? sel.q || 1 : 1);
    document.querySelectorAll('[data-dv-zone="produit"]').forEach(function (zone) {
      zone.__qte = zone.__qte && zone.__slug === p.slug ? zone.__qte : 1;
      zone.__slug = p.slug;
      texte(zone, "nom", p.nom);
      texte(zone, "description", p.description || "");
      visible(zone, "description", !!p.description);
      texte(zone, "prix", fmt.format(p.prix));
      texte(zone, "prix-barre", p.prixBarre > p.prix ? fmt.format(p.prixBarre) : "");
      visible(zone, "prix-barre", p.prixBarre > p.prix);
      texte(zone, "collection", p.collection || "");
      visible(zone, "collection", !!p.collection);
      image(zone, "image", p);
      function maj() { texte(zone, "quantite", String(zone.__qte)); texte(zone, "total", fmt.format(p.prix * zone.__qte)); }
      maj();
      if (!zone.__lie) {
        zone.__lie = true;
        els(zone, "moins").forEach(function (b) { b.addEventListener("click", function () { if (zone.__qte > 1) { zone.__qte--; texte(zone, "quantite", String(zone.__qte)); texte(zone, "total", fmt.format(produitDe({ p: zone.__slug }, donnees()).prix * zone.__qte)); } }); });
        els(zone, "plus").forEach(function (b) { b.addEventListener("click", function () { zone.__qte++; texte(zone, "quantite", String(zone.__qte)); texte(zone, "total", fmt.format(produitDe({ p: zone.__slug }, donnees()).prix * zone.__qte)); }); });
        els(zone, "acheter").forEach(function (b) {
          b.addEventListener("click", function (e) {
            e.preventDefault();
            var lien = zone.querySelector('[data-dv="vers-commande"]');
            if (!lien) return;
            lien.setAttribute("data-dv-produit", zone.__slug);
            lien.setAttribute("data-dv-quantite", String(zone.__qte));
            lien.click();
          });
        });
      }
    });
    document.querySelectorAll('[data-dv-zone="commande"]').forEach(function (zone) {
      zone.__qte = zone.__slug === p.slug && zone.__qteVue === qte ? zone.__qte : qte;
      zone.__qteVue = qte;
      zone.__slug = p.slug;
      texte(zone, "recap-nom", p.nom);
      texte(zone, "recap-prix-unitaire", fmt.format(p.prix));
      image(zone, "recap-image", p);
      function maj() { texte(zone, "recap-quantite", String(zone.__qte)); texte(zone, "recap-total", fmt.format(p.prix * zone.__qte)); }
      maj();
      if (!zone.__lie) {
        zone.__lie = true;
        els(zone, "recap-moins").forEach(function (b) { b.addEventListener("click", function () { if (zone.__qte > 1) { zone.__qte--; rendreQte(zone); } }); });
        els(zone, "recap-plus").forEach(function (b) { b.addEventListener("click", function () { zone.__qte++; rendreQte(zone); }); });
      }
    });
  }
  function rendreQte(zone) {
    var p = produitDe({ p: zone.__slug }, donnees());
    texte(zone, "recap-quantite", String(zone.__qte));
    texte(zone, "recap-total", fmt.format(p.prix * zone.__qte));
  }
  window.addEventListener("dv-selection", rendre);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", rendre); else rendre();
})();
</script>`;
}

/** Insère le formulaire de commande dans l'élément data-dv="formulaire" du gabarit. */
function avecFormulaire(commande: string, ctx: SiteCtx): string {
  return commande.replace(
    /(<([a-z][a-z0-9]*)\b[^>]*\bdata-dv=["']formulaire["'][^>]*>)([\s\S]*?)(<\/\2>)/i,
    (_, ouverture: string, _tag: string, _contenu: string, fermeture: string) => `${ouverture}${formulaireCommande(ctx)}${fermeture}`
  );
}

/** Garantit une <section id="clé" data-dv-zone="…"> autour du gabarit, et ajoute le lien
 *  caché vers la page d'achat (page produit). */
function enSection(html: string, cle: string, zone: string, suffixe = ""): string {
  const ouvertureSection = new RegExp(`^\\s*<section\\b([^>]*)\\bid=["']${cle}["']([^>]*)>`, "i");
  const corps = ouvertureSection.test(html)
    ? html.replace(ouvertureSection, (_, a: string, b: string) => `<section${a}id="${cle}"${b} data-dv-zone="${zone}">`)
    : `<section id="${cle}" data-dv-zone="${zone}">${html}</section>`;
  return corps.replace(/<\/section>\s*$/i, `${suffixe}</section>`);
}

export type ContenusPagesProduit = { css: string; produit: string; commande: string; selection: string };

/** Contenu des pages produit et d'achat (sections complètes, données et scripts compris). */
export function contenusPagesProduit(
  gabarits: GabaritsPages,
  ctx: SiteCtx,
  produits: ProduitBoutique[],
  collectionDe: (p: ProduitBoutique) => string | null
): ContenusPagesProduit {
  const slugs = slugsProduits(produits);
  const donnees = donneesProduits(produits, slugs, collectionDe);
  const scripts = `${donnees}\n${scriptPages(ctx)}`;
  return {
    css: `${gabarits.css}\n${STYLES_FORMULAIRE}`,
    produit: enSection(gabarits.produit, CLE_PRODUIT, "produit", `<a href="${CLE_COMMANDE}.html" data-dv="vers-commande" hidden></a>${scripts}`),
    commande: enSection(avecFormulaire(gabarits.commande, ctx), CLE_COMMANDE, "commande", scripts),
    selection: SCRIPT_SELECTION_PRODUIT,
  };
}

/** Carte produit des grilles du site multi-pages : image et nom mènent à la page produit, le
 *  bouton à la page d'achat (plus de formulaire de commande dans chaque carte). */
export function carteProduitLien(ctx: SiteCtx, p: ProduitBoutique, slug: string, ctaLabel: string, prixHtml: string): string {
  const image = p.image?.trim()
    ? `<img src="${escapeHtml(p.image.trim())}" alt="${escapeHtml(p.nom)}" loading="lazy">`
    : `<div class="grille-img-placeholder" data-placeholder="image">${escapeHtml(ctx.t.boutique.photoAAjouter)}</div>`;
  const lien = (cle: string, contenu: string, classe = "") =>
    `<a href="${cle}.html" data-dv-produit="${escapeHtml(slug)}"${classe ? ` class="${classe}"` : ""}>${contenu}</a>`;
  return `<div class="grille-carte">
    ${lien(CLE_PRODUIT, `<div class="grille-img">${image}</div>`, "grille-lien")}
    <div class="grille-body">
      ${lien(CLE_PRODUIT, `<h3>${escapeHtml(p.nom)}</h3>`, "grille-lien")}
      ${p.description.trim() ? `<p class="grille-desc">${escapeHtml(p.description)}</p>` : ""}
      ${prixHtml}
      ${p.prixVente.trim() ? lien(CLE_COMMANDE, escapeHtml(ctaLabel), "cta") : ""}
    </div>
  </div>`;
}

export const STYLES_CARTES_LIEN = `
  .grille-lien { color:inherit; text-decoration:none; display:block; }
  .grille-carte .grille-lien:hover h3 { text-decoration:underline; }
  .grille-carte .cta { margin-top:auto; }`;

// Gabarits de la page produit et de la page d'achat, dessinés par l'IA au design de la
// coquille (mêmes variables CSS, polices, classes, ton). Le modèle ne voit aucun produit :
// les éléments à remplir portent des attributs data-dv, remplis par le code
// (lib/pages-produit.ts). Gabarits du code en repli si l'appel échoue, si le budget IA ne le
// couvre pas, ou si un attribut obligatoire manque : la génération du site n'échoue jamais
// pour ça.
const MAX_TOKENS_GABARITS = 12000;

export async function genererGabarits(
  client: Anthropic,
  modele: string,
  ctx: SiteCtx,
  coquille: string,
  suivi: SuiviBudgetIa
): Promise<GabaritsPages> {
  const styles = (coquille.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? []).join("\n").slice(0, 40_000);
  const corps = coquille.slice(coquille.search(/<body\b/i)).replace(/<script\b[\s\S]*?<\/script>/gi, "").slice(0, 14_000);
  const consigne = `Voici le CSS et le début de l'accueil d'un site e-commerce. Dessine, au même design (mêmes variables CSS --site-*, mêmes classes réutilisables, mêmes polices, même ton visuel), deux blocs HTML de contenu (sans en-tête ni pied de page, ils sont ajoutés automatiquement) :

1. "produit" : une page produit premium, à partir de <section id="produit">. Grande image produit, nom, prix (et prix barré), description, collection, sélecteur de quantité, total, bouton d'achat, et une zone de réassurance SANS chiffre ni promesse inventée (pas de délai, pas de note, pas de nombre de clients). Place EXACTEMENT ces attributs sur les éléments que le code remplira : ${ATTRIBUTS_PRODUIT.obligatoires.map((a) => `data-dv="${a}"`).join(", ")} (obligatoires ; image sur une balise <img>, moins/plus/acheter sur des <button type="button">) et ${ATTRIBUTS_PRODUIT.facultatifs.map((a) => `data-dv="${a}"`).join(", ")} (facultatifs). Laisse ces éléments VIDES : le code y met le vrai contenu. Ajoute un lien de retour vers catalogue.html.
2. "commande" : une page d'achat, à partir de <section id="commande">. Titre, récapitulatif de la commande et zone de formulaire. Attributs : ${ATTRIBUTS_COMMANDE.obligatoires.map((a) => `data-dv="${a}"`).join(", ")} (obligatoires ; formulaire = un <div data-dv="formulaire"></div> VIDE, le code y place le formulaire de livraison) et ${ATTRIBUTS_COMMANDE.facultatifs.map((a) => `data-dv="${a}"`).join(", ")} (facultatifs ; recap-image sur une <img>, recap-moins/recap-plus sur des <button type="button">). Ajoute un lien de retour vers catalogue.html.
3. "css" : uniquement les règles CSS nouvelles nécessaires à ces deux blocs (préfixées par #produit ou #commande), responsive mobile, cohérentes avec le CSS existant. Ne redéfinis pas :root.

Aucun <script>, aucun attribut on*, aucun texte de produit, prix ou avis inventé. Textes en ${ctx.langue === "fr" ? "français" : ctx.langue === "en" ? "anglais" : ctx.langue === "es" ? "espagnol" : "italien"}.

CSS EXISTANT :
${styles}

DÉBUT DE L'ACCUEIL :
${corps}`;
  try {
    await suivi.verifier(suivi.estimer(tokensEstimes(consigne), MAX_TOKENS_GABARITS));
    const message = await client.messages
      .stream({
        model: modele,
        max_tokens: MAX_TOKENS_GABARITS,
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA_GABARITS } },
        messages: [{ role: "user", content: consigne }],
      })
      .finalMessage();
    suivi.ajouter(message.model, message.usage);
    const texte = message.content.find((b) => b.type === "text");
    const gabarits = gabaritsValides(texte && texte.type === "text" ? JSON.parse(texte.text) : null);
    if (gabarits) return gabarits;
    console.warn("[generate-site] gabarits produit/commande incomplets : gabarits par défaut.");
  } catch (err) {
    console.warn("[generate-site] gabarits produit/commande non générés :", err instanceof Error ? err.message : err);
  }
  return gabaritsParDefaut(ctx);
}
