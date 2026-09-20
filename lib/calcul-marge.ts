// Logique de calcul du calculateur de marge — extraite de app/tools/calculateur-marge/page.tsx
// pour être réutilisable ailleurs (ex: dashboard) sans dupliquer le code.

// ─── Constantes fiscales France (auto-entrepreneur, vente de marchandises) ────

export const URSSAF_RATE = 0.123;          // 12,3% du CA
export const SEUIL_TVA = 85000;            // franchise en base
export const SEUIL_TVA_MAJORE = 93500;     // limite majorée
export const TAXE_UE_FLAT = 3;             // taxe UE colis extra-UE < 150€ (juillet 2026)
export const STRIPE_FIXED = 0.25;
export const STRIPE_RATE_UE = 0.015;       // 1,5% + 0,25€
export const STRIPE_RATE_HORS_UE = 0.025;  // 2,5% + 0,25€

// ─── Constantes fiscales Royaume-Uni (sole trader, vente de marchandises) ─────

export const VAT_RATE_UK = 0.20;              // taux standard VAT
export const STRIPE_FIXED_UK = 0.20;          // £0,20 fixe (carte domestique) — non éditable,
                                               // même logique que STRIPE_FIXED pour la France
export const STRIPE_RATE_UK_DEFAULT = "1.5";  // %, pré-rempli mais éditable dans l'UI
// Seuil des droits de douane à l'import (juin 2026) : 0 en dessous, variable par catégorie
// au-delà, jamais calculé automatiquement — juste un avertissement dans l'UI. Ce seuil doit
// disparaître à partir d'octobre 2028 au plus tôt (confirmé juin 2026) : pas d'action requise
// avant, mais à surveiller sur gov.uk.
export const DOUANE_SEUIL_UK = 135;

// Income Tax + Class 4 National Insurance combinés, sur le PROFIT ANNUEL (pas par vente) —
// un sole trader paie les deux simultanément sur la même tranche. Seuils donnés dans la
// demande d'origine : 12 570£ et 50 270£. Le seuil du taux additionnel (125 140£, régime
// gov.uk en vigueur au moment de l'écriture) n'a pas été fourni explicitement — à revérifier
// sur gov.uk, contrairement aux deux premiers seuils qui étaient explicites.
const UK_TAX_BANDS: { max: number; rate: number; label: string }[] = [
  { max: 12_570, rate: 0, label: "0% — en dessous du seuil d'imposition" },
  { max: 50_270, rate: 0.26, label: "26% (Income Tax 20% + Class 4 NIC 6%)" },
  { max: 125_140, rate: 0.42, label: "42% (Income Tax 40% + Class 4 NIC 2%)" },
  { max: Infinity, rate: 0.47, label: "47% (Income Tax 45% + Class 4 NIC 2%)" },
];

// Taux marginal approximatif applicable au prochain livre de profit annuel — indicatif
// seulement, n'entre jamais dans le calcul de marge par vente (Income Tax/NIC se calculent
// sur le profit annuel cumulé, pas transaction par transaction).
export function tauxMarginalUK(profitAnnuel: number): { rate: number; label: string } {
  const band = UK_TAX_BANDS.find((b) => profitAnnuel <= b.max) ?? UK_TAX_BANDS[UK_TAX_BANDS.length - 1];
  return { rate: band.rate, label: band.label };
}

// ─── Constantes fiscales États-Unis (sole proprietor / LLC, vente de marchandises) ────

export const STRIPE_FIXED_US = 0.30;          // $0,30 fixe (carte domestique) — non éditable,
                                               // même logique que STRIPE_FIXED pour la France
export const STRIPE_RATE_US_DEFAULT = "2.9";  // %, pré-rempli mais éditable dans l'UI

