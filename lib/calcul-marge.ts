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

export type Mode = "france" | "manuel";

export type ChargeInfo = {
  rate: number;    // fraction du CA (proportionnel au prix de vente)
  fixed: number;   // montant flat en €
  breakdown: { label: string; detail: string }[];
};

export function getCharges(
  mode: Mode,
  { extraUE, tauxCharge, tauxTaxe }: { extraUE: boolean; tauxCharge: string; tauxTaxe: string }
): ChargeInfo {
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
