// Système de templates déterministes pour le Site Builder (mode "Éditeur de templates").
// Contrairement au mode IA (génération Claude à la demande), ces templates sont du HTML
// statique paramétré : rendu instantané, pas d'appel API, structure garantie et testable.

export type Categorie = "tech" | "maison" | "beaute" | "generique";

export type ContenuTexte = {
  titre: string;
  sousTitre: string;
  description: string;
  bullets: string[];
  cta: string;
  // Preuve sociale — optionnelle, jamais pré-remplie : uniquement les vrais chiffres du vendeur.
  noteMoyenne?: string;      // ex: "4.8" (sur 5)
  nombreAvis?: string;       // ex: "120"
  nombreCommandes?: string;  // ex: "500"
};

export type ImagesSite = {
  hero: string | null;
  galerie: (string | null)[]; // 3 emplacements
  avant: string | null;
  apres: string | null;
};

export type Reassurance = {
  actif: boolean;
  livraison: string;
  paiement: string;
  retour: string;
};

export const CATEGORIES: { id: Categorie; label: string; emoji: string; desc: string }[] = [
  { id: "tech",      label: "Tech",      emoji: "⚡", desc: "Sombre, néon, mise en page split-screen" },
  { id: "maison",    label: "Maison",    emoji: "🏠", desc: "Chaleureux, crème/terracotta, centré" },
  { id: "beaute",    label: "Beauté",    emoji: "💄", desc: "Pastel, élégant, avant/après mis en avant" },
  { id: "generique", label: "Générique", emoji: "🛍️", desc: "Neutre, universel, structure classique" },
];

export const TEXTES_DEFAUT: Record<Categorie, ContenuTexte> = {
  tech: {
    titre: "La technologie qui simplifie votre quotidien",
    sousTitre: "Innovation pensée pour un usage simple, au quotidien.",
    description:
      "Conçu pour allier performance et simplicité d'utilisation. Une solution moderne pour un besoin bien réel, sans complexité inutile.",
    bullets: [
      "Installation en quelques minutes",
      "Compatible avec vos appareils du quotidien",
      "Design compact et durable",
      "Utilisation simple, sans réglage complexe",
    ],
    cta: "Je le veux",
    noteMoyenne: "",
    nombreAvis: "",
    nombreCommandes: "",
  },
  maison: {
    titre: "Un intérieur plus agréable, simplement",
    sousTitre: "Pensé pour s'intégrer naturellement chez vous.",
    description:
      "Un objet du quotidien qui allie fonctionnalité et esthétique, pour une maison plus agréable à vivre, jour après jour.",
    bullets: [
      "S'intègre facilement à votre décoration",
      "Facile à nettoyer et à entretenir",
      "Matériaux pensés pour durer",
      "Un geste simple qui change le quotidien",
    ],
    cta: "Je commande",
    noteMoyenne: "",
    nombreAvis: "",
    nombreCommandes: "",
  },
  beaute: {
    titre: "Prenez soin de vous, simplement",
    sousTitre: "Une routine simple, pour un résultat visible.",
    description:
      "Formulé pour s'intégrer facilement à votre routine beauté, jour après jour, sans complexité.",
    bullets: [
      "S'utilise en quelques secondes",
      "Convient à un usage régulier",
      "Facile à emporter partout",
      "Un geste simple à intégrer à votre routine",
    ],
    cta: "Je découvre",
    noteMoyenne: "",
    nombreAvis: "",
    nombreCommandes: "",
  },
  generique: {
    titre: "Le produit qu'il vous manquait",
    sousTitre: "Simple, pratique, pensé pour vous.",
    description:
      "Un produit pensé pour répondre à un besoin concret du quotidien, sans complication.",
    bullets: [
      "Facile à utiliser dès la réception",
      "Pensé pour durer",
      "Un rapport qualité-prix étudié",
      "Simple, pratique, efficace",
    ],
    cta: "Commander maintenant",
    noteMoyenne: "",
    nombreAvis: "",
    nombreCommandes: "",
  },
};

export const REASSURANCE_DEFAUT: Reassurance = {
  actif: true,
  livraison: "Suivi de commande à chaque étape",
  paiement: "Vos données bancaires sont chiffrées",
  retour: "Rétractation possible sous 14 jours",
};

