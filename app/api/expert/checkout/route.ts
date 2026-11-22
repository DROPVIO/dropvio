import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createStripeClient, isStripeConfigured } from "@/lib/stripe";
import { createExpertCheckoutSession, findSubscriptionEnCours } from "@/lib/expert-billing";
import { isSelectionVendable, parseExpertSelection } from "@/lib/expert-pricing";
import { erreurServeur } from "@/lib/api-errors";

// Crée la Checkout Session du plan Expert. Le prix vient uniquement de la sélection recalculée
// ici : aucun montant envoyé par le client n'est lu. Le profil ne passe en "expert" qu'à la
// réception de invoice.paid (voir app/api/webhooks/stripe/route.ts).
export async function POST(request: Request) {
  const { supabase, user, plan } = await getServerUserPlanOnly();

  if (!user) {
    return NextResponse.json({ error: "Connectez-vous pour choisir le plan Expert." }, { status: 401 });
  }

  if (plan === "expert") {
    return NextResponse.json({ error: "Ton plan Expert est déjà actif." }, { status: 409 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Le paiement n'est pas encore configuré côté serveur (clé Stripe manquante)." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const selection = parseExpertSelection(body);

  if (!selection) {
    return NextResponse.json({ error: "Configuration Expert invalide." }, { status: 400 });
  }
  if (selection && !isSelectionVendable(selection)) {
    return NextResponse.json({ error: "Les crédits images ne sont pas encore en vente." }, { status: 400 });
  }
  if (body?.executionImmediate !== true) {
    return NextResponse.json(
      { error: "Tu dois demander l'exécution immédiate du service pour continuer." },
      { status: 400 }
    );
  }

  const stripe = createStripeClient();
  const { data: profil } = await supabase.from("profils").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  let customerId: string | null = profil?.stripe_customer_id ?? null;

  if (customerId) {
    // Un seul abonnement à la fois : Expert ne s'ajoute jamais à un abonnement existant.
    if (await findSubscriptionEnCours(stripe, customerId)) {
      return NextResponse.json(
        { error: "Vous avez déjà un abonnement en cours. Il doit être terminé avant de souscrire au plan Expert." },
        { status: 409 }
      );
    }
  } else {
    const customer = await stripe.customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
    customerId = customer.id;
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from("profils").upsert({ id: user.id, stripe_customer_id: customerId });
    if (error) {
      return erreurServeur("api/expert/checkout", error);
    }
  }

  const session = await createExpertCheckoutSession(stripe, {
    customerId,
    userId: user.id,
    selection,
    origin: new URL(request.url).origin,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Impossible de créer la session de paiement." }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
