import type { SupabaseClient } from "@supabase/supabase-js";
import type { FormationCollection } from "./formation-content";

export type FormationOffre = FormationCollection | "bundle";
export type FormationOwnership = Record<FormationCollection, boolean>;

// Prix affichés en euros — source pour l'UI (page de vente, calcul de l'économie du
// bundle). Le montant réellement débité est toujours celui du Price Stripe correspondant
// (voir lib/stripe.ts) ; ces valeurs doivent rester synchronisées à la main si les prix
// changent côté Stripe.
export const FORMATION_PRIX: Record<FormationOffre, number> = {
  courte: 24.99,
  longue: 59.99,
  bundle: 69.99,
};

export function collectionsDeOffre(offre: FormationOffre): FormationCollection[] {
  return offre === "bundle" ? ["courte", "longue"] : [offre];
}

// Octroie l'accès à une ou plusieurs collections (bundle = les deux) pour un utilisateur.
// Toujours via le service role (jamais de policy insert pour le client) — appelé depuis le
// webhook Stripe (checkout.session.completed) ou scripts/formation-grant.ts pour un octroi
// manuel support. ignoreDuplicates rend l'opération sûre à rejouer (webhook Stripe livré
// plusieurs fois pour le même paiement, contrainte unique(user_id, collection)).
export async function grantFormationAccess(
  supabaseAdmin: SupabaseClient,
  userId: string,
  offre: FormationOffre,
  options: {
    via: "unitaire" | "bundle" | "manuel";
    prixPayeCentimes?: number;
    stripeCheckoutSessionId?: string;
    stripePaymentIntentId?: string;
  }
): Promise<void> {
  const rows = collectionsDeOffre(offre).map((collection) => ({
    user_id: userId,
    collection,
    prix_paye_centimes: options.prixPayeCentimes ?? 0,
    stripe_checkout_session_id: options.stripeCheckoutSessionId ?? null,
    stripe_payment_intent_id: options.stripePaymentIntentId ?? null,
    achete_via: options.via,
  }));

  const { error } = await supabaseAdmin
    .from("formation_achats")
    .upsert(rows, { onConflict: "user_id,collection", ignoreDuplicates: true });

  if (error) {
    throw new Error(`Impossible d'enregistrer l'achat formation pour ${userId} : ${error.message}`);
  }
}
