// Traitement des événements Stripe reçus par app/api/webhooks/stripe/route.ts, séparé de la
// route pour être testé sans serveur (lib/stripe-webhook.test.ts).
//
// - Signature vérifiée sur le corps brut avant tout traitement (verifierEvenement).
// - Idempotence : chaque event.id est noté dans stripe_evenements (migration 065) avant d'être
//   traité ; un événement déjà noté est ignoré. En cas d'échec du traitement, la note est
//   retirée pour que la nouvelle tentative de Stripe soit traitée.
// - Le plan se déduit toujours de l'identifiant de prix (variables STRIPE_PRICE_*), jamais du
//   montant (lib/stripe.ts, planDepuisPriceId, appelé par synchroniserAbonnement).
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { synchroniserAbonnement } from "./abonnement";
import { grantFormationAccess, type FormationOffre } from "./formation";
import { enregistrerPeriodeExpert, enregistrerRechargeExpert, isRechargeExpert, terminerAbonnementExpert } from "./expert-billing";

/** Événements que l'endpoint doit recevoir (à cocher dans le dashboard Stripe). */
export const EVENEMENTS_STRIPE = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

export type DependancesWebhook = {
  admin: SupabaseClient;
  /** Relecture de l'abonnement : Stripe ne garantit pas l'ordre de livraison des événements. */
  lireAbonnement: (id: string) => Promise<Stripe.Subscription>;
  synchroniserAbonnement?: typeof synchroniserAbonnement;
  grantFormationAccess?: typeof grantFormationAccess;
  enregistrerPeriodeExpert?: typeof enregistrerPeriodeExpert;
  enregistrerRechargeExpert?: typeof enregistrerRechargeExpert;
  isRechargeExpert?: typeof isRechargeExpert;
  terminerAbonnementExpert?: typeof terminerAbonnementExpert;
};

type ConstructeurEvenement = { webhooks: { constructEvent: (corps: string, signature: string, secret: string) => Stripe.Event } };

/** Vérifie la signature sur le corps brut ; null si elle est absente ou invalide. */
export function verifierEvenement(stripe: ConstructeurEvenement, corps: string, signature: string | null, secret: string): Stripe.Event | null {
  if (!signature) return null;
  try {
    return stripe.webhooks.constructEvent(corps, signature, secret);
  } catch {
    return null;
  }
}

// Table absente (migration 065 non appliquée) : PostgREST répond 42P01 ou PGRST205.
const TABLE_ABSENTE = new Set(["42P01", "PGRST205"]);
const DOUBLON = "23505";

/** Note l'événement. « deja_traite » : déjà reçu, à ignorer. « sans_suivi » : table absente,
 *  traitement sans idempotence (les traitements sont de toute façon rejouables). */
export async function noterEvenement(admin: SupabaseClient, event: Stripe.Event): Promise<"nouveau" | "deja_traite" | "sans_suivi"> {
  const { error } = await admin.from("stripe_evenements").insert({ id: event.id, type: event.type });
  if (!error) return "nouveau";
  if (error.code === DOUBLON) return "deja_traite";
  if (TABLE_ABSENTE.has(error.code)) {
    console.warn("[webhook stripe] Table stripe_evenements absente : applique la migration 065.");
    return "sans_suivi";
  }
  throw new Error(`Événement ${event.id} non noté : ${error.message}`);
}

/** Retire la note d'un événement dont le traitement a échoué (Stripe le renverra). */
export async function oublierEvenement(admin: SupabaseClient, eventId: string): Promise<void> {
  const { error } = await admin.from("stripe_evenements").delete().eq("id", eventId);
  if (error && !TABLE_ABSENTE.has(error.code)) console.error("[webhook stripe] Note non retirée :", eventId, error.message);
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/** Abonnement d'une facture (champ parent des versions d'API récentes, sinon ancien champ). */
export function abonnementDeFacture(invoice: Stripe.Invoice): string | null {
  const parent = idOf(invoice.parent?.subscription_details?.subscription ?? null);
  if (parent) return parent;
  return idOf((invoice as unknown as { subscription?: string | { id: string } | null }).subscription ?? null);
}

/** Applique un événement déjà vérifié. Lève une erreur si le traitement doit être retenté. */
export async function traiterEvenementStripe(event: Stripe.Event, deps: DependancesWebhook): Promise<void> {
  const synchroniser = deps.synchroniserAbonnement ?? synchroniserAbonnement;
  const accorderFormation = deps.grantFormationAccess ?? grantFormationAccess;
  const periodeExpert = deps.enregistrerPeriodeExpert ?? enregistrerPeriodeExpert;
  const rechargeExpert = deps.enregistrerRechargeExpert ?? enregistrerRechargeExpert;
  const estRecharge = deps.isRechargeExpert ?? isRechargeExpert;
  const finExpert = deps.terminerAbonnementExpert ?? terminerAbonnementExpert;
  const { admin } = deps;

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (estRecharge(session)) {
        await rechargeExpert(admin, session);
      } else if (session.mode === "subscription") {
        // customer.subscription.created fait déjà la synchro ; la refaire couvre le cas où il
        // arriverait après le retour de l'utilisateur.
        const id = idOf(session.subscription);
        if (id) await synchroniser(admin, await deps.lireAbonnement(id));
      } else {
        const userId = session.metadata?.user_id;
        const offre = session.metadata?.offre as FormationOffre | undefined;
        // payment_status « paid » exclut les paiements différés encore en attente.
        if (session.payment_status === "paid" && userId && offre) {
          await accorderFormation(admin, userId, offre, {
            via: offre === "bundle" ? "bundle" : "unitaire",
            prixPayeCentimes: session.amount_total ?? 0,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: idOf(session.payment_intent) ?? undefined,
          });
        }
      }
      return;
    }
    // Changement de plan Pro ↔ Agency (prix), passage en past_due / unpaid, annulation
    // programmée (cancel_at_period_end), suppression : tout passe par la relecture de
    // l'abonnement et synchroniserAbonnement (statut sans accès → plan null).
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const { id } = event.data.object as Stripe.Subscription;
      await synchroniser(admin, await deps.lireAbonnement(id));
      return;
    }
    case "customer.subscription.deleted": {
      const abonnement = event.data.object as Stripe.Subscription;
      await synchroniser(admin, await deps.lireAbonnement(abonnement.id));
      await finExpert(admin, abonnement);
      return;
    }
    // Renouvellement : nouvelle période Expert, ou periode_fin à jour pour Pro / Agency.
    case "invoice.paid": {
      const facture = event.data.object as Stripe.Invoice;
      await periodeExpert(admin, facture);
      const id = abonnementDeFacture(facture);
      if (id) await synchroniser(admin, await deps.lireAbonnement(id));
      return;
    }
    // Paiement échoué : abonnement_statut (past_due) mis à jour, ce qui affiche le bandeau de
    // paiement à régulariser et coupe l'accès aux outils jusqu'au règlement.
    case "invoice.payment_failed": {
      const id = abonnementDeFacture(event.data.object as Stripe.Invoice);
      if (id) await synchroniser(admin, await deps.lireAbonnement(id));
      return;
    }
    default:
      return;
  }
}
