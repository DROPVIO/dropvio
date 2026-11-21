import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { grantFormationAccess, type FormationOffre } from "@/lib/formation";
import { synchroniserAbonnement } from "@/lib/abonnement";
import { enregistrerPeriodeExpert, enregistrerRechargeExpert, isRechargeExpert, terminerAbonnementExpert } from "@/lib/expert-billing";

// Comme pour le webhook Shopify (voir app/api/webhooks/shopify/route.ts) : le body doit
// être lu en texte brut AVANT tout parsing JSON — stripe.webhooks.constructEvent() vérifie
// la signature sur ces octets exacts. Cette route n'appelle jamais request.json().
//
// Événements à activer sur l'endpoint dans le dashboard Stripe : checkout.session.completed
// (formation + abonnement), customer.subscription.created, customer.subscription.updated et
// customer.subscription.deleted (abonnements), invoice.paid (périodes du plan Expert).
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  // Rien n'est traité sans signature, ni sans configuration (clé et secret du webhook) : refus
  // net plutôt qu'une erreur 500 à la création du client.
  if (!signature) {
    return NextResponse.json({ error: "Signature absente" }, { status: 400 });
  }
  const secretWebhook = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretWebhook || !process.env.STRIPE_SECRET_KEY) {
    console.error("[webhooks/stripe] STRIPE_SECRET_KEY ou STRIPE_WEBHOOK_SECRET manquant : événement refusé.");
    return NextResponse.json({ error: "Webhook non configuré" }, { status: 503 });
  }

  const stripe = createStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secretWebhook);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (isRechargeExpert(session)) {
        await enregistrerRechargeExpert(admin, session);
      } else if (session.mode === "subscription") {
        // L'événement customer.subscription.created fait déjà la synchro ; la refaire ici
        // couvre le cas où il arriverait après le retour de l'utilisateur sur /dashboard.
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (subscriptionId) {
          await synchroniserAbonnement(admin, await stripe.subscriptions.retrieve(subscriptionId));
        }
      } else {
        const userId = session.metadata?.user_id;
        const offre = session.metadata?.offre as FormationOffre | undefined;

        // payment_status "paid" exclut les paiements différés (ex: virement encore en
        // attente) — on n'octroie l'accès que sur un paiement effectivement encaissé.
        if (session.payment_status === "paid" && userId && offre) {
          await grantFormationAccess(admin, userId, offre, {
            via: offre === "bundle" ? "bundle" : "unitaire",
            prixPayeCentimes: session.amount_total ?? 0,
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId:
              typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
          });
        }
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      // Stripe ne garantit pas l'ordre de livraison : on relit l'abonnement plutôt que de
      // recopier un état intermédiaire arrivé après un état plus récent.
      const { id } = event.data.object as Stripe.Subscription;
      await synchroniserAbonnement(admin, await stripe.subscriptions.retrieve(id));
    }

    if (event.type === "invoice.paid") {
      await enregistrerPeriodeExpert(admin, event.data.object);
    }
    if (event.type === "customer.subscription.deleted") {
      await terminerAbonnementExpert(admin, event.data.object);
    }
  } catch (err) {
    console.error("[webhook stripe]", event.type, err);
    // 500 : Stripe renverra l'événement, plutôt que de le considérer comme traité.
    return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