// Taux de base "state sales tax" par État du CLIENT (pas du vendeur) — taux d'État
// uniquement, HORS surtaxes locales (comté/ville), qui peuvent ajouter plusieurs points de
// pourcentage selon la localité exacte. Sources publiques (Tax Foundation), à revérifier
// périodiquement : ces taux évoluent d'une année sur l'autre. 5 États sans sales tax d'État :
// Alaska, Delaware, Montana, New Hampshire, Oregon (souvent résumés "NOMAD").
export const US_STATE_SALES_TAX: { code: string; nom: string; taux: number }[] = [
  { code: "AL", nom: "Alabama", taux: 0.04 },
  { code: "AK", nom: "Alaska", taux: 0 },
  { code: "AZ", nom: "Arizona", taux: 0.056 },
  { code: "AR", nom: "Arkansas", taux: 0.065 },
  { code: "CA", nom: "Californie", taux: 0.0725 },
  { code: "CO", nom: "Colorado", taux: 0.029 },
  { code: "CT", nom: "Connecticut", taux: 0.0635 },
  { code: "DE", nom: "Delaware", taux: 0 },
  { code: "DC", nom: "District de Columbia", taux: 0.06 },
  { code: "FL", nom: "Floride", taux: 0.06 },
  { code: "GA", nom: "Géorgie", taux: 0.04 },
  { code: "HI", nom: "Hawaï", taux: 0.04 },
  { code: "ID", nom: "Idaho", taux: 0.06 },
  { code: "IL", nom: "Illinois", taux: 0.0625 },
  { code: "IN", nom: "Indiana", taux: 0.07 },
  { code: "IA", nom: "Iowa", taux: 0.06 },
  { code: "KS", nom: "Kansas", taux: 0.065 },
  { code: "KY", nom: "Kentucky", taux: 0.06 },
  { code: "LA", nom: "Louisiane", taux: 0.0445 },
  { code: "ME", nom: "Maine", taux: 0.055 },
  { code: "MD", nom: "Maryland", taux: 0.06 },
  { code: "MA", nom: "Massachusetts", taux: 0.0625 },
  { code: "MI", nom: "Michigan", taux: 0.06 },
  { code: "MN", nom: "Minnesota", taux: 0.06875 },
  { code: "MS", nom: "Mississippi", taux: 0.07 },
  { code: "MO", nom: "Missouri", taux: 0.04225 },
  { code: "MT", nom: "Montana", taux: 0 },
  { code: "NE", nom: "Nebraska", taux: 0.055 },
  { code: "NV", nom: "Nevada", taux: 0.0685 },
  { code: "NH", nom: "New Hampshire", taux: 0 },
  { code: "NJ", nom: "New Jersey", taux: 0.06625 },
  { code: "NM", nom: "Nouveau-Mexique", taux: 0.05125 },
  { code: "NY", nom: "New York", taux: 0.04 },
  { code: "NC", nom: "Caroline du Nord", taux: 0.0475 },
  { code: "ND", nom: "Dakota du Nord", taux: 0.05 },
  { code: "OH", nom: "Ohio", taux: 0.0575 },
  { code: "OK", nom: "Oklahoma", taux: 0.045 },
  { code: "OR", nom: "Oregon", taux: 0 },
  { code: "PA", nom: "Pennsylvanie", taux: 0.06 },
  { code: "RI", nom: "Rhode Island", taux: 0.07 },
  { code: "SC", nom: "Caroline du Sud", taux: 0.06 },
  { code: "SD", nom: "Dakota du Sud", taux: 0.042 },
  { code: "TN", nom: "Tennessee", taux: 0.07 },
  { code: "TX", nom: "Texas", taux: 0.0625 },
  { code: "UT", nom: "Utah", taux: 0.0485 },
  { code: "VT", nom: "Vermont", taux: 0.06 },
  { code: "VA", nom: "Virginie", taux: 0.043 },
  { code: "WA", nom: "Washington", taux: 0.065 },
  { code: "WV", nom: "Virginie-Occidentale", taux: 0.06 },
  { code: "WI", nom: "Wisconsin", taux: 0.05 },
  { code: "WY", nom: "Wyoming", taux: 0.04 },
];

export function getUsStateTax(code: string): number {
  return US_STATE_SALES_TAX.find((s) => s.code === code)?.taux ?? 0;
}

export type Mode = "france" | "uk" | "us" | "manuel";

export function getDevise(mode: Mode): string {
  if (mode === "uk") return "£";
  if (mode === "us") return "$";
  return "€";
}

export type ChargeInfo = {
  rate: number;    // fraction du CA (proportionnel au prix de vente)
  fixed: number;   // montant flat en devise du mode
  breakdown: { label: string; detail: string }[];
};

