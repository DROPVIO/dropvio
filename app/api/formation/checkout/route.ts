import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createStripeClient, getFormationPriceId, isStripeConfigured } from "@/lib/stripe";
import { collectionsDeOffre, type FormationOffre } from "@/lib/formation";

// Crée une Checkout Session Stripe en mode "payment" (achat unique, jamais "subscription")
// pour une offre formation (courte / longue / bundle). L'utilisateur doit être connecté :
// c'est ici, pas sur /formation, que se joue le vrai contrôle d'accès à l'achat.
export async function POST(request: Request) {
  const { user, formationOwned } = await getServerUserAndPlan();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour acheter une formation.", code: "auth_required" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Le paiement n'est pas encore configuré côté serveur (clé Stripe manquante).", code: "payment_not_configured" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const offre = body?.offre as FormationOffre | undefined;

  if (offre !== "courte" && offre !== "longue" && offre !== "bundle") {
    return NextResponse.json({ error: "Offre invalide.", code: "offer_invalid" }, { status: 400 });
  }

  const collectionsVisees = collectionsDeOffre(offre);
  if (collectionsVisees.every((c) => formationOwned[c])) {
    return NextResponse.json({ error: "Tu possèdes déjà cette formation.", code: "formation_already_owned" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const stripe = createStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: getFormationPriceId(offre), quantity: 1 }],
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    metadata: { user_id: user.id, offre },
    success_url: `${origin}/formation?success=1`,
    cancel_url: `${origin}/formation?canceled=1`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Impossible de créer la session de paiement.", code: "payment_session_failed" }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
