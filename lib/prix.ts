// Prix affichés : formatage dans la langue de l'interface à partir de la source unique
// (lib/plan-limits.ts, lib/expert-pricing.ts). Aucun montant d'abonnement ne doit être écrit en
// dur dans un composant ou dans messages/*.json : les messages reçoivent {prixPro},
// {prixAgency}, {prixExpert}, {budgetPro} ou {budgetAgency} via valeursPrix().
import { AGENCY_PRICE_EUR, AI_BUDGET_EUR_PAR_PLAN, PRO_PRICE_EUR } from "./plan-limits";
import { EXPERT_BASE_EUR } from "./expert-pricing";

export type PlanPayantAffiche = "pro" | "agency";

export const PRIX_PLAN_EUR: Record<PlanPayantAffiche, number> = {
  pro: PRO_PRICE_EUR,
  agency: AGENCY_PRICE_EUR,
};

/** « 29 € » (fr), « €29 » (en)… Pas de décimales pour un montant rond. */
export function formatEuros(montant: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: Number.isInteger(montant) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(montant);
}

/** Valeurs à passer à t() pour tout message qui cite un prix ou un budget de plan. */
export function valeursPrix(locale: string) {
  return {
    prixPro: formatEuros(PRO_PRICE_EUR, locale),
    prixAgency: formatEuros(AGENCY_PRICE_EUR, locale),
    prixExpert: formatEuros(EXPERT_BASE_EUR, locale),
    budgetPro: formatEuros(AI_BUDGET_EUR_PAR_PLAN.pro, locale),
    budgetAgency: formatEuros(AI_BUDGET_EUR_PAR_PLAN.agency, locale),
  };
}
