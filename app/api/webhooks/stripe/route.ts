import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { grantFormationAccess, type FormationOffre } from "@/lib/formation";

// Comme pour le webhook Shopify (voir app/api/webhooks/shopify/route.ts) : le body doit
// être lu en texte brut AVANT tout parsing JSON — stripe.webhooks.constructEvent() vérifie
// la signature sur ces octets exacts. Cette route n'appelle jamais request.json().
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  const stripe = createStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;
    const offre = session.metadata?.offre as FormationOffre | undefined;

    // payment_status "paid" exclut les paiements différés (ex: virement encore en
    // attente) — on n'octroie l'accès que sur un paiement effectivement encaissé.
    if (session.payment_status === "paid" && userId && offre) {
      const admin = createSupabaseAdminClient();
      await grantFormationAccess(admin, userId, offre, {
        via: offre === "bundle" ? "bundle" : "unitaire",
        prixPayeCentimes: session.amount_total ?? 0,
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
