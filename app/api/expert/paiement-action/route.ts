import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createStripeClient, isStripeConfigured } from "@/lib/stripe";
import { parseExpertMetadata } from "@/lib/expert-billing";
import { aPeriodeManuelleActive } from "@/lib/expert-quota";

// Lien Stripe de la facture à régler, ou null. Lu en direct plutôt que stocké : le bandeau
// disparaît dès que Stripe a encaissé. La page hébergée gère aussi bien la validation 3D
// Secure que le changement de carte. Ne dépend pas du plan : l'accès Expert est justement
// suspendu tant que le renouvellement n'est pas réglé.
export async function GET() {
  const { supabase, user } = await getServerUserPlanOnly();
  if (!user || !isStripeConfigured()) {
    return NextResponse.json({ url: null });
  }

  const { data: profil } = await supabase.from("profils").select("stripe_customer_id").eq("id", user.id).maybeSingle();
  if (!profil?.stripe_customer_id || (await aPeriodeManuelleActive(supabase, user.id))) {
    return NextResponse.json({ url: null });
  }

  // Ce bandeau est secondaire : une panne Stripe ne doit jamais casser une page de l'espace.
  try {
    const { data } = await createStripeClient().subscriptions.list({
      customer: profil.stripe_customer_id,
      status: "past_due",
      expand: ["data.latest_invoice"],
      limit: 1,
    });

    const subscription = data[0];
    const invoice = subscription?.latest_invoice as Stripe.Invoice | null | undefined;
    const url = parseExpertMetadata(subscription?.metadata) && invoice?.status === "open" ? invoice.hosted_invoice_url : null;
    return NextResponse.json({ url: url ?? null });
  } catch (error) {
    console.error("[expert/paiement-action]", error);
    return NextResponse.json({ url: null });
  }
}