export function getCharges(
  mode: Mode,
  { extraUE, tauxCharge, tauxTaxe, stripeRateUK, tauxRetourUK, stripeRateUS, tauxRetourUS, usState, salesTaxNexusUS }: {
    extraUE: boolean;
    tauxCharge: string;
    tauxTaxe: string;
    stripeRateUK?: string;
    tauxRetourUK?: string;
    stripeRateUS?: string;
    tauxRetourUS?: string;
    usState?: string;
    salesTaxNexusUS?: boolean;
  }
): ChargeInfo {
  if (mode === "uk") {
    const stripeRate = (parseFloat(stripeRateUK ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourUK ?? "") || 0) / 100;
    return {
      rate: stripeRate + VAT_RATE_UK + tauxRetour,
      fixed: STRIPE_FIXED_UK,
      breakdown: [
        { label: "Frais Stripe UK", detail: `${(stripeRate * 100).toFixed(2)}% + £${STRIPE_FIXED_UK.toFixed(2)}` },
        { label: "VAT (taux standard)", detail: `${(VAT_RATE_UK * 100).toFixed(0)}%` },
        { label: "Taux de retour hypothétique", detail: `${(tauxRetour * 100).toFixed(1)}%` },
      ],
    };
  }

  if (mode === "us") {
    const stripeRate = (parseFloat(stripeRateUS ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourUS ?? "") || 0) / 100;
    // La sales tax n'est déduite que si le marchand confirme avoir un nexus économique dans
    // l'État du client — sans cette confirmation explicite, aucune obligation de collecte
    // n'est supposée, donc 0% par défaut plutôt qu'un taux appliqué à tort.
    const salesTaxRate = salesTaxNexusUS ? getUsStateTax(usState ?? "") : 0;
    return {
      rate: stripeRate + tauxRetour + salesTaxRate,
      fixed: STRIPE_FIXED_US,
      breakdown: [
        { label: "Frais Stripe US", detail: `${(stripeRate * 100).toFixed(2)}% + $${STRIPE_FIXED_US.toFixed(2)}` },
        { label: "Taux de retour hypothétique", detail: `${(tauxRetour * 100).toFixed(1)}%` },
        {
          label: "Sales tax",
          detail: salesTaxNexusUS
            ? `${(salesTaxRate * 100).toFixed(3)}% (${usState || "—"}, taux de base État)`
            : "0% — nexus non confirmé",
        },
      ],
    };
  }

  if (mode === "france") {
    const stripeRate = extraUE ? STRIPE_RATE_HORS_UE : STRIPE_RATE_UE;
    const breakdown = [
      { label: "URSSAF (auto-entrepreneur)", detail: "12,3% du CA" },
      { label: "Frais Stripe", detail: `${(stripeRate * 100).toFixed(1)}% + ${STRIPE_FIXED.toFixed(2)}€${extraUE ? " (hors UE)" : " (UE)"}` },
    ];
    if (extraUE) {
      breakdown.push({ label: "Taxe UE (colis < 150€)", detail: `${TAXE_UE_FLAT.toFixed(2)}€ flat` });
    }
    return {
      rate: URSSAF_RATE + stripeRate,
      fixed: STRIPE_FIXED + (extraUE ? TAXE_UE_FLAT : 0),
      breakdown,
    };
  }

  const charge = (parseFloat(tauxCharge) || 0) / 100;
  const taxe = (parseFloat(tauxTaxe) || 0) / 100;
  return {
    rate: charge + taxe,
    fixed: 0,
    breakdown: [
      { label: "Taux de charge", detail: `${tauxCharge || 0}%` },
      { label: "Taux de taxe", detail: `${tauxTaxe || 0}%` },
    ],
  };
}

// Prix de vente minimum pour atteindre une marge nette cible (%), charges/fixes du mode actif inclus
export function calcPrixVenteMin(
  margeCiblePct: number,
  fournisseur: number,
  livraison: number,
  pub: number,
  charges: ChargeInfo
): number | null {
  const fixe = fournisseur + livraison + pub + charges.fixed;
  const target = margeCiblePct / 100;
  const denom = 1 - charges.rate - target;
  if (denom <= 0) return null;
  return fixe / denom;
}

// Code couleur partagé pour l'affichage d'une marge nette (%) — calculateur + dashboard.
// Valeurs retournées comme des var() CSS (pas des hex figés) pour suivre le thème
// clair/sombre — valide dans un style={{ color }} React sur un élément HTML classique
// (contrairement aux props SVG de recharts, qui elles ont besoin de couleurs littérales,
// voir les composants graphiques qui font leur propre résolution de thème).
export function getMargeColor(pct: number): string {
  if (pct >= 40) return "var(--success)";
  if (pct >= 20) return "var(--warning)";
  return "var(--danger)";
}

export function getMargeLabel(pct: number): string {
  if (pct >= 40) return "Excellente";
  if (pct >= 20) return "Correcte";
  return "Trop faible";
}