export function imagesVides(): ImagesSite {
  return { hero: null, galerie: [null, null, null], avant: null, apres: null };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function nl2list(bullets: string[]): string {
  return bullets
    .filter((b) => b.trim())
    .map((b) => `<li>${escapeHtml(b)}</li>`)
    .join("\n");
}

function prixBlock(prixVente: string, prixBarre: string, accent: string): string {
  if (!prixVente.trim()) return "";
  const barre = prixBarre.trim()
    ? `<span style="text-decoration:line-through;opacity:.5;font-size:var(--fs-small);margin-right:10px">${escapeHtml(prixBarre)}€</span>`
    : "";
  return `<div class="prix">${barre}<strong style="color:${accent}">${escapeHtml(prixVente)}€</strong></div>`;
}

// Preuve sociale réelle — ne s'affiche que si le vendeur a rempli au moins un vrai chiffre.
// Jamais de valeur par défaut : pas de fausse note, pas de faux avis, pas de fausses ventes.
function preuveSocialeBlock(c: ContenuTexte, accent: string): string {
  const note = c.noteMoyenne?.trim();
  const avis = c.nombreAvis?.trim();
  const commandes = c.nombreCommandes?.trim();
  if (!note && !avis && !commandes) return "";

  const noteNum = parseFloat(note || "0");
  const pleines = Math.max(0, Math.min(5, Math.round(noteNum)));
  const etoiles = note ? "★".repeat(pleines) + "☆".repeat(5 - pleines) : "";

  const details = [
    avis && `${escapeHtml(avis)} avis`,
    commandes && `${escapeHtml(commandes)} ventes`,
  ].filter(Boolean).join(" · ");

  return `<div class="dv-social-proof" style="font-size:var(--fs-body);margin-bottom:14px;">${
    note ? `<span style="color:${accent};letter-spacing:1px">${etoiles}</span> <strong>${escapeHtml(note)}/5</strong>` : ""
  }${details ? `<span style="opacity:.65;margin-left:6px">${details}</span>` : ""}</div>`;
}

function reassuranceBlock(r: Reassurance, style: string): string {
  if (!r.actif) return "";
  const items = [
    { icon: "🚚", titre: "Livraison suivie", texte: r.livraison },
    { icon: "🔒", titre: "Paiement sécurisé", texte: r.paiement },
    { icon: "↩", titre: "Satisfait ou remboursé", texte: r.retour },
  ];
  return `
  <section class="reassurance ${style}">
    <div class="reassurance-grid">
      ${items
        .map(
          (it) => `<div class="reassurance-item">
        <span class="reassurance-icon">${it.icon}</span>
        <div>
          <p class="reassurance-titre">${escapeHtml(it.titre)}</p>
          <p class="reassurance-texte">${escapeHtml(it.texte)}</p>
        </div>
      </div>`
        )
        .join("\n")}
    </div>
  </section>`;
}

function galerieImgs(images: ImagesSite): string[] {
  return images.galerie.filter((u): u is string => !!u);
}

// ─── Panier mono-produit + checkout invité (vanilla JS, aucune dépendance) ────
// Le paiement n'est PAS intégré (pas de Stripe) : le bouton final est un placeholder
// désactivé, pour ne jamais laisser croire qu'une commande a réellement été passée.

type CheckoutTheme = {
  qtyBg: string; qtyBorder: string; qtyColor: string;
  cardBg: string; inputBg: string; inputBorder: string; textColor: string;
  modalBg: string; modalText: string;
};

function checkoutStyles(t: CheckoutTheme): string {
  return `
  .dv-order { margin-top:20px; }
  .dv-qty-row { display:flex; align-items:center; justify-content:center; gap:16px; margin:16px 0; }
  .dv-qty-btn { width:44px; height:44px; border-radius:8px; border:1px solid ${t.qtyBorder}; background:${t.qtyBg}; color:${t.qtyColor}; font-size:var(--fs-body); cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center; }
  .dv-qty-val { font-size:var(--fs-body); font-weight:700; min-width:24px; color:${t.qtyColor}; }
  .dv-total { margin-bottom:16px; font-size:var(--fs-body); color:${t.qtyColor}; }
  .dv-checkout { margin-top:24px; text-align:left; max-width:360px; margin-left:auto; margin-right:auto; background:${t.cardBg}; border-radius:14px; padding:22px; }
  .dv-checkout h3 { font-size:var(--fs-body); margin-bottom:14px; text-align:center; color:${t.textColor}; }
  .dv-field { margin-bottom:12px; }
  .dv-field label { display:block; font-size:var(--fs-small); margin-bottom:4px; color:${t.textColor}; opacity:.75; }
  .dv-field input { width:100%; padding:13px 12px; border-radius:8px; border:1px solid ${t.inputBorder}; background:${t.inputBg}; color:${t.textColor}; font-size:var(--fs-body); box-sizing:border-box; }
  .dv-pay-btn { width:100%; padding:14px; border-radius:8px; border:none; background:#9ca3af; color:#374151; font-weight:700; font-size:var(--fs-small); margin-top:6px; cursor:not-allowed; opacity:.9; }
  .dv-pay-note { font-size:var(--fs-small); color:${t.textColor}; opacity:.65; margin-top:10px; text-align:center; line-height:1.5; }
  .dv-legal-modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:999; align-items:center; justify-content:center; padding:20px; }
  .dv-legal-box { background:${t.modalBg}; color:${t.modalText}; max-width:600px; width:100%; max-height:80vh; overflow-y:auto; border-radius:16px; padding:32px; position:relative; text-align:left; }
  .dv-legal-box h2 { font-size:var(--fs-h2); margin-bottom:20px; font-family:inherit; }
  .dv-legal-box h3 { font-size:var(--fs-body); margin:20px 0 8px; }
  .dv-legal-box p { font-size:var(--fs-small); line-height:1.6; opacity:.85; }
  .dv-legal-close { position:absolute; top:10px; right:10px; width:44px; height:44px; border-radius:8px; border:1px solid rgba(128,128,128,.3); background:transparent; color:inherit; cursor:pointer; font-size:var(--fs-body); display:flex; align-items:center; justify-content:center; }
  .dv-footer-links { margin-top:8px; }
  .dv-footer-links a { color:inherit; opacity:.6; font-size:var(--fs-small); text-decoration:underline; cursor:pointer; display:inline-block; padding:14px 8px; margin:-14px -8px; }`;
}

// idSuffix distingue plusieurs instances de ce bloc sur une même page (mode boutique —
// une mini-commande indépendante par carte produit, voir productGridSection ci-dessous) ;
// vide par défaut, donc les ids restent identiques à avant pour le mode produit unique
// (une seule instance par page, aucun changement de sortie HTML).
function checkoutHtml(prixVenteNum: number, cta: string, idSuffix = ""): string {
  return `
    <div class="dv-order">
      <div class="dv-qty-row">
        <button type="button" id="dv-qty-minus${idSuffix}" class="dv-qty-btn" aria-label="Diminuer la quantité">−</button>
        <span id="dv-qty${idSuffix}" class="dv-qty-val">1</span>
        <button type="button" id="dv-qty-plus${idSuffix}" class="dv-qty-btn" aria-label="Augmenter la quantité">+</button>
      </div>
      <div class="dv-total">Total : <strong id="dv-total${idSuffix}">${prixVenteNum.toFixed(2)}€</strong></div>
      <button type="button" id="dv-order-btn${idSuffix}" class="cta" style="border:none;cursor:pointer;font-family:inherit;">${escapeHtml(cta)}</button>

      <div id="dv-checkout-form${idSuffix}" class="dv-checkout" style="display:none">
        <h3>Tes informations de livraison</h3>
        <div class="dv-field"><label>Nom complet</label><input type="text" placeholder="Ton nom"></div>
        <div class="dv-field"><label>Adresse de livraison</label><input type="text" placeholder="Adresse, code postal, ville"></div>
        <div class="dv-field"><label>Email</label><input type="email" placeholder="ton@email.com"></div>
        <button type="button" class="dv-pay-btn" disabled>🔒 Paiement sécurisé — bientôt disponible</button>
        <p class="dv-pay-note">Le paiement en ligne n'est pas encore activé sur cette page. Aucune commande ne peut être finalisée pour le moment.</p>
      </div>
    </div>`;
}

function checkoutScript(prixVenteNum: number, idSuffix = ""): string {
  return `<script>
(function(){
  var prixUnitaire = ${prixVenteNum};
  var qty = 1;
  var qtyEl = document.getElementById('dv-qty${idSuffix}');
  var totalEl = document.getElementById('dv-total${idSuffix}');
  function updateTotal(){
    if (qtyEl) qtyEl.textContent = qty;
    if (totalEl) totalEl.textContent = (prixUnitaire * qty).toFixed(2) + '€';
  }
  var minus = document.getElementById('dv-qty-minus${idSuffix}');
  var plus = document.getElementById('dv-qty-plus${idSuffix}');
  if (minus) minus.addEventListener('click', function(){ if (qty > 1) { qty--; updateTotal(); } });
  if (plus) plus.addEventListener('click', function(){ qty++; updateTotal(); });

  var orderBtn = document.getElementById('dv-order-btn${idSuffix}');
  var checkoutForm = document.getElementById('dv-checkout-form${idSuffix}');
  if (orderBtn && checkoutForm) {
    orderBtn.addEventListener('click', function(){
      checkoutForm.style.display = 'block';
      orderBtn.style.display = 'none';
      checkoutForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  var legalLink = document.getElementById('dv-legal-link');
  var legalModal = document.getElementById('dv-legal-modal');
  var legalClose = document.getElementById('dv-legal-close');
  if (legalLink && legalModal) {
    legalLink.addEventListener('click', function(e){ e.preventDefault(); legalModal.style.display = 'flex'; });
    if (legalClose) legalClose.addEventListener('click', function(){ legalModal.style.display = 'none'; });
    legalModal.addEventListener('click', function(e){ if (e.target === legalModal) legalModal.style.display = 'none'; });
  }
})();
</script>`;
}

function footerLegalLink(): string {
  return `<div class="dv-footer-links"><a id="dv-legal-link" href="#">Mentions légales</a></div>`;
}

function mentionsLegalesModal(): string {
  return `
  <div id="dv-legal-modal" class="dv-legal-modal">
    <div class="dv-legal-box">
      <button type="button" id="dv-legal-close" class="dv-legal-close" aria-label="Fermer">✕</button>
      <h2>Mentions légales</h2>
    </div>
  </div>`;
}

// ─── Produits (mode boutique) — grille partagée + panier indépendant par carte ────────
// Choix volontaire (voir discussion produit) : pas de panier partagé multi-articles avec
// total cumulé — chaque carte a son propre mini parcours de commande indépendant, en
// réutilisant checkoutHtml/checkoutScript ci-dessus avec un idSuffix par produit. Plus
// simple à maintenir, et suffisant pour une page catalogue statique exportée.

export type ProduitBoutique = {
  nom: string;
  description: string;
  image: string | null;
  prixVente: string;
  prixOriginal: string;
  // Catégorie de la boutique (boutique_produits.category_id), transmise par le brouillon du
  // Site Builder pour regrouper les produits en collections — absente ou null : sans catégorie.
  categorieId?: string | null;
};

// Styles de carte partagés entre les 4 déclinaisons boutique — seule la couleur d'accent
// change, la forme (fond translucide + bordure + radius) reste cohérente avec les styles
// "card"/"pill" déjà utilisés par les templates produit correspondants.
export function grilleStyles(accent: string, cardBg: string, cardBorder: string, textColor: string, mutedColor: string): string {
  return `
  .grille { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:24px; }
  .grille-carte { background:${cardBg}; border:1px solid ${cardBorder}; border-radius:16px; overflow:hidden; display:flex; flex-direction:column; }
  .grille-img { aspect-ratio:1; overflow:hidden; background:${cardBorder}; }
  .grille-img img { width:100%; height:100%; object-fit:cover; }
  .grille-img-placeholder { width:100%; height:100%; box-sizing:border-box; background:${cardBg}; border:2px dashed ${cardBorder}; display:flex; align-items:center; justify-content:center; text-align:center; padding:12px; color:${mutedColor}; font-size:var(--fs-small); }
  .grille-body { padding:18px; display:flex; flex-direction:column; gap:10px; flex:1; }
  .grille-body h3 { font-size:1.05rem; color:${textColor}; }
  .grille-desc { font-size:var(--fs-small); color:${mutedColor}; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .grille-carte .prix { font-size:1.2rem; margin-bottom:4px; }
  .grille-carte .dv-order { margin-top:auto; }
  .grille-carte .cta { display:block; text-align:center; padding:11px; font-size:var(--fs-small); }
  @media(max-width:500px){ .grille{grid-template-columns:1fr 1fr} }`;
}

// prefixe distingue les identifiants du formulaire de commande quand un même produit est
// affiché dans plusieurs grilles de la page (catalogue + collection) : "" donne -p0, -p1…
// comme avant ; "c0" donne -c0p0… Les scripts doivent utiliser le même préfixe.
function produitCardHtml(p: ProduitBoutique, idx: number, accent: string, ctaLabel: string, prefixe = ""): string {
  const idSuffix = `-${prefixe}p${idx}`;
  const prixNum = parseFloat(p.prixVente) || 0;
  return `<div class="grille-carte">
    <div class="grille-img">${p.image?.trim() ? `<img src="${escapeHtml(p.image.trim())}" alt="${escapeHtml(p.nom)}">` : `<div class="grille-img-placeholder" data-placeholder="image">Photo à ajouter</div>`}</div>
    <div class="grille-body">
      <h3>${escapeHtml(p.nom)}</h3>
      ${p.description.trim() ? `<p class="grille-desc">${escapeHtml(p.description)}</p>` : ""}
      ${prixBlock(p.prixVente, p.prixOriginal, accent)}
      ${p.prixVente.trim() ? checkoutHtml(prixNum, ctaLabel, idSuffix) : `<a href="#" class="cta">${escapeHtml(ctaLabel)}</a>`}
    </div>
  </div>`;
}

export function productGridSection(produits: ProduitBoutique[], accent: string, ctaLabel: string): string {
  return `<section id="produits"><div class="wrap">
    <h2>Nos produits</h2>
    <div class="grille">
      ${produits.map((p, i) => produitCardHtml(p, i, accent, ctaLabel)).join("\n")}
    </div>
  </div></section>`;
}

export function produitsCheckoutScripts(produits: ProduitBoutique[], prefixe = ""): string {
  return produits
    .map((p, i) => (p.prixVente.trim() ? checkoutScript(parseFloat(p.prixVente) || 0, `-${prefixe}p${i}`) : ""))
    .join("\n");
}

// Grille seule (sans section ni titre), pour les pages qui placent plusieurs grilles — voir
// injectProductGrid dans app/api/generate-site/route.ts. Même carte que productGridSection.
export function grilleProduitsHtml(produits: ProduitBoutique[], accent: string, ctaLabel: string, prefixe = ""): string {
  return `<div class="grille">
      ${produits.map((p, i) => produitCardHtml(p, i, accent, ctaLabel, prefixe)).join("\n")}
    </div>`;
}

// ─── Template TECH — sombre, néon, split-screen, bento grid ──────────────────

function templateTech(c: ContenuTexte, images: ImagesSite, prixVente: string, prixBarre: string, reassurance: Reassurance): string {
  const accent = "var(--site-accent)";
  const accent2 = "var(--site-accent-2)";
  const galerie = galerieImgs(images);
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(c.titre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --site-bg:#0a0a0f; --site-text:#f0f0f8; --site-text-muted:rgba(240,240,248,.6);
    --site-accent:#22d3ee; --site-accent-2:#7c3aed; --site-surface:#16161d; --site-border:rgba(255,255,255,.1);
    --fs-h1:clamp(2.2rem,5vw,3.4rem); --fs-h2:clamp(1.6rem,3vw,2.2rem); --fs-body:1rem; --fs-small:.8rem;
  }
  body { background:var(--site-bg); color:var(--site-text); font-family:'Inter',sans-serif; line-height:1.6; }
  h1,h2 { font-family:'Space Grotesk',sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; padding:0 24px; }
  .hero { min-height:90vh; display:flex; align-items:center; padding:60px 0; background:
    radial-gradient(circle at 80% 20%, color-mix(in srgb, ${accent2} 13%, transparent), transparent 50%),
    radial-gradient(circle at 20% 80%, color-mix(in srgb, ${accent} 13%, transparent), transparent 50%); }
  .hero .wrap { display:flex; align-items:center; gap:60px; flex-wrap:wrap; }
  .hero-text { flex:1; min-width:280px; }
  .badge { display:inline-block; padding:6px 14px; border-radius:999px; background:color-mix(in srgb, ${accent} 10%, transparent); border:1px solid color-mix(in srgb, ${accent} 27%, transparent); color:${accent}; font-size:var(--fs-small); font-weight:600; letter-spacing:.06em; text-transform:uppercase; margin-bottom:20px; }
  .hero h1 { font-size:var(--fs-h1); font-weight:700; line-height:1.1; margin-bottom:18px; }
  .hero .sous { color:var(--site-text-muted); font-size:var(--fs-body); margin-bottom:28px; }
  .hero-img { flex:1; min-width:280px; display:flex; justify-content:center; }
  .hero-img img { max-width:420px; width:100%; border-radius:16px; box-shadow:0 20px 60px color-mix(in srgb, ${accent} 25%, transparent); }
  .hero-img .placeholder { width:100%; max-width:420px; aspect-ratio:1; border-radius:16px; background:linear-gradient(135deg,${accent2},${accent}); }
  .prix { font-size:var(--fs-h2); font-weight:700; margin-bottom:24px; }
  .cta { display:inline-block; padding:16px 32px; border-radius:10px; background:${accent}; color:#04141a; font-weight:700; text-decoration:none; box-shadow:0 0 32px color-mix(in srgb, ${accent} 33%, transparent); }
  section { padding:70px 0; }
  .bento { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
  .bento > div:first-child { grid-column:span 2; }
  .card { background:var(--site-surface); border:1px solid var(--site-border); border-radius:14px; padding:26px; }
  .card b { display:block; margin-bottom:8px; font-size:var(--fs-body); }
  h2 { font-size:var(--fs-h2); margin-bottom:32px; }
  ul.bullets { list-style:none; }
  ul.bullets li { padding:12px 0; border-bottom:1px solid var(--site-border); display:flex; gap:10px; }
  ul.bullets li::before { content:"▸"; color:${accent}; }
  .galerie { display:flex; gap:14px; overflow-x:auto; padding-bottom:10px; }
  .galerie img { height:220px; border-radius:12px; flex-shrink:0; }
  .reassurance { border-top:1px solid var(--site-border); }
  .reassurance-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
  .reassurance-item { display:flex; gap:12px; align-items:flex-start; }
  .reassurance-icon { font-size:var(--fs-h2); }
  .reassurance-titre { font-weight:600; font-size:var(--fs-body); }
  .reassurance-texte { font-size:var(--fs-small); color:var(--site-text-muted); margin-top:2px; }
  .cta-final { text-align:center; background:linear-gradient(135deg,${accent2},var(--site-bg)); border-radius:20px; padding:60px 30px; margin:0 24px 24px; }
  footer { text-align:center; padding:30px; color:var(--site-text-muted); font-size:var(--fs-small); }
  @media(max-width:700px){ .bento{grid-template-columns:1fr} .bento>div:first-child{grid-column:span 1} .reassurance-grid{grid-template-columns:1fr} }
  ${checkoutStyles({
    qtyBg: "var(--site-surface)", qtyBorder: "var(--site-border)", qtyColor: "var(--site-text)",
    cardBg: "var(--site-surface)", inputBg: "var(--site-surface)", inputBorder: "var(--site-border)", textColor: "var(--site-text)",
    modalBg: "var(--site-surface)", modalText: "var(--site-text)",
  })}
</style></head>
<body>
  <section class="hero"><div class="wrap">
    <div class="hero-text">
      <span class="badge">Nouvelle génération</span>
      <h1>${escapeHtml(c.titre)}</h1>
      <p class="sous">${escapeHtml(c.sousTitre)}</p>
      ${preuveSocialeBlock(c, accent)}
      ${prixBlock(prixVente, prixBarre, accent)}
      <a href="#commander" class="cta">${escapeHtml(c.cta)}</a>
    </div>
    <div class="hero-img">
      ${images.hero ? `<img src="${escapeHtml(images.hero)}" alt="${escapeHtml(c.titre)}">` : `<div class="placeholder"></div>`}
    </div>
  </div></section>

  <section><div class="wrap">
    <h2>Pourquoi ce produit</h2>
    <div class="bento">
      ${c.bullets.map((b) => `<div class="card"><b>${escapeHtml(b)}</b></div>`).join("\n")}
    </div>
  </div></section>

  <section><div class="wrap">
    <h2>Description</h2>
    <p style="color:rgba(240,240,248,.7);max-width:640px;margin-bottom:24px">${escapeHtml(c.description)}</p>
    <ul class="bullets">${nl2list(c.bullets)}</ul>
  </div></section>

  ${galerie.length ? `<section><div class="wrap"><h2>Galerie</h2><div class="galerie">${galerie.map((g) => `<img src="${escapeHtml(g)}" alt="${escapeHtml(c.titre)}">`).join("")}</div></div></section>` : ""}

  ${reassuranceBlock(reassurance, "wrap")}

  <section id="commander"><div class="cta-final">
    <h2 style="margin-bottom:16px">${escapeHtml(c.titre)}</h2>
    ${prixVente.trim()
      ? checkoutHtml(parseFloat(prixVente) || 0, c.cta)
      : `${prixBlock(prixVente, prixBarre, accent)}<a href="#" class="cta">${escapeHtml(c.cta)}</a>`}
  </div></section>

  <footer>© Tous droits réservés${footerLegalLink()}</footer>
  ${mentionsLegalesModal()}
  ${prixVente.trim() ? checkoutScript(parseFloat(prixVente) || 0) : ""}
</body></html>`;
}

// ─── Template MAISON — chaleureux, crème/terracotta, centré, zigzag ──────────

function templateMaison(c: ContenuTexte, images: ImagesSite, prixVente: string, prixBarre: string, reassurance: Reassurance): string {
  const accent = "var(--site-accent)";
  const galerie = galerieImgs(images);
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(c.titre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --site-bg:#faf7f2; --site-text:#2b2620; --site-text-muted:#6b5f4f;
    --site-accent:#c2703d; --site-surface:#f1ece2; --site-border:#e0d5c7;
    --fs-h1:clamp(2rem,5vw,3rem); --fs-h2:clamp(1.5rem,3vw,2rem); --fs-body:1rem; --fs-small:.8rem;
  }
  body { background:var(--site-bg); color:var(--site-text); font-family:'Inter',sans-serif; line-height:1.65; }
  h1,h2 { font-family:'Fraunces',serif; font-weight:600; }
  .wrap { max-width:920px; margin:0 auto; padding:0 24px; }
  .hero { text-align:center; padding:90px 24px 60px; }
  .hero h1 { font-size:var(--fs-h1); margin-bottom:16px; }
  .hero .sous { color:var(--site-text-muted); font-size:var(--fs-body); max-width:520px; margin:0 auto 28px; }
  .hero img { max-width:460px; width:100%; border-radius:20px; margin:20px auto 0; display:block; box-shadow:0 24px 50px rgba(43,38,32,.15); }
  .hero .placeholder { max-width:460px; width:100%; aspect-ratio:4/3; margin:20px auto 0; border-radius:20px; background:linear-gradient(135deg,color-mix(in srgb, ${accent} 20%, transparent),color-mix(in srgb, #7c8f6e 20%, transparent)); }
  .prix { font-size:var(--fs-h2); font-weight:700; margin-bottom:20px; }
  .cta { display:inline-block; padding:15px 30px; border-radius:999px; background:${accent}; color:#fff; font-weight:600; text-decoration:none; }
  section { padding:60px 0; }
  h2 { font-size:var(--fs-h2); text-align:center; margin-bottom:40px; }
  .zigzag { display:flex; flex-direction:column; gap:36px; }
  .zigzag-item { display:flex; align-items:center; gap:20px; }
  .zigzag-item:nth-child(even) { flex-direction:row-reverse; }
  .zigzag-num { font-family:'Fraunces',serif; font-size:var(--fs-h1); color:${accent}; flex-shrink:0; width:60px; }
  .zigzag-text { flex:1; font-size:var(--fs-body); }
  .desc { background:var(--site-surface); border-radius:20px; padding:44px; text-align:center; }
  .desc p { max-width:600px; margin:0 auto; color:var(--site-text-muted); }
  .galerie { display:grid; grid-template-columns:1.2fr 1fr 1fr; gap:16px; align-items:center; }
  .galerie img:first-child { border-radius:50%; aspect-ratio:1; object-fit:cover; }
  .galerie img { width:100%; border-radius:14px; aspect-ratio:1; object-fit:cover; }
  .reassurance { background:var(--site-surface); }
  .reassurance-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; text-align:center; }
  .reassurance-item { display:flex; flex-direction:column; align-items:center; gap:8px; }
  .reassurance-icon { font-size:var(--fs-h2); }
  .reassurance-titre { font-weight:600; font-size:var(--fs-body); }
  .reassurance-texte { font-size:var(--fs-small); color:var(--site-text-muted); }
  .cta-final { text-align:center; background:${accent}; color:#fff; border-radius:24px; padding:60px 30px; margin:0 24px 24px; }
  .cta-final h2 { color:#fff; }
  .cta-final .cta { background:#fff; color:${accent}; }
  footer { text-align:center; padding:30px; color:var(--site-text-muted); font-size:var(--fs-small); }
  @media(max-width:700px){ .zigzag-item,.zigzag-item:nth-child(even){flex-direction:column;text-align:center} .galerie{grid-template-columns:1fr} .reassurance-grid{grid-template-columns:1fr} }
  ${checkoutStyles({
    // Checkout intégré au bandeau CTA final, à fond accent plein (inversion volontaire de
    // contraste) — pas rattaché à --site-surface/--site-text globaux pour rester lisible
    // quelle que soit la couleur d'accent choisie ensuite (même logique que le bouton CTA
    // ci-dessus, voir cta-final .cta). modalBg/modalText restent alignés sur la page (safe).
    qtyBg: "rgba(255,255,255,.15)", qtyBorder: "rgba(255,255,255,.35)", qtyColor: "#fff",
    cardBg: "#fff", inputBg: "#faf7f2", inputBorder: "#e0d5c7", textColor: "#2b2620",
    modalBg: "var(--site-bg)", modalText: "var(--site-text)",
  })}
</style></head>
<body>
  <section class="hero"><div class="wrap">
    <h1>${escapeHtml(c.titre)}</h1>
    <p class="sous">${escapeHtml(c.sousTitre)}</p>
    ${preuveSocialeBlock(c, accent)}
    ${prixBlock(prixVente, prixBarre, accent)}
    <a href="#commander" class="cta">${escapeHtml(c.cta)}</a>
    ${images.hero ? `<img src="${escapeHtml(images.hero)}" alt="${escapeHtml(c.titre)}">` : `<div class="placeholder"></div>`}
  </div></section>

  <section><div class="wrap">
    <h2>Ce qui change au quotidien</h2>
    <div class="zigzag">
      ${c.bullets.map((b, i) => `<div class="zigzag-item"><span class="zigzag-num">0${i + 1}</span><p class="zigzag-text">${escapeHtml(b)}</p></div>`).join("\n")}
    </div>
  </div></section>

  <section><div class="wrap"><div class="desc">
    <h2>${escapeHtml(c.sousTitre)}</h2>
    <p>${escapeHtml(c.description)}</p>
  </div></div></section>

  ${galerie.length ? `<section><div class="wrap"><h2>En images</h2><div class="galerie">${galerie.map((g) => `<img src="${escapeHtml(g)}" alt="${escapeHtml(c.titre)}">`).join("")}</div></div></section>` : ""}

  ${reassuranceBlock(reassurance, "wrap")}

  <section id="commander"><div class="cta-final">
    <h2>${escapeHtml(c.titre)}</h2>
    ${prixVente.trim()
      ? checkoutHtml(parseFloat(prixVente) || 0, c.cta)
      : `${prixBlock(prixVente, prixBarre, "#fff")}<a href="#" class="cta">${escapeHtml(c.cta)}</a>`}
  </div></section>

  <footer>© Tous droits réservés${footerLegalLink()}</footer>
  ${mentionsLegalesModal()}
  ${prixVente.trim() ? checkoutScript(parseFloat(prixVente) || 0) : ""}
</body></html>`;
}

// ─── Template BEAUTÉ — pastel, élégant, avant/après ───────────────────────────

function templateBeaute(c: ContenuTexte, images: ImagesSite, prixVente: string, prixBarre: string, reassurance: Reassurance): string {
  const accent = "var(--site-accent)";
  const galerie = galerieImgs(images);
  const hasAvantApres = images.avant && images.apres;
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(c.titre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --site-bg:linear-gradient(180deg,#fff1f5,#f3e8ff 40%,#fff 80%); --site-text:#3a2e35; --site-text-muted:#5c4a53;
    --site-accent:#ec4899; --site-surface:#fff; --site-border:color-mix(in srgb, #ec4899 20%, transparent);
    --fs-h1:clamp(2.4rem,6vw,3.6rem); --fs-h2:clamp(1.6rem,3vw,2.2rem); --fs-body:1rem; --fs-small:.8rem;
  }
  body { background:var(--site-bg); color:var(--site-text); font-family:'Inter',sans-serif; line-height:1.65; }
  h1,h2 { font-family:'Cormorant Garamond',serif; font-weight:700; }
  .wrap { max-width:900px; margin:0 auto; padding:0 24px; }
  .hero { text-align:center; padding:80px 24px 40px; position:relative; }
  .hero h1 { font-size:var(--fs-h1); margin-bottom:14px; }
  .hero .sous { color:var(--site-text-muted); font-size:var(--fs-body); max-width:480px; margin:0 auto 26px; }
  .hero-img-wrap { position:relative; width:320px; height:320px; margin:24px auto 0; }
  .hero-img-wrap::before { content:""; position:absolute; inset:-14px; border-radius:50%; background:linear-gradient(135deg,color-mix(in srgb, ${accent} 20%, transparent),color-mix(in srgb, #d4a574 20%, transparent)); }
  .hero-img-wrap img { width:100%; height:100%; object-fit:cover; border-radius:50%; position:relative; box-shadow:0 20px 50px color-mix(in srgb, ${accent} 20%, transparent); }
  .hero-img-wrap .placeholder { width:100%; height:100%; border-radius:50%; background:linear-gradient(135deg,${accent},#d4a574); position:relative; }
  .prix { font-size:var(--fs-h2); font-weight:700; margin-bottom:22px; }
  .cta { display:inline-block; padding:15px 34px; border-radius:999px; background:${accent}; color:#fff; font-weight:600; text-decoration:none; letter-spacing:.02em; }
  section { padding:56px 0; }
  h2 { font-size:var(--fs-h2); text-align:center; margin-bottom:32px; }
  .pills { display:flex; flex-wrap:wrap; gap:12px; justify-content:center; }
  .pill { background:var(--site-surface); border:1px solid var(--site-border); border-radius:999px; padding:12px 22px; font-size:var(--fs-body); box-shadow:0 4px 16px color-mix(in srgb, ${accent} 8%, transparent); }
  .desc { text-align:center; max-width:560px; margin:0 auto; color:var(--site-text-muted); }
  .avant-apres { display:grid; grid-template-columns:1fr 1fr; gap:16px; max-width:600px; margin:0 auto; }
  .avant-apres figure { margin:0; text-align:center; }
  .avant-apres img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:16px; }
  .avant-apres figcaption { margin-top:8px; font-size:var(--fs-small); font-weight:600; color:var(--site-text-muted); text-transform:uppercase; letter-spacing:.06em; }
  .galerie { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  .galerie img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:16px; }
  .reassurance-grid { display:flex; justify-content:center; gap:32px; flex-wrap:wrap; text-align:center; }
  .reassurance-item { max-width:180px; }
  .reassurance-icon { font-size:var(--fs-h2); display:block; margin-bottom:6px; }
  .reassurance-titre { font-weight:600; font-size:var(--fs-body); }
  .reassurance-texte { font-size:var(--fs-small); color:var(--site-text-muted); margin-top:2px; }
  .cta-final { text-align:center; background:var(--site-surface); border:1px solid var(--site-border); border-radius:28px; padding:56px 30px; margin:0 24px 24px; }
  footer { text-align:center; padding:30px; color:var(--site-text-muted); font-size:var(--fs-small); }
  @media(max-width:700px){ .galerie{grid-template-columns:1fr 1fr} .hero-img-wrap{width:240px;height:240px} }
  ${checkoutStyles({
    qtyBg: "var(--site-surface)", qtyBorder: "var(--site-border)", qtyColor: accent,
    cardBg: "color-mix(in srgb, " + accent + " 4%, var(--site-surface))", inputBg: "var(--site-surface)", inputBorder: "var(--site-border)", textColor: "var(--site-text)",
    modalBg: "var(--site-surface)", modalText: "var(--site-text)",
  })}
</style></head>
<body>
  <section class="hero"><div class="wrap">
    <h1>${escapeHtml(c.titre)}</h1>
    <p class="sous">${escapeHtml(c.sousTitre)}</p>
    ${preuveSocialeBlock(c, accent)}
    ${prixBlock(prixVente, prixBarre, accent)}
    <a href="#commander" class="cta">${escapeHtml(c.cta)}</a>
    <div class="hero-img-wrap">
      ${images.hero ? `<img src="${escapeHtml(images.hero)}" alt="${escapeHtml(c.titre)}">` : `<div class="placeholder"></div>`}
    </div>
  </div></section>

  <section><div class="wrap">
    <h2>Les bénéfices</h2>
    <div class="pills">${c.bullets.map((b) => `<div class="pill">${escapeHtml(b)}</div>`).join("")}</div>
  </div></section>

  <section><div class="wrap desc">
    <h2>${escapeHtml(c.sousTitre)}</h2>
    <p>${escapeHtml(c.description)}</p>
  </div></section>

  ${hasAvantApres ? `<section><div class="wrap"><h2>Avant / Après</h2><div class="avant-apres">
    <figure><img src="${escapeHtml(images.avant!)}" alt="Avant"><figcaption>Avant</figcaption></figure>
    <figure><img src="${escapeHtml(images.apres!)}" alt="Après"><figcaption>Après</figcaption></figure>
  </div></div></section>` : ""}

  ${galerie.length ? `<section><div class="wrap"><h2>En images</h2><div class="galerie">${galerie.map((g) => `<img src="${escapeHtml(g)}" alt="${escapeHtml(c.titre)}">`).join("")}</div></div></section>` : ""}

  ${reassuranceBlock(reassurance, "wrap")}

  <section id="commander"><div class="cta-final">
    <h2>${escapeHtml(c.titre)}</h2>
    ${prixVente.trim()
      ? checkoutHtml(parseFloat(prixVente) || 0, c.cta)
      : `${prixBlock(prixVente, prixBarre, accent)}<a href="#" class="cta">${escapeHtml(c.cta)}</a>`}
  </div></section>

  <footer>© Tous droits réservés${footerLegalLink()}</footer>
  ${mentionsLegalesModal()}
  ${prixVente.trim() ? checkoutScript(parseFloat(prixVente) || 0) : ""}
</body></html>`;
}

// ─── Template GÉNÉRIQUE — neutre, universel, structure classique ─────────────

function templateGenerique(c: ContenuTexte, images: ImagesSite, prixVente: string, prixBarre: string, reassurance: Reassurance): string {
  const accent = "var(--site-accent)";
  const galerie = galerieImgs(images);
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(c.titre)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --site-bg:#fff; --site-text:#111827; --site-text-muted:#4b5563;
    --site-accent:#2563eb; --site-surface:#f9fafb; --site-border:#e5e7eb;
    --fs-h1:clamp(2rem,4.5vw,2.8rem); --fs-h2:clamp(1.4rem,3vw,1.9rem); --fs-body:1rem; --fs-small:.8rem;
  }
  body { background:var(--site-bg); color:var(--site-text); font-family:'Inter',system-ui,sans-serif; line-height:1.6; }
  .wrap { max-width:960px; margin:0 auto; padding:0 24px; }
  .hero-block { display:flex; flex-direction:column; }
  .hero-img-full { width:100%; max-height:420px; object-fit:cover; }
  .hero-img-full.placeholder { height:320px; background:linear-gradient(135deg,color-mix(in srgb, ${accent} 13%, transparent),color-mix(in srgb, #475569 13%, transparent)); }
  .hero { text-align:center; padding:50px 24px 60px; }
  .hero h1 { font-size:var(--fs-h1); font-weight:800; margin-bottom:14px; }
  .hero .sous { color:var(--site-text-muted); font-size:var(--fs-body); max-width:520px; margin:0 auto 26px; }
  .prix { font-size:var(--fs-h2); font-weight:800; margin-bottom:22px; }
  .cta { display:inline-block; padding:14px 30px; border-radius:8px; background:${accent}; color:#fff; font-weight:600; text-decoration:none; }
  section { padding:56px 0; }
  h2 { font-size:var(--fs-h2); font-weight:800; text-align:center; margin-bottom:32px; }
  .grid3 { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
  .card { border:1px solid var(--site-border); border-radius:12px; padding:24px; }
  .card p { font-size:var(--fs-body); color:var(--site-text-muted); }
  .desc { max-width:640px; margin:0 auto; text-align:center; color:var(--site-text-muted); }
  .galerie { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  .galerie img { width:100%; aspect-ratio:1; object-fit:cover; border-radius:10px; }
  .reassurance { background:var(--site-surface); border-top:1px solid var(--site-border); border-bottom:1px solid var(--site-border); }
  .reassurance-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; text-align:center; }
  .reassurance-icon { font-size:var(--fs-h2); display:block; margin-bottom:6px; }
  .reassurance-titre { font-weight:600; font-size:var(--fs-body); }
  .reassurance-texte { font-size:var(--fs-small); color:var(--site-text-muted); margin-top:2px; }
  .cta-final { text-align:center; background:#111827; color:#fff; border-radius:16px; padding:56px 30px; margin:0 24px 24px; }
  .cta-final .cta { background:${accent}; }
  footer { text-align:center; padding:30px; color:var(--site-text-muted); font-size:var(--fs-small); }
  @media(max-width:700px){
    .grid3,.galerie,.reassurance-grid{grid-template-columns:1fr}
    .hero-block .hero-img-full{order:2}
    .hero-block .hero{order:1}
  }
  ${checkoutStyles({
    // Checkout intégré au bandeau CTA final sombre (#111827), volontairement indépendant de
    // --site-bg/--site-text globaux (page claire) pour rester lisible quelle que soit la
    // combinaison choisie — même exception que templateMaison. modalBg/modalText restent
    // alignés sur la page (safe, hors du bandeau inversé).
    qtyBg: "rgba(255,255,255,.08)", qtyBorder: "rgba(255,255,255,.2)", qtyColor: "#fff",
    cardBg: "rgba(255,255,255,.05)", inputBg: "rgba(255,255,255,.08)", inputBorder: "rgba(255,255,255,.2)", textColor: "#fff",
    modalBg: "var(--site-bg)", modalText: "var(--site-text)",
  })}
</style></head>
<body>
  <div class="hero-block">
    ${images.hero ? `<img class="hero-img-full" src="${escapeHtml(images.hero)}" alt="${escapeHtml(c.titre)}">` : `<div class="hero-img-full placeholder"></div>`}
    <section class="hero"><div class="wrap">
      <h1>${escapeHtml(c.titre)}</h1>
      <p class="sous">${escapeHtml(c.sousTitre)}</p>
      ${preuveSocialeBlock(c, accent)}
      ${prixBlock(prixVente, prixBarre, accent)}
      <a href="#commander" class="cta">${escapeHtml(c.cta)}</a>
    </div></section>
  </div>

  <section><div class="wrap">
    <h2>Pourquoi choisir ce produit</h2>
    <div class="grid3">${c.bullets.map((b) => `<div class="card"><p>${escapeHtml(b)}</p></div>`).join("")}</div>
  </div></section>

  <section><div class="wrap desc">
    <h2>Description</h2>
    <p>${escapeHtml(c.description)}</p>
  </div></section>

  ${galerie.length ? `<section><div class="wrap"><h2>Photos</h2><div class="galerie">${galerie.map((g) => `<img src="${escapeHtml(g)}" alt="${escapeHtml(c.titre)}">`).join("")}</div></div></section>` : ""}

  ${reassuranceBlock(reassurance, "wrap")}

  <section id="commander"><div class="cta-final">
    <h2 style="color:#fff">${escapeHtml(c.titre)}</h2>
    ${prixVente.trim()
      ? checkoutHtml(parseFloat(prixVente) || 0, c.cta)
      : `${prixBlock(prixVente, prixBarre, "#fff")}<a href="#" class="cta">${escapeHtml(c.cta)}</a>`}
  </div></section>

  <footer>© Tous droits réservés${footerLegalLink()}</footer>
  ${mentionsLegalesModal()}
  ${prixVente.trim() ? checkoutScript(parseFloat(prixVente) || 0) : ""}
</body></html>`;
}

// ─── Déclinaisons boutique (multi-produits) des 4 styles ──────────────────────────────
// Même identité visuelle (polices, couleurs, forme du hero) que le template produit
// correspondant, mais la section centrale devient une grille de produits (productGridSection)
// au lieu du bloc "bénéfices + description + galerie" d'un seul produit. Le hero pointe vers
// #produits au lieu d'un unique bloc de commande ; chaque carte gère sa propre commande.

function templateTechBoutique(nomBoutique: string, descriptionBoutique: string, produits: ProduitBoutique[], reassurance: Reassurance, ctaLabel: string): string {
  const accent = "var(--site-accent)";
  const accent2 = "var(--site-accent-2)";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(nomBoutique)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --site-bg:#0a0a0f; --site-text:#f0f0f8; --site-text-muted:rgba(240,240,248,.6);
    --site-accent:#22d3ee; --site-accent-2:#7c3aed; --site-surface:#16161d; --site-border:rgba(255,255,255,.1);
    --fs-h1:clamp(2.2rem,5vw,3.4rem); --fs-h2:clamp(1.6rem,3vw,2.2rem); --fs-body:1rem; --fs-small:.8rem;
  }
  body { background:var(--site-bg); color:var(--site-text); font-family:'Inter',sans-serif; line-height:1.6; }
  h1,h2 { font-family:'Space Grotesk',sans-serif; }
  .wrap { max-width:1100px; margin:0 auto; padding:0 24px; }
  .hero { min-height:60vh; display:flex; align-items:center; padding:60px 0; background:
    radial-gradient(circle at 80% 20%, color-mix(in srgb, ${accent2} 13%, transparent), transparent 50%),
    radial-gradient(circle at 20% 80%, color-mix(in srgb, ${accent} 13%, transparent), transparent 50%); text-align:center; }
  .hero .wrap { display:flex; flex-direction:column; align-items:center; }
  .badge { display:inline-block; padding:6px 14px; border-radius:999px; background:color-mix(in srgb, ${accent} 10%, transparent); border:1px solid color-mix(in srgb, ${accent} 27%, transparent); color:${accent}; font-size:var(--fs-small); font-weight:600; letter-spacing:.06em; text-transform:uppercase; margin-bottom:20px; }
  .hero h1 { font-size:var(--fs-h1); font-weight:700; line-height:1.1; margin-bottom:18px; }
  .hero .sous { color:var(--site-text-muted); font-size:var(--fs-body); margin-bottom:28px; max-width:560px; }
  .cta { display:inline-block; padding:16px 32px; border-radius:10px; background:${accent}; color:#04141a; font-weight:700; text-decoration:none; box-shadow:0 0 32px color-mix(in srgb, ${accent} 33%, transparent); }
  section { padding:70px 0; }
  h2 { font-size:var(--fs-h2); margin-bottom:32px; text-align:center; }
  .reassurance { border-top:1px solid var(--site-border); }
  .reassurance-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; }
  .reassurance-item { display:flex; gap:12px; align-items:flex-start; }
  .reassurance-icon { font-size:var(--fs-h2); }
  .reassurance-titre { font-weight:600; font-size:var(--fs-body); }
  .reassurance-texte { font-size:var(--fs-small); color:var(--site-text-muted); margin-top:2px; }
  footer { text-align:center; padding:30px; color:var(--site-text-muted); font-size:var(--fs-small); }
  @media(max-width:700px){ .reassurance-grid{grid-template-columns:1fr} }
  ${grilleStyles(accent, "var(--site-surface)", "var(--site-border)", "var(--site-text)", "var(--site-text-muted)")}
  ${checkoutStyles({
    qtyBg: "var(--site-surface)", qtyBorder: "var(--site-border)", qtyColor: "var(--site-text)",
    cardBg: "var(--site-surface)", inputBg: "var(--site-surface)", inputBorder: "var(--site-border)", textColor: "var(--site-text)",
    modalBg: "var(--site-surface)", modalText: "var(--site-text)",
  })}
</style></head>
<body>
  <section class="hero"><div class="wrap">
    <span class="badge">Boutique</span>
    <h1>${escapeHtml(nomBoutique)}</h1>
    <p class="sous">${escapeHtml(descriptionBoutique)}</p>
    <a href="#produits" class="cta">Voir nos produits</a>
  </div></section>

  ${productGridSection(produits, accent, ctaLabel)}

  ${reassuranceBlock(reassurance, "wrap")}

  <footer>© Tous droits réservés${footerLegalLink()}</footer>
  ${mentionsLegalesModal()}
  ${produitsCheckoutScripts(produits)}
</body></html>`;
}

function templateMaisonBoutique(nomBoutique: string, descriptionBoutique: string, produits: ProduitBoutique[], reassurance: Reassurance, ctaLabel: string): string {
  const accent = "var(--site-accent)";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(nomBoutique)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --site-bg:#faf7f2; --site-text:#2b2620; --site-text-muted:#6b5f4f;
    --site-accent:#c2703d; --site-surface:#f1ece2; --site-border:#e0d5c7;
    --fs-h1:clamp(2rem,5vw,3rem); --fs-h2:clamp(1.5rem,3vw,2rem); --fs-body:1rem; --fs-small:.8rem;
  }
  body { background:var(--site-bg); color:var(--site-text); font-family:'Inter',sans-serif; line-height:1.65; }
  h1,h2 { font-family:'Fraunces',serif; font-weight:600; }
  .wrap { max-width:1000px; margin:0 auto; padding:0 24px; }
  .hero { text-align:center; padding:90px 24px 60px; }
  .hero h1 { font-size:var(--fs-h1); margin-bottom:16px; }
  .hero .sous { color:var(--site-text-muted); font-size:var(--fs-body); max-width:520px; margin:0 auto 28px; }
  .cta { display:inline-block; padding:15px 30px; border-radius:999px; background:${accent}; color:#fff; font-weight:600; text-decoration:none; }
  section { padding:60px 0; }
  h2 { font-size:var(--fs-h2); text-align:center; margin-bottom:40px; }
  .reassurance { background:var(--site-surface); }
  .reassurance-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:24px; text-align:center; }
  .reassurance-item { display:flex; flex-direction:column; align-items:center; gap:8px; }
  .reassurance-icon { font-size:var(--fs-h2); }
  .reassurance-titre { font-weight:600; font-size:var(--fs-body); }
  .reassurance-texte { font-size:var(--fs-small); color:var(--site-text-muted); }
  footer { text-align:center; padding:30px; color:var(--site-text-muted); font-size:var(--fs-small); }
  @media(max-width:700px){ .reassurance-grid{grid-template-columns:1fr} }
  ${grilleStyles(accent, "var(--site-surface)", "var(--site-border)", "var(--site-text)", "var(--site-text-muted)")}
  ${checkoutStyles({
    // Pas de bloc CTA final sombre ici (mode boutique — chaque carte gère sa propre commande
    // sur le fond clair de la grille) : contrairement à templateMaison (mono-produit), rien
    // n'empêche de rattacher entièrement ce bloc aux tokens globaux — qty/texte foncés sur
    // fond clair, cohérent avec le reste de la page quelle que soit la couleur d'accent.
    qtyBg: "var(--site-surface)", qtyBorder: "var(--site-border)", qtyColor: "var(--site-text)",
    cardBg: "var(--site-surface)", inputBg: "var(--site-bg)", inputBorder: "var(--site-border)", textColor: "var(--site-text)",
    modalBg: "var(--site-bg)", modalText: "var(--site-text)",
  })}
</style></head>
<body>
  <section class="hero"><div class="wrap">
    <h1>${escapeHtml(nomBoutique)}</h1>
    <p class="sous">${escapeHtml(descriptionBoutique)}</p>
    <a href="#produits" class="cta">Voir nos produits</a>
  </div></section>

  ${productGridSection(produits, accent, ctaLabel)}

  ${reassuranceBlock(reassurance, "wrap")}

  <footer>© Tous droits réservés${footerLegalLink()}</footer>
  ${mentionsLegalesModal()}
  ${produitsCheckoutScripts(produits)}
</body></html>`;
}

function templateBeauteBoutique(nomBoutique: string, descriptionBoutique: string, produits: ProduitBoutique[], reassurance: Reassurance, ctaLabel: string): string {
  const accent = "var(--site-accent)";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(nomBoutique)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;700&family=Inter:wght@400;600&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --site-bg:linear-gradient(180deg,#fff1f5,#f3e8ff 40%,#fff 80%); --site-text:#3a2e35; --site-text-muted:#5c4a53;
    --site-accent:#ec4899; --site-surface:#fff; --site-border:color-mix(in srgb, #ec4899 20%, transparent);
    --fs-h1:clamp(2.4rem,6vw,3.6rem); --fs-h2:clamp(1.6rem,3vw,2.2rem); --fs-body:1rem; --fs-small:.8rem;
  }
  body { background:var(--site-bg); color:var(--site-text); font-family:'Inter',sans-serif; line-height:1.65; }
  h1,h2 { font-family:'Cormorant Garamond',serif; font-weight:700; }
  .wrap { max-width:960px; margin:0 auto; padding:0 24px; }
  .hero { text-align:center; padding:80px 24px 40px; }
  .hero h1 { font-size:var(--fs-h1); margin-bottom:14px; }
  .hero .sous { color:var(--site-text-muted); font-size:var(--fs-body); max-width:480px; margin:0 auto 26px; }
  .cta { display:inline-block; padding:15px 34px; border-radius:999px; background:${accent}; color:#fff; font-weight:600; text-decoration:none; letter-spacing:.02em; }
  section { padding:56px 0; }
  h2 { font-size:var(--fs-h2); text-align:center; margin-bottom:32px; }
  .reassurance-grid { display:flex; justify-content:center; gap:32px; flex-wrap:wrap; text-align:center; }
  .reassurance-item { max-width:180px; }
  .reassurance-icon { font-size:var(--fs-h2); display:block; margin-bottom:6px; }
  .reassurance-titre { font-weight:600; font-size:var(--fs-body); }
  .reassurance-texte { font-size:var(--fs-small); color:var(--site-text-muted); margin-top:2px; }
  footer { text-align:center; padding:30px; color:var(--site-text-muted); font-size:var(--fs-small); }
  ${grilleStyles(accent, "var(--site-surface)", "var(--site-border)", "var(--site-text)", "var(--site-text-muted)")}
  ${checkoutStyles({
    qtyBg: "var(--site-surface)", qtyBorder: "var(--site-border)", qtyColor: accent,
    cardBg: "color-mix(in srgb, " + accent + " 4%, var(--site-surface))", inputBg: "var(--site-surface)", inputBorder: "var(--site-border)", textColor: "var(--site-text)",
    modalBg: "var(--site-surface)", modalText: "var(--site-text)",
  })}
</style></head>
<body>
  <section class="hero"><div class="wrap">
    <h1>${escapeHtml(nomBoutique)}</h1>
    <p class="sous">${escapeHtml(descriptionBoutique)}</p>
    <a href="#produits" class="cta">Voir nos produits</a>
  </div></section>

  ${productGridSection(produits, accent, ctaLabel)}

  ${reassuranceBlock(reassurance, "wrap")}

  <footer>© Tous droits réservés${footerLegalLink()}</footer>
  ${mentionsLegalesModal()}
  ${produitsCheckoutScripts(produits)}
</body></html>`;
}

function templateGeneriqueBoutique(nomBoutique: string, descriptionBoutique: string, produits: ProduitBoutique[], reassurance: Reassurance, ctaLabel: string): string {
  const accent = "var(--site-accent)";
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(nomBoutique)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  :root {
    --site-bg:#fff; --site-text:#111827; --site-text-muted:#4b5563;
    --site-accent:#2563eb; --site-surface:#f9fafb; --site-border:#e5e7eb;
    --fs-h1:clamp(2rem,4.5vw,2.8rem); --fs-h2:clamp(1.4rem,3vw,1.9rem); --fs-body:1rem; --fs-small:.8rem;
  }
  body { background:var(--site-bg); color:var(--site-text); font-family:'Inter',system-ui,sans-serif; line-height:1.6; }
  .wrap { max-width:1040px; margin:0 auto; padding:0 24px; }
  .hero { text-align:center; padding:70px 24px 60px; }
  .hero h1 { font-size:var(--fs-h1); font-weight:800; margin-bottom:14px; }
  .hero .sous { color:var(--site-text-muted); font-size:var(--fs-body); max-width:520px; margin:0 auto 26px; }
  .cta { display:inline-block; padding:14px 30px; border-radius:8px; background:${accent}; color:#fff; font-weight:600; text-decoration:none; }
  section { padding:56px 0; }
  h2 { font-size:var(--fs-h2); font-weight:800; text-align:center; margin-bottom:32px; }
  .reassurance { background:var(--site-surface); border-top:1px solid var(--site-border); border-bottom:1px solid var(--site-border); }
  .reassurance-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:20px; text-align:center; }
  .reassurance-icon { font-size:var(--fs-h2); display:block; margin-bottom:6px; }
  .reassurance-titre { font-weight:600; font-size:var(--fs-body); }
  .reassurance-texte { font-size:var(--fs-small); color:var(--site-text-muted); margin-top:2px; }
  footer { text-align:center; padding:30px; color:var(--site-text-muted); font-size:var(--fs-small); }
  @media(max-width:700px){ .reassurance-grid{grid-template-columns:1fr} }
  ${grilleStyles(accent, "var(--site-surface)", "var(--site-border)", "var(--site-text)", "var(--site-text-muted)")}
  ${checkoutStyles({
    // Pas de bloc CTA final sombre ici (mode boutique) : contrairement à templateGenerique
    // (mono-produit), rien n'empêche de rattacher entièrement ce bloc aux tokens globaux.
    qtyBg: "var(--site-bg)", qtyBorder: "var(--site-border)", qtyColor: "var(--site-text)",
    cardBg: "var(--site-surface)", inputBg: "var(--site-bg)", inputBorder: "var(--site-border)", textColor: "var(--site-text)",
    modalBg: "var(--site-bg)", modalText: "var(--site-text)",
  })}
</style></head>
<body>
  <section class="hero"><div class="wrap">
    <h1>${escapeHtml(nomBoutique)}</h1>
    <p class="sous">${escapeHtml(descriptionBoutique)}</p>
    <a href="#produits" class="cta">Voir nos produits</a>
  </div></section>

  ${productGridSection(produits, accent, ctaLabel)}

  ${reassuranceBlock(reassurance, "wrap")}

  <footer>© Tous droits réservés${footerLegalLink()}</footer>
  ${mentionsLegalesModal()}
  ${produitsCheckoutScripts(produits)}
</body></html>`;
}

export function buildTemplateHtmlBoutique(input: {
  categorie: Categorie;
  nomBoutique: string;
  descriptionBoutique: string;
  produits: ProduitBoutique[];
  reassurance: Reassurance;
  ctaLabel?: string;
}): string {
  const { categorie, nomBoutique, descriptionBoutique, produits, reassurance } = input;
  const ctaLabel = input.ctaLabel?.trim() || "Commander";
  switch (categorie) {
    case "tech":
      return templateTechBoutique(nomBoutique, descriptionBoutique, produits, reassurance, ctaLabel);
    case "maison":
      return templateMaisonBoutique(nomBoutique, descriptionBoutique, produits, reassurance, ctaLabel);
    case "beaute":
      return templateBeauteBoutique(nomBoutique, descriptionBoutique, produits, reassurance, ctaLabel);
    default:
      return templateGeneriqueBoutique(nomBoutique, descriptionBoutique, produits, reassurance, ctaLabel);
  }
}

export function buildTemplateHtml(input: {
  categorie: Categorie;
  contenu: ContenuTexte;
  images: ImagesSite;
  prixVente: string;
  prixBarre: string;
  reassurance: Reassurance;
}): string {
  const { categorie, contenu, images, prixVente, prixBarre, reassurance } = input;
  switch (categorie) {
    case "tech":
      return templateTech(contenu, images, prixVente, prixBarre, reassurance);
    case "maison":
      return templateMaison(contenu, images, prixVente, prixBarre, reassurance);
    case "beaute":
      return templateBeaute(contenu, images, prixVente, prixBarre, reassurance);
    default:
      return templateGenerique(contenu, images, prixVente, prixBarre, reassurance);
  }
}
