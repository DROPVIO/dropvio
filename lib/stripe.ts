import Stripe from "stripe";
import type { FormationOffre } from "./formation";

export function createStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
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
