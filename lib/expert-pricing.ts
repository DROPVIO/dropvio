import { CLAUDE_MODELS } from "./claude-models";
import { AGENCY_PRICE_EUR, PLAN_LIMITS } from "./plan-limits";

// Logique de prix du plan Expert, utilisable côté client (simulateur) ET côté serveur (Checkout).
// Le prix affiché n'est qu'un aperçu : le serveur le recalcule toujours ici à partir de la
// sélection, sans jamais faire confiance à un montant envoyé par le client.

// PLACEHOLDER [SUPPLÉMENT_BASE À CONFIRMER] : supplément mensuel du plan Expert au-dessus du
// prix Agency. Inclus dans EXPERT_BASE_EUR, donc aussi dans la ligne "base" du Checkout
// (lib/expert-billing.ts) : laissé à 0 tant qu'il n'est pas fixé pour ne pas changer la facturation.
export const SUPPLEMENT_BASE_EUR = 0;

export const EXPERT_BASE_EUR = AGENCY_PRICE_EUR + SUPPLEMENT_BASE_EUR;

// Les clés sont les valeurs stockées en base (contraintes de la migration 036) : "fable-5"
// désigne l'offre Fable, le modèle réellement appelé est dans apiId.
// ancienPlafondSites : plafonds fixes d'avant l'enveloppe de tokens. Ils ne servent plus à vendre
// (voir plafondSites) ; parseExpertSelection les accepte encore pour que le webhook Stripe relise
// les abonnements souscrits avant le changement à chaque renouvellement.
export const EXPERT_MODELS = {
  // [CACHE_LECTURE_FABLE_5_2 À CONFIRMER] : tarif de lecture du cache repris de Fable 5.1 ; il ne
  // sert qu'au coût réel journalisé (lib/expert-generation.ts), pas au prix vendu.
  "fable-5": { apiId: CLAUDE_MODELS.fable, label: "Claude Fable 5.2", ancienPlafondSites: 100, inputUsdParMillion: 8, outputUsdParMillion: 40, cacheLectureUsdParMillion: 0.25 },
  "opus-5-5": { apiId: CLAUDE_MODELS.opus, label: "Claude Opus 5.5", ancienPlafondSites: 250, inputUsdParMillion: 4, outputUsdParMillion: 20, cacheLectureUsdParMillion: 0.2 },
} as const;

export type ExpertModel = keyof typeof EXPERT_MODELS;

// Modèle proposé par défaut dans les configurateurs.
export const EXPERT_MODELE_DEFAUT: ExpertModel = "opus-5-5";

// Tant que le Studio IA n'est pas en production, on ne vend pas de crédits images :
// les curseurs sont masqués et les routes de paiement refusent ces quantités.
export const EXPERT_MEDIAS_EN_VENTE = false;

export type ExpertSelection = {
  model: ExpertModel;
  sites: number;
  images: number;
};

export type ExpertPrice = {
  base: number;
  sites: number;
  images: number;
  total: number;
};

// ─── PLACEHOLDER ─────────────────────────────────────────────────────────────
// Valeurs provisoires, à remplacer avant la mise en production.
export const TAUX_USD_EUR = 0.92; // PLACEHOLDER [À CONFIRMER] : taux de change USD → EUR
export const TOKENS_PAR_SITE_OPUS = 1_000_000; // PLACEHOLDER [À MESURER] : tokens moyens par site multipage avec Opus
export const TOKENS_PAR_SITE_FABLE = 1_000_000; // PLACEHOLDER [À MESURER] : tokens moyens par site multipage avec Fable
export const RATIO_ENTREE_SORTIE = 3; // PLACEHOLDER [À REMPLACER PAR LA MESURE RÉELLE] : tokens d'entrée par token de sortie
export const MARGE_PAR_MILLION_TOKENS_EUR = 0.5; // marge ajoutée au coût réel, en euros par million de tokens
export const IMAGE_PRICE_EUR = 0.1; // PLACEHOLDER [PRIX_IMAGE À CONFIRMER] : fournisseur d'images non choisi
export const IMAGES_MAX = 500; // PLACEHOLDER : images par mois au maximum
// ─────────────────────────────────────────────────────────────────────────────

function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function clampQuantity(value: number, max: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(Math.trunc(value), 0), max);
}

export function tokensParSite(model: ExpertModel): number {
  return model === "opus-5-5" ? TOKENS_PAR_SITE_OPUS : TOKENS_PAR_SITE_FABLE;
}

// Enveloppe mensuelle de tokens du plan Expert : autant de sites Opus que le quota mensuel du
// plan Agency (lib/plan-limits.ts).
const SITES_MOIS_AGENCY = PLAN_LIMITS.agency.sitesParMoisMax;
if (SITES_MOIS_AGENCY === null) throw new Error("expert-pricing : l'enveloppe Expert suppose un quota de sites Agency fini.");
export const ENVELOPPE_TOKENS_MOIS = SITES_MOIS_AGENCY * TOKENS_PAR_SITE_OPUS;

// Sites créables dans l'enveloppe avec ce modèle : plus un site lui coûte de tokens, moins il
// en tient. Pas de plafond fixe par modèle.
export function plafondSites(model: ExpertModel): number {
  return Math.floor(ENVELOPPE_TOKENS_MOIS / tokensParSite(model));
}

// Coût réel moyen d'un million de tokens, en euros : moyenne des tarifs d'entrée et de sortie
// pondérée par RATIO_ENTREE_SORTIE.
export function coutMoyenParMillionEur(model: ExpertModel): number {
  const { inputUsdParMillion, outputUsdParMillion } = EXPERT_MODELS[model];
  return ((RATIO_ENTREE_SORTIE * inputUsdParMillion + outputUsdParMillion) / (RATIO_ENTREE_SORTIE + 1)) * TAUX_USD_EUR;
}

