import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createStripeClient, isStripeConfigured } from "@/lib/stripe";
import { getPeriodeExpert, isAbonnementManuel } from "@/lib/expert-quota";
import { decisionPortail } from "@/lib/abonnement-regles";

// Ouvre le portail client Stripe : changement de plan, moyen de paiement, factures. La
// résiliation passe par le parcours /resiliation (app/api/resiliation). Les options proposées
// se règlent dans le dashboard Stripe (Settings > Billing > Customer portal) ; chaque changement revient ici par le webhook customer.subscription.*.
export async function POST(request: Request) {
  const { supabase, user, plan } = await getServerUserPlanOnly();

  if (!user) {
    return NextResponse.json({ error: "Connectez-vous pour gérer votre abonnement.", code: "auth_required" }, { status: 401 });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "Le paiement n'est pas encore configuré côté serveur (clé Stripe manquante).", code: "payment_not_configured" },
      { status: 500 }
    );
  }

  const { data: profil } = await supabase.from("profils").select("plan, stripe_customer_id").eq("id", user.id).maybeSingle();
  const periodeExpert = await getPeriodeExpert(supabase, user.id);

  // Le portail par défaut permet de changer de plan : un abonné Expert pourrait y basculer sur
  // le prix Pro sans que le webhook le voie (metadata.plan reste 'expert'). Il lui est donc
  // fermé, sauf configuration de portail dédiée, sans changement de plan, créée dans Stripe.
  const decision = decisionPortail({
    aClientStripe: Boolean(profil?.stripe_customer_id),
    periodeManuelle: isAbonnementManuel(periodeExpert?.stripe_subscription_id),
    expert: plan === "expert" || profil?.plan === "expert" || periodeExpert !== null,
    configurationExpert: process.env.STRIPE_PORTAL_CONFIGURATION_EXPERT,
  });
  if (!decision.ok) {
    return decision.code === "no_subscription"
      ? NextResponse.json({ error: "Aucun abonnement à gérer pour ce compte.", code: decision.code }, { status: 400 })
      : NextResponse.json(
          { error: "La gestion de l'abonnement Expert n'est pas disponible depuis le portail de facturation.", code: decision.code },
          { status: 403 }
        );
  }

  const body = await request.json().catch(() => null);
  const retour = body?.retour === "/quota" ? "/quota" : "/dashboard";

  const stripe = createStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: profil!.stripe_customer_id,
    return_url: `${new URL(request.url).origin}${retour}`,
    ...(decision.configuration ? { configuration: decision.configuration } : {}),
  });

  return NextResponse.json({ url: session.url });
}
