import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createStripeClient, isStripeConfigured } from "@/lib/stripe";
import { createExpertRechargeSession } from "@/lib/expert-billing";
import { expertRechargePrice, isSelectionVendable, parseExpertSelection } from "@/lib/expert-pricing";
import { getPeriodeExpert } from "@/lib/expert-quota";

// Paiement unique d'une recharge de crédits. Le montant vient uniquement de la sélection
// recalculée ici, et les crédits ne sont ajoutés que par le webhook, après paiement confirmé.
export async function POST(request: Request) {
  const { supabase, user, plan } = await getServerUserPlanOnly();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour racheter des crédits." }, { status: 401 });
  }
  if (plan !== "expert") {
    return NextResponse.json({ error: "Cette action est réservée aux abonnés Expert." }, { status: 403 });
  }
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Le paiement n'est pas encore configuré côté serveur (clé Stripe manquante)." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const selection = parseExpertSelection(body);
  if (!selection || expertRechargePrice(selection).total <= 0) {
    return NextResponse.json({ error: "Sélection de crédits invalide." }, { status: 400 });
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

  const periode = await getPeriodeExpert(supabase, user.id);
  if (!periode) {
    return NextResponse.json({ error: "Aucune période Expert en cours." }, { status: 409 });
  }

  const { data: profil } = await supabase.from("profils").select("stripe_customer_id").eq("id", user.id).maybeSingle();

  const session = await createExpertRechargeSession(createStripeClient(), {
    customerId: profil?.stripe_customer_id ?? null,
    email: user.email ?? null,
    userId: user.id,
    periodeId: periode.id,
    selection,
    origin: new URL(request.url).origin,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Impossible de créer la session de paiement." }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