// Prix d'un site = millions de tokens du site × (coût réel moyen + marge par million). Arrondi au
// centime par site pour que prix unitaire × quantité corresponde exactement à la ligne facturée.
export function siteUnitPriceEur(model: ExpertModel): number {
  return roundToCents((tokensParSite(model) / 1_000_000) * (coutMoyenParMillionEur(model) + MARGE_PAR_MILLION_TOKENS_EUR));
}

export function clampSelection(selection: ExpertSelection): ExpertSelection {
  return {
    model: selection.model,
    sites: clampQuantity(selection.sites, plafondSites(selection.model)),
    images: clampQuantity(selection.images, IMAGES_MAX),
  };
}

export function expertPrice(selection: ExpertSelection): ExpertPrice {
  const { model, sites, images } = clampSelection(selection);
  const price = {
    base: EXPERT_BASE_EUR,
    sites: roundToCents(sites * siteUnitPriceEur(model)),
    images: roundToCents(images * IMAGE_PRICE_EUR),
  };
  return { ...price, total: roundToCents(price.base + price.sites + price.images) };
}

// Recharge de crédits : mêmes tarifs que l'abonnement, sans la base mensuelle.
export function expertRechargePrice(selection: ExpertSelection): Omit<ExpertPrice, "base"> {
  const { sites, images } = expertPrice(selection);
  return { sites, images, total: roundToCents(sites + images) };
}

// Changement de modèle dans le configurateur : le nombre de sites est recalé sur le plafond du
// nouveau modèle s'il le dépasse, sinon conservé.
export function changerModele(selection: ExpertSelection, model: ExpertModel): ExpertSelection {
  return clampSelection({ ...selection, model });
}

export type ExpertMode = "abonnement" | "recharge";

export type ExpertPrixDetail = {
  agency: number;
  supplement: number;
  sites: number;
  images: number;
};

// Prix affiché par le configurateur de la landing : mêmes calculs que le Checkout (expertPrice,
// expertRechargePrice), avec la base détaillée en prix Agency + supplément Expert. En recharge,
// pas de base mensuelle.
export function calculerPrixExpert(
  selection: ExpertSelection,
  mode: ExpertMode = "abonnement",
): { selection: ExpertSelection; detail: ExpertPrixDetail; total: number } {
  const retenue = clampSelection(selection);
  const { sites, images } = expertPrice(retenue);
  const base = mode === "abonnement";
  const detail = {
    agency: base ? AGENCY_PRICE_EUR : 0,
    supplement: base ? SUPPLEMENT_BASE_EUR : 0,
    sites,
    images,
  };
  const total = base ? expertPrice(retenue).total : expertRechargePrice(retenue).total;
  return { selection: retenue, detail, total };
}

export type LigneRecapExpert = { cle: "agency" | "supplement" | "sites" | "images"; montant: number; quantite?: number };

// Lignes du récapitulatif des configurateurs (carte Expert, /expert). La ligne Images n'apparaît
// que si les crédits images sont en vente (EXPERT_MEDIAS_EN_VENTE), comme son curseur.
export function lignesRecapExpert(
  selection: ExpertSelection,
  mode: ExpertMode = "abonnement",
  mediasEnVente: boolean = EXPERT_MEDIAS_EN_VENTE,
): LigneRecapExpert[] {
  const { selection: retenue, detail } = calculerPrixExpert(selection, mode);
  const abonnement = mode === "abonnement";
  const lignes: (LigneRecapExpert | null)[] = [
    abonnement ? { cle: "agency", montant: detail.agency } : null,
    abonnement && detail.supplement > 0 ? { cle: "supplement", montant: detail.supplement } : null,
    { cle: "sites", montant: detail.sites, quantite: retenue.sites },
    mediasEnVente ? { cle: "images", montant: detail.images, quantite: retenue.images } : null,
  ];
  return lignes.filter((ligne): ligne is LigneRecapExpert => ligne !== null);
}

// Ce qu'on accepte de vendre aujourd'hui (Checkout, recharge, config suivante) : sites dans
// l'enveloppe du modèle, et pas de médias tant qu'ils ne sont pas en vente. Le webhook Stripe ne
// passe pas par ici : il relit les abonnements existants avec parseExpertSelection seul.
export function isSelectionVendable(selection: ExpertSelection): boolean {
  const medias = EXPERT_MEDIAS_EN_VENTE || selection.images === 0;
  return medias && selection.sites <= plafondSites(selection.model);
}

// Validation stricte des routes de paiement et du webhook : une sélection hors limites est
// refusée, pas ramenée dans les bornes comme dans le simulateur. Côté sites, la borne est la plus
// large entre l'enveloppe et l'ancien plafond fixe, pour relire les abonnements souscrits avant
// l'enveloppe ; les nouvelles ventes sont bornées par isSelectionVendable.
function entierDansBornes(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

export function parseExpertSelection(value: unknown): ExpertSelection | null {
  if (typeof value !== "object" || value === null) return null;
  // Une clé « videos » laissée par d'anciennes metadata Stripe est ignorée.
  const { model, sites, images } = value as Record<string, unknown>;
  if (typeof model !== "string" || !Object.hasOwn(EXPERT_MODELS, model)) return null;
  if (typeof sites !== "number" || typeof images !== "number") return null;

  const m = model as ExpertModel;
  const maxSites = Math.max(plafondSites(m), EXPERT_MODELS[m].ancienPlafondSites);
  const valide = entierDansBornes(sites, maxSites) && entierDansBornes(images, IMAGES_MAX);
  return valide ? { model: m, sites, images } : null;
}
