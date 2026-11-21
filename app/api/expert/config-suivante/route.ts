import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createStripeClient, isStripeConfigured } from "@/lib/stripe";
import { programmerConfigExpert } from "@/lib/expert-billing";
import { expertPrice, isSelectionVendable, parseExpertSelection } from "@/lib/expert-pricing";
import { isAbonnementManuel } from "@/lib/expert-quota";

// Programme la configuration du prochain renouvellement. La période en cours reste figée :
// sans appel à cette route, la configuration actuelle est simplement reconduite.
export async function POST(request: Request) {
  const { supabase, user, plan } = await getServerUserPlanOnly();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier ton plan." }, { status: 401 });
  }
  if (plan !== "expert") {
    return NextResponse.json({ error: "Cette action est réservée aux abonnés Expert." }, { status: 403 });
  }

  const selection = parseExpertSelection(await request.json().catch(() => null));
  if (!selection) {
    return NextResponse.json({ error: "Configuration Expert invalide." }, { status: 400 });
  }

  if (selection && !isSelectionVendable(selection)) {
    return NextResponse.json({ error: "Les crédits images ne sont pas encore en vente." }, { status: 400 });
  }

  const { data: periode } = await supabase
    .from("expert_periodes")
    .select("stripe_subscription_id")
    .eq("user_id", user.id)
    .order("periode_debut", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (isAbonnementManuel(periode?.stripe_subscription_id)) {
    return NextResponse.json({ error: "Un abonnement offert ne se modifie pas ici." }, { status: 409 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "Le paiement n'est pas encore configuré côté serveur (clé Stripe manquante)." }, { status: 500 });
  }

  const stripe = createStripeClient();
  const subscription = periode ? await stripe.subscriptions.retrieve(periode.stripe_subscription_id) : null;
  if (subscription?.status !== "active") {
    return NextResponse.json({ error: "Aucun abonnement Expert actif à modifier." }, { status: 409 });
  }

  await programmerConfigExpert(stripe, subscription, user.id, selection);

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("expert_config_suivante").upsert({
    user_id: user.id,
    modele: selection.model,
    sites: selection.sites,
    images: selection.images,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ prix: expertPrice(selection) });
}
