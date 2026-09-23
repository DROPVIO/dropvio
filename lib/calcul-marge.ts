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
// labelKey : clé sous dashboard.calculateur, résolue par l'UI (ce module reste du calcul pur).
const UK_TAX_BANDS: { max: number; rate: number; labelKey: string }[] = [
  { max: 12_570, rate: 0, labelKey: "ukBand0" },
  { max: 50_270, rate: 0.26, labelKey: "ukBand26" },
  { max: 125_140, rate: 0.42, labelKey: "ukBand42" },
  { max: Infinity, rate: 0.47, labelKey: "ukBand47" },
];

// Taux marginal approximatif applicable au prochain livre de profit annuel — indicatif
// seulement, n'entre jamais dans le calcul de marge par vente (Income Tax/NIC se calculent
// sur le profit annuel cumulé, pas transaction par transaction).
export function tauxMarginalUK(profitAnnuel: number): { rate: number; labelKey: string } {
  const band = UK_TAX_BANDS.find((b) => profitAnnuel <= b.max) ?? UK_TAX_BANDS[UK_TAX_BANDS.length - 1];
  return { rate: band.rate, labelKey: band.labelKey };
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
// Le nom affiché de chaque État vient des traductions (dashboard.calculateur.usStates),
// pas de cette table : elle ne porte que le code et le taux.
export const US_STATE_SALES_TAX: { code: string; taux: number }[] = [
  { code: "AL", taux: 0.04 },
  { code: "AK", taux: 0 },
  { code: "AZ", taux: 0.056 },
  { code: "AR", taux: 0.065 },
  { code: "CA", taux: 0.0725 },
  { code: "CO", taux: 0.029 },
  { code: "CT", taux: 0.0635 },
  { code: "DE", taux: 0 },
  { code: "DC", taux: 0.06 },
  { code: "FL", taux: 0.06 },
  { code: "GA", taux: 0.04 },
  { code: "HI", taux: 0.04 },
  { code: "ID", taux: 0.06 },
  { code: "IL", taux: 0.0625 },
  { code: "IN", taux: 0.07 },
  { code: "IA", taux: 0.06 },
  { code: "KS", taux: 0.065 },
  { code: "KY", taux: 0.06 },
  { code: "LA", taux: 0.0445 },
  { code: "ME", taux: 0.055 },
  { code: "MD", taux: 0.06 },
  { code: "MA", taux: 0.0625 },
  { code: "MI", taux: 0.06 },
  { code: "MN", taux: 0.06875 },
  { code: "MS", taux: 0.07 },
  { code: "MO", taux: 0.04225 },
  { code: "MT", taux: 0 },
  { code: "NE", taux: 0.055 },
  { code: "NV", taux: 0.0685 },
  { code: "NH", taux: 0 },
  { code: "NJ", taux: 0.06625 },
  { code: "NM", taux: 0.05125 },
  { code: "NY", taux: 0.04 },
  { code: "NC", taux: 0.0475 },
  { code: "ND", taux: 0.05 },
  { code: "OH", taux: 0.0575 },
  { code: "OK", taux: 0.045 },
  { code: "OR", taux: 0 },
  { code: "PA", taux: 0.06 },
  { code: "RI", taux: 0.07 },
  { code: "SC", taux: 0.06 },
  { code: "SD", taux: 0.042 },
  { code: "TN", taux: 0.07 },
  { code: "TX", taux: 0.0625 },
  { code: "UT", taux: 0.0485 },
  { code: "VT", taux: 0.06 },
  { code: "VA", taux: 0.043 },
  { code: "WA", taux: 0.065 },
  { code: "WV", taux: 0.06 },
  { code: "WI", taux: 0.05 },
  { code: "WY", taux: 0.04 },
];

export function getUsStateTax(code: string): number {
  return US_STATE_SALES_TAX.find((s) => s.code === code)?.taux ?? 0;
}

// ─── Constantes fiscales Belgique (indépendant, vente de marchandises) ────────

export const STRIPE_FIXED_BE = 0.25;
export const STRIPE_RATE_BE_DEFAULT = "1.5";
export const TVA_RATE_BE = 0.21;
export const SEUIL_FRANCHISE_BE = 25_000;
// Cotisations sociales indépendant — appliquées sur la MARGE NETTE (après Stripe/CAC/retour/
// TVA), jamais sur le CA/prix de vente : mécanique volontairement différente de l'URSSAF
// française, voir postCotisationsRate ci-dessous.
export const COTISATIONS_RATE_BE = 0.205;

// ─── Constantes fiscales Suisse (indépendant, vente de marchandises) ──────────

export const STRIPE_FIXED_CH = 0.30;          // CHF 0,30
export const STRIPE_RATE_CH_DEFAULT = "2.9";
export const TVA_RATE_CH = 0.081;
export const SEUIL_IMMAT_CH = 100_000;        // CHF
// AVS/AI/APG — même mécanique post-marge que la Belgique. Le taux de 10,0% n'est le taux
// plein qu'au-dessus de CHF 60 500 de revenu annuel net ; en dessous, barème dégressif non
// modélisé ici (voir avertissement fixe affiché dans l'UI).
export const COTISATIONS_RATE_CH = 0.10;
export const COTISATIONS_SEUIL_CH = 60_500;

// ─── Constantes fiscales Canada — Québec (travailleur autonome) ───────────────

export const STRIPE_FIXED_CA = 0.30;          // CAD 0,30
export const STRIPE_RATE_CA_DEFAULT = "2.9";
export const TPS_TVQ_RATE_CA = 0.14975;       // TPS + TVQ combinées
export const SEUIL_PETIT_FOURNISSEUR_CA = 30_000; // CAD — seuil courant, à reconfirmer sur revenuquebec.ca
// RRQ + RQAP combinés — même mécanique post-marge. Plafonnées au-delà de 74 600$ de revenu
// net annuel, plafond non modélisé ici (voir avertissement fixe).
export const COTISATIONS_RATE_CA = 0.1136;    // 10,6% + 0,764%
export const COTISATIONS_PLAFOND_CA = 74_600; // CAD

// ─── Constantes fiscales Luxembourg (indépendant, vente de marchandises) ──────

export const STRIPE_FIXED_LU = 0.25;
export const STRIPE_RATE_LU_DEFAULT = "1.5";
export const TVA_RATE_LU = 0.17;
export const SEUIL_FRANCHISE_LU = 50_000;
// Pas de taux de cotisations sociales (CCSS) fiable à modéliser ici — voir l'avertissement
// fixe affiché dans l'UI à la place d'un pourcentage automatique. Contrairement à
// Belgique/Suisse/Canada, le mode Luxembourg n'a donc pas de postCotisationsRate du tout.

// ─── Constantes fiscales Allemagne (Kleinunternehmer, vente de marchandises) ──

export const STRIPE_FIXED_DE = 0.25;
export const STRIPE_RATE_DE_DEFAULT = "1.5";
export const TVA_RATE_DE = 0.19;
// Kleinunternehmerregelung (§19 UStG) : franchise de TVA à DOUBLE condition — CA de l'année
// précédente ET CA prévisionnel de l'année en cours doivent chacun rester sous leur propre
// seuil. Contrairement à France/Belgique/Suisse (un seul CA cumulé comparé à un seuil), ce
// sont ici deux montants distincts, chacun avec son propre seuil — voir les deux
// SeuilTracker indépendants dans l'UI plutôt qu'un tracker à double palier.
export const SEUIL_KLEINUNTERNEHMER_PRECEDENT_DE = 25_000;    // CA année précédente
export const SEUIL_KLEINUNTERNEHMER_PREVISIONNEL_DE = 100_000; // CA prévisionnel année en cours
// Pas de postCotisationsRate — Gewerbesteuer/Einkommensteuer non modélisées ici (dépendent du
// Hebesatz communal et d'un barème progressif), voir l'avertissement fixe affiché dans l'UI.

// ─── Constantes fiscales Italie (régime forfettario, commerce de détail) ──────

export const STRIPE_FIXED_IT = 0.25;
export const STRIPE_RATE_IT_DEFAULT = "1.5";
export const SEUIL_FORFETTARIO_IT = 85_000;
// Coefficiente di redditività pour le commerce de détail non alimentaire — le code ATECO le
// plus proche du dropshipping. Vérifie ton code ATECO réel : ce coefficient varie fortement
// selon l'activité déclarée (d'autres activités ont des coefficients différents).
export const COEFFICIENTE_REDDITIVITA_IT = 0.54;
export const IMPOSTA_RATE_NUOVA_IT = 0.05;     // 5% — nouvelle activité, 5 premières années
export const IMPOSTA_RATE_ORDINARIA_IT = 0.15; // 15% — activité établie
export type RegimeImpostaIT = "nuova" | "ordinaria";

// ─── Constantes fiscales Espagne (autónomo, vente de marchandises) ────────────

export const STRIPE_FIXED_ES = 0.25;
export const STRIPE_RATE_ES_DEFAULT = "1.5";
// Pas de seuil de franchise TVA général pour un résident espagnol — l'IVA est due dès le
// premier euro de CA, contrairement à France/Belgique/Suisse/Canada/Luxembourg/Italie.
export const TVA_RATE_ES = 0.21;

export type Mode = "france" | "uk" | "us" | "be" | "ch" | "ca" | "lu" | "de" | "it" | "es" | "manuel";

export function getDevise(mode: Mode): string {
  if (mode === "uk") return "£";
  if (mode === "us") return "$";
  if (mode === "ch") return "CHF";
  if (mode === "ca") return "C$";
  return "€"; // france, be, lu, de, it, es
}

/** Ligne du détail des charges. Ce module est du calcul pur (pas de contexte React), donc
 *  il ne formule pas de texte traduit : il renvoie des clés (`labelKey`, `noteKey`) que
 *  l'UI résout sous dashboard.calculateur, plus la partie chiffrée, neutre en langue. */
export type ChargeLine = {
  labelKey: string;
  /** Partie numérique déjà formatée (pourcentages, montants) — indépendante de la langue. */
  detail: string;
  /** Complément explicatif éventuel, à concaténer après `detail`. */
  noteKey?: string;
  noteValues?: Record<string, string | number>;
};

export type ChargeInfo = {
  rate: number;    // fraction du CA (proportionnel au prix de vente)
  fixed: number;   // montant flat en devise du mode
  breakdown: ChargeLine[];
  // Taux de cotisations appliqué APRÈS les autres déductions (Stripe/CAC/retour/TVA-VAT-
  // sales tax), sur la marge nette pré-cotisations — jamais sur le CA. Mécanique distincte de
  // `rate`/`fixed` (qui s'appliquent au prix de vente), utilisée par Belgique/Suisse/Canada.
  // undefined = pas de cotisations post-marge pour ce mode (France les inclut déjà dans
  // `rate` puisqu'elles se calculent sur le CA ; UK/US/Luxembourg/manuel n'en ont pas ici).
  postCotisationsRate?: number;
};

export function getCharges(
  mode: Mode,
  {
    extraUE, tauxCharge, tauxTaxe,
    stripeRateUK, tauxRetourUK,
    stripeRateUS, tauxRetourUS, usState, salesTaxNexusUS,
    stripeRateBE, tauxRetourBE,
    stripeRateCH, tauxRetourCH,
    stripeRateCA, tauxRetourCA,
    stripeRateLU, tauxRetourLU,
    stripeRateDE, tauxRetourDE,
    stripeRateIT, tauxRetourIT, regimeImpostaIT,
    stripeRateES, tauxRetourES,
  }: {
    extraUE: boolean;
    tauxCharge: string;
    tauxTaxe: string;
    stripeRateUK?: string;
    tauxRetourUK?: string;
    stripeRateUS?: string;
    tauxRetourUS?: string;
    usState?: string;
    salesTaxNexusUS?: boolean;
    stripeRateBE?: string;
    tauxRetourBE?: string;
    stripeRateCH?: string;
    tauxRetourCH?: string;
    stripeRateCA?: string;
    tauxRetourCA?: string;
    stripeRateLU?: string;
    tauxRetourLU?: string;
    stripeRateDE?: string;
    tauxRetourDE?: string;
    stripeRateIT?: string;
    tauxRetourIT?: string;
    regimeImpostaIT?: RegimeImpostaIT;
    stripeRateES?: string;
    tauxRetourES?: string;
  }
): ChargeInfo {
  if (mode === "be") {
    const stripeRate = (parseFloat(stripeRateBE ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourBE ?? "") || 0) / 100;
    return {
      rate: stripeRate + TVA_RATE_BE + tauxRetour,
      fixed: STRIPE_FIXED_BE,
      postCotisationsRate: COTISATIONS_RATE_BE,
      breakdown: [
        { labelKey: "bdStripe", detail: `${(stripeRate * 100).toFixed(2)}% + ${STRIPE_FIXED_BE.toFixed(2)}€` },
        { labelKey: "bdTva", detail: `${(TVA_RATE_BE * 100).toFixed(0)}%` },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
        { labelKey: "bdCotisationsBe", detail: `${(COTISATIONS_RATE_BE * 100).toFixed(1)}%`, noteKey: "bdNoteSurMargeNette" },
      ],
    };
  }

  if (mode === "ch") {
    const stripeRate = (parseFloat(stripeRateCH ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourCH ?? "") || 0) / 100;
    return {
      rate: stripeRate + TVA_RATE_CH + tauxRetour,
      fixed: STRIPE_FIXED_CH,
      postCotisationsRate: COTISATIONS_RATE_CH,
      breakdown: [
        { labelKey: "bdStripe", detail: `${(stripeRate * 100).toFixed(2)}% + CHF ${STRIPE_FIXED_CH.toFixed(2)}` },
        { labelKey: "bdTva", detail: `${(TVA_RATE_CH * 100).toFixed(1)}%` },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
        {
          labelKey: "bdAvs",
          detail: `${(COTISATIONS_RATE_CH * 100).toFixed(1)}%`,
          noteKey: "bdNoteAvs",
          noteValues: { seuil: COTISATIONS_SEUIL_CH.toLocaleString("fr-CH") },
        },
      ],
    };
  }

  if (mode === "ca") {
    const stripeRate = (parseFloat(stripeRateCA ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourCA ?? "") || 0) / 100;
    return {
      rate: stripeRate + TPS_TVQ_RATE_CA + tauxRetour,
      fixed: STRIPE_FIXED_CA,
      postCotisationsRate: COTISATIONS_RATE_CA,
      breakdown: [
        { labelKey: "bdStripe", detail: `${(stripeRate * 100).toFixed(2)}% + C$${STRIPE_FIXED_CA.toFixed(2)}` },
        { labelKey: "bdTpsTvq", detail: `${(TPS_TVQ_RATE_CA * 100).toFixed(3)}%` },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
        { labelKey: "bdRrqRqap", detail: `${(COTISATIONS_RATE_CA * 100).toFixed(2)}%`, noteKey: "bdNoteRrq" },
      ],
    };
  }

  if (mode === "lu") {
    const stripeRate = (parseFloat(stripeRateLU ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourLU ?? "") || 0) / 100;
    return {
      rate: stripeRate + TVA_RATE_LU + tauxRetour,
      fixed: STRIPE_FIXED_LU,
      // Pas de postCotisationsRate — voir la constante SEUIL_FRANCHISE_LU ci-dessus.
      breakdown: [
        { labelKey: "bdStripe", detail: `${(stripeRate * 100).toFixed(2)}% + ${STRIPE_FIXED_LU.toFixed(2)}€` },
        { labelKey: "bdTva", detail: `${(TVA_RATE_LU * 100).toFixed(0)}%` },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
      ],
    };
  }

  if (mode === "de") {
    const stripeRate = (parseFloat(stripeRateDE ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourDE ?? "") || 0) / 100;
    return {
      rate: stripeRate + TVA_RATE_DE + tauxRetour,
      fixed: STRIPE_FIXED_DE,
      // Pas de postCotisationsRate — voir la constante SEUIL_KLEINUNTERNEHMER_PREVISIONNEL_DE
      // ci-dessus (même traitement que le Luxembourg pour la même raison).
      breakdown: [
        { labelKey: "bdStripe", detail: `${(stripeRate * 100).toFixed(2)}% + ${STRIPE_FIXED_DE.toFixed(2)}€` },
        { labelKey: "bdTvaDe", detail: `${(TVA_RATE_DE * 100).toFixed(0)}%` },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
      ],
    };
  }

  if (mode === "it") {
    const stripeRate = (parseFloat(stripeRateIT ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourIT ?? "") || 0) / 100;
    // Le calcul suppose que le marchand reste sous le seuil de 85 000€ (régime forfettario
    // actif, TVA exonérée) — voir le tracker de seuil dans l'UI, qui prévient de l'effet de
    // seuil brutal (perte du forfettario + TVA 22% dès le premier euro au-dessus) sans faire
    // basculer ce calcul en régime ordinaire (dont le barème IRPEF/INPS n'est pas modélisé ici).
    const impostaTaux = regimeImpostaIT === "ordinaria" ? IMPOSTA_RATE_ORDINARIA_IT : IMPOSTA_RATE_NUOVA_IT;
    const impostaEffectiveRate = COEFFICIENTE_REDDITIVITA_IT * impostaTaux;
    return {
      rate: stripeRate + tauxRetour + impostaEffectiveRate,
      fixed: STRIPE_FIXED_IT,
      breakdown: [
        { labelKey: "bdStripe", detail: `${(stripeRate * 100).toFixed(2)}% + ${STRIPE_FIXED_IT.toFixed(2)}€` },
        { labelKey: "bdTva", detail: "0%", noteKey: "bdNoteForfettario" },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
        {
          labelKey: "bdImposta",
          detail: `${(impostaEffectiveRate * 100).toFixed(2)}%`,
          noteKey: "bdNoteImposta",
          noteValues: {
            coefficiente: (COEFFICIENTE_REDDITIVITA_IT * 100).toFixed(0),
            taux: (impostaTaux * 100).toFixed(0),
          },
        },
      ],
    };
  }

  if (mode === "es") {
    const stripeRate = (parseFloat(stripeRateES ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourES ?? "") || 0) / 100;
    return {
      rate: stripeRate + TVA_RATE_ES + tauxRetour,
      fixed: STRIPE_FIXED_ES,
      breakdown: [
        { labelKey: "bdStripe", detail: `${(stripeRate * 100).toFixed(2)}% + ${STRIPE_FIXED_ES.toFixed(2)}€` },
        { labelKey: "bdIva", detail: `${(TVA_RATE_ES * 100).toFixed(0)}%` },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
      ],
    };
  }

  if (mode === "uk") {
    const stripeRate = (parseFloat(stripeRateUK ?? "") || 0) / 100;
    const tauxRetour = (parseFloat(tauxRetourUK ?? "") || 0) / 100;
    return {
      rate: stripeRate + VAT_RATE_UK + tauxRetour,
      fixed: STRIPE_FIXED_UK,
      breakdown: [
        { labelKey: "bdStripeUk", detail: `${(stripeRate * 100).toFixed(2)}% + £${STRIPE_FIXED_UK.toFixed(2)}` },
        { labelKey: "bdVat", detail: `${(VAT_RATE_UK * 100).toFixed(0)}%` },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
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
        { labelKey: "bdStripeUs", detail: `${(stripeRate * 100).toFixed(2)}% + $${STRIPE_FIXED_US.toFixed(2)}` },
        { labelKey: "bdRetour", detail: `${(tauxRetour * 100).toFixed(1)}%` },
        salesTaxNexusUS
          ? {
              labelKey: "bdSalesTax",
              detail: `${(salesTaxRate * 100).toFixed(3)}%`,
              noteKey: "bdNoteSalesTaxEtat",
              noteValues: { etat: usState || "—" },
            }
          : { labelKey: "bdSalesTax", detail: "0%", noteKey: "bdNoteNexus" },
      ],
    };
  }

  if (mode === "france") {
    const stripeRate = extraUE ? STRIPE_RATE_HORS_UE : STRIPE_RATE_UE;
    const breakdown: ChargeLine[] = [
      { labelKey: "bdUrssaf", detail: `${(URSSAF_RATE * 100).toFixed(1).replace(".", ",")}%`, noteKey: "bdNoteDuCa" },
      {
        labelKey: "bdStripe",
        detail: `${(stripeRate * 100).toFixed(1)}% + ${STRIPE_FIXED.toFixed(2)}€`,
        noteKey: extraUE ? "bdNoteHorsUe" : "bdNoteUe",
      },
    ];
    if (extraUE) {
      breakdown.push({ labelKey: "bdTaxeUe", detail: `${TAXE_UE_FLAT.toFixed(2)}€`, noteKey: "bdNoteFlat" });
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
      { labelKey: "bdTauxCharge", detail: `${tauxCharge || 0}%` },
      { labelKey: "bdTauxTaxe", detail: `${tauxTaxe || 0}%` },
    ],
  };
}

// Prix de vente minimum pour atteindre une marge nette cible (%), charges/fixes du mode actif
// inclus. Généralisé pour tenir compte de postCotisationsRate (Belgique/Suisse/Canada) : si
// margeNette = (vente*(1-rate) - fixe) * (1-C) = target*vente, alors
// vente = fixe*(1-C) / [(1-rate)*(1-C) - target] — se réduit exactement à l'ancienne formule
// quand C = 0 (tous les autres modes).
export function calcPrixVenteMin(
  margeCiblePct: number,
  fournisseur: number,
  livraison: number,
  pub: number,
  charges: ChargeInfo
): number | null {
  const fixe = fournisseur + livraison + pub + charges.fixed;
  const target = margeCiblePct / 100;
  const unMoinsC = 1 - (charges.postCotisationsRate ?? 0);
  const denom = (1 - charges.rate) * unMoinsC - target;
  if (denom <= 0) return null;
  return (fixe * unMoinsC) / denom;
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

/** Clé de traduction (dashboard.calculateur.*) du qualificatif de marge, résolue par l'UI. */
export function getMargeLabelKey(pct: number): string {
  if (pct >= 40) return "margeExcellente";
  if (pct >= 20) return "margeCorrecte";
  return "margeTropFaible";
}
