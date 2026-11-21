import Stripe from "stripe";
import type { FormationOffre } from "./formation";
import type { Plan } from "./plan-limits";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Version d'API fixée explicitement : c'est celle du SDK installé (stripe 22.5.0), seule valeur
// acceptée par ses types. Le code lit des champs de la génération « basil » et suivantes
// (invoice.parent.subscription_details, items[].current_period_end) : l'endpoint webhook doit
// être créé dans le dashboard Stripe avec cette même version, sinon le contenu des événements
// (invoice.paid notamment) n'aura pas cette forme. À changer uniquement avec une mise à jour du SDK.
export const STRIPE_API_VERSION = "2026-07-29.dahlia" as const;

export function createStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });
}

// Un Price Stripe "one-time" (pas récurrent) par offre — le bundle est son propre Price à
// 69,99€, pas la somme des deux Price unitaires (24,99€ + 59,99€ = 84,98€, un autre montant).
const FORMATION_PRICE_ENV: Record<FormationOffre, string> = {
  courte: "STRIPE_PRICE_FORMATION_COURTE",
  longue: "STRIPE_PRICE_FORMATION_LONGUE",
  bundle: "STRIPE_PRICE_FORMATION_BUNDLE",
};

export function getFormationPriceId(offre: FormationOffre): string {
  const envVar = FORMATION_PRICE_ENV[offre];
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`Variable d'environnement ${envVar} manquante (Price Stripe one-time pour "${offre}").`);
  }
  return priceId;
}

// Abonnements : un Price Stripe récurrent mensuel par plan payant. Free n'en a pas — ce n'est
// plus une offre, seulement l'état d'un compte sans abonnement actif (voir 045_abonnements.sql).
// Expert n'en a pas non plus : son prix dépend de la configuration de chaque abonné.
export type PlanPayant = Exclude<Plan, "free" | "expert">;

export const ESSAI_JOURS = 3;

const ABONNEMENT_PRICE_ENV: Record<PlanPayant, string> = {
  pro: "STRIPE_PRICE_PRO",
  agency: "STRIPE_PRICE_AGENCY",
};

export function isPlanPayant(value: unknown): value is PlanPayant {
  return value === "pro" || value === "agency";
}

export function getAbonnementPriceId(plan: PlanPayant): string {
  const envVar = ABONNEMENT_PRICE_ENV[plan];
  const priceId = process.env[envVar];
  if (!priceId) {
    throw new Error(`Variable d'environnement ${envVar} manquante (Price Stripe mensuel pour "${plan}").`);
  }
  return priceId;
}

// Inverse de getAbonnementPriceId, pour retrouver le plan d'un abonnement reçu par webhook.
// Un Price inconnu (ancien tarif archivé, Price d'un autre produit) renvoie null.
export function planDepuisPriceId(priceId: string | null | undefined): PlanPayant | null {
  if (!priceId) return null;
  for (const plan of Object.keys(ABONNEMENT_PRICE_ENV) as PlanPayant[]) {
    if (process.env[ABONNEMENT_PRICE_ENV[plan]] === priceId) return plan;
  }
  return null;
}
