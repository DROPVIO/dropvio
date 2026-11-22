import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { ESSAI_JOURS, createStripeClient, getAbonnementPriceId, isPlanPayant, isStripeConfigured } from "@/lib/stripe";
import { findSubscriptionEnCours } from "@/lib/expert-billing";
import { getPeriodeExpert } from "@/lib/expert-quota";
import { refusSouscriptionPlanPayant } from "@/lib/abonnement-regles";

// Crée une Checkout Session Stripe en mode "subscription" pour Pro ou Agency. La carte est
// demandée dans tous les cas (payment_method_collection "always"), y compris pendant l'essai :
// à la fin des ESSAI_JOURS jours, Stripe prélève le premier mois sans autre action. L'essai
// n'est offert qu'une fois par compte (profils.essai_utilise, posé par le webhook).
// Le plan n'est jamais modifié ici : seul le webhook le fait, une fois l'abonnement créé.
export async function POST(request: Request) {
  const { supabase, user } = await getServerUserPlanOnly();

  if (!user) {
    return NextResponse.json({ error: "Connectez-vous pour choisir un plan.", code: "auth_required" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Le paiement n'est pas encore configuré côté serveur (clé Stripe manquante).", code: "payment_not_configured" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const plan = body?.plan;
  if (!isPlanPayant(plan)) {
    return NextResponse.json({ error: "Plan invalide.", code: "plan_invalid" }, { status: 400 });
  }

  const { data: profil } = await supabase
    .from("profils")
    .select("plan, stripe_customer_id, abonnement_statut, essai_utilise")
    .eq("id", user.id)
    .maybeSingle();

  const stripe = createStripeClient();

  // Un abonnement Expert (profil, période en cours ou abonnement Stripe non terminé) exclut Pro
  // et Agency : sinon deux abonnements seraient facturés et le webhook écraserait plan = 'expert'.
  // abonnement_statut ne suffit pas : il reste vide pour Expert (voir lib/abonnement.ts).
  const periodeExpert = await getPeriodeExpert(supabase, user.id);
  const abonnementEnCours = profil?.stripe_customer_id
    ? await findSubscriptionEnCours(stripe, profil.stripe_customer_id)
    : null;
  const refus = refusSouscriptionPlanPayant({
    planProfil: profil?.plan,
    periodeExpertActive: periodeExpert !== null,
    abonnementExpertEnCours: abonnementEnCours?.metadata?.plan === "expert",
  });
  if (refus) {
    return NextResponse.json(
      { error: "Vous avez déjà un abonnement Expert en cours : il doit être terminé avant de souscrire Pro ou Agency.", code: refus },
      { status: 409 }
    );
  }

  // Un abonnement encore vivant se modifie dans le portail Stripe (changement de plan,
  // résiliation), jamais en en créant un second qui serait facturé en double.
  if (profil?.abonnement_statut === "trialing" || profil?.abonnement_statut === "active" || profil?.abonnement_statut === "past_due") {
    return NextResponse.json({ error: "Vous avez déjà un abonnement en cours.", code: "subscription_exists" }, { status: 400 });
  }

  // Un client Stripe par compte, créé une fois puis réutilisé : sans ça, chaque tentative de
  // souscription créerait un nouveau client et le portail ne retrouverait pas l'historique.
  let customerId = profil?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      metadata: { user_id: user.id },
    });
    customerId = customer.id;
    const admin = createSupabaseAdminClient();
    await admin.from("profils").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const origin = new URL(request.url).origin;
  const avecEssai = !profil?.essai_utilise;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: getAbonnementPriceId(plan), quantity: 1 }],
    payment_method_collection: "always",
    subscription_data: {
      metadata: { user_id: user.id, plan },
      ...(avecEssai
        ? {
            trial_period_days: ESSAI_JOURS,
            // Ne devrait jamais servir (la carte est obligatoire), mais si le moyen de
            // paiement disparaît pendant l'essai, l'abonnement s'arrête au lieu de passer
            // en impayé.
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }
        : {}),
    },
    metadata: { user_id: user.id, plan },
    success_url: `${origin}/abonnement?success=1`,
    cancel_url: `${origin}/abonnement?canceled=1`,
  });

  if (!session.url) {
    return NextResponse.json({ error: "Impossible de créer la session de paiement.", code: "payment_session_failed" }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
