import { NextResponse } from "next/server";
import { createStripeClient } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { noterEvenement, oublierEvenement, traiterEvenementStripe, verifierEvenement } from "@/lib/stripe-webhook";

// Comme pour le webhook Shopify (voir app/api/webhooks/shopify/route.ts) : le body doit
// être lu en texte brut AVANT tout parsing JSON — stripe.webhooks.constructEvent() vérifie
// la signature sur ces octets exacts. Cette route n'appelle jamais request.json().
//
// Événements à activer sur l'endpoint dans le dashboard Stripe : voir EVENEMENTS_STRIPE dans
// lib/stripe-webhook.ts (checkout.session.completed, customer.subscription.created / updated /
// deleted, invoice.paid, invoice.payment_failed).
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
  const event = verifierEvenement(stripe, rawBody, signature, secretWebhook);
  if (!event) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();

  // Idempotence : un même event.id n'est appliqué qu'une fois.
  let note: Awaited<ReturnType<typeof noterEvenement>>;
  try {
    note = await noterEvenement(admin, event);
  } catch (err) {
    console.error("[webhook stripe] Idempotence indisponible", event.id, err);
    return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
  }
  if (note === "deja_traite") {
    return NextResponse.json({ ok: true, dejaTraite: true });
  }

  try {
    await traiterEvenementStripe(event, {
      admin,
      lireAbonnement: (id) => stripe.subscriptions.retrieve(id),
    });
  } catch (err) {
    console.error("[webhook stripe]", event.type, event.id, err);
    // 500 : Stripe renverra l'événement ; la note est retirée pour que ce nouvel envoi soit traité.
    if (note === "nouveau") await oublierEvenement(admin, event.id);
    return NextResponse.json({ error: "Traitement impossible" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
