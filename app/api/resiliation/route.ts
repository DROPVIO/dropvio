import { randomInt } from "crypto";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createStripeClient, isStripeConfigured, planDepuisPriceId } from "@/lib/stripe";
import { getPeriodeExpert, isAbonnementManuel } from "@/lib/expert-quota";
import { synchroniserAbonnement } from "@/lib/abonnement";
import { apiError, erreurServeur } from "@/lib/api-errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { adresseIp } from "@/lib/consentements-serveur";
import { abonnementAResilier, finAcces, referenceResiliation } from "@/lib/resiliation";
import type { Plan } from "@/lib/plan-limits";

// Résiliation en ligne (parcours /resiliation) : récapitulatif (GET) puis confirmation (POST),
// qui programme la fin de l'abonnement à la fin de la période en cours (cancel_at_period_end).
// Aucun remboursement, aucun changement de l'essai : l'accès reste ouvert jusqu'à la date annoncée.

type Contexte =
  | { ok: true; userId: string; subscription: Stripe.Subscription; plan: Plan | null }
  | { ok: false; reponse: NextResponse };

async function contexte(): Promise<Contexte> {
  const { supabase, user } = await getServerUserPlanOnly();
  if (!user) return { ok: false, reponse: apiError("auth_required", 401, "Connectez-vous pour résilier votre abonnement.") };
  if (!isStripeConfigured()) {
    return { ok: false, reponse: apiError("payment_not_configured", 500, "Le paiement n'est pas encore configuré côté serveur.") };
  }

  const { data: profil } = await supabase
    .from("profils")
    .select("plan, stripe_subscription_id, abonnement_statut")
    .eq("id", user.id)
    .maybeSingle();
  const periodeExpert = await getPeriodeExpert(supabase, user.id);
  const etat = abonnementAResilier({
    planProfil: (profil?.plan as Plan | null) ?? null,
    subscriptionProfil: profil?.stripe_subscription_id ?? null,
    statutProfil: profil?.abonnement_statut ?? null,
    subscriptionExpert: periodeExpert?.stripe_subscription_id ?? null,
    expertManuel: isAbonnementManuel(periodeExpert?.stripe_subscription_id),
  });
  if (!etat.ok) {
    return {
      ok: false,
      reponse:
        etat.code === "abonnement_manuel"
          ? apiError("abonnement_manuel", 400, "Votre accès a été ouvert manuellement : il n'y a pas d'abonnement à résilier.")
          : apiError("no_subscription", 400, "Aucun abonnement à résilier pour ce compte."),
    };
  }

  const subscription = await createStripeClient().subscriptions.retrieve(etat.abonnement.subscriptionId);
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired") {
    return { ok: false, reponse: apiError("no_subscription", 400, "Aucun abonnement à résilier pour ce compte.") };
  }
  const plan = etat.abonnement.plan ?? planDepuisPriceId(subscription.items.data[0]?.price.id);
  return { ok: true, userId: user.id, subscription, plan };
}

export async function GET() {
  try {
    const c = await contexte();
    if (!c.ok) return c.reponse;
    return NextResponse.json({
      plan: c.plan,
      statut: c.subscription.status,
      finAcces: finAcces(c.subscription),
      dejaResilie: Boolean(c.subscription.cancel_at_period_end || c.subscription.cancel_at),
    });
  } catch (err) {
    return erreurServeur("api/resiliation GET", err);
  }
}

export async function POST(request: Request) {
  try {
    const c = await contexte();
    if (!c.ok) return c.reponse;
    if (!(await checkRateLimit(`resiliation:${c.userId}`, { max: 5, windowMs: 3_600_000 }))) {
      return apiError("rate_limit", 429, "Trop de demandes en peu de temps. Réessayez dans quelques minutes.");
    }

    const stripe = createStripeClient();
    const subscription = c.subscription.cancel_at_period_end
      ? c.subscription
      : await stripe.subscriptions.update(c.subscription.id, { cancel_at_period_end: true });
    const fin = finAcces(subscription);
    const admin = createSupabaseAdminClient();

    // Le webhook customer.subscription.updated fera la même mise à jour ; on n'attend pas son
    // arrivée pour que /abonnement et les paramètres affichent la résiliation tout de suite.
    if (c.plan !== "expert") {
      await synchroniserAbonnement(admin, subscription).catch((err) => console.error("[resiliation] synchronisation", err));
    }

    const reference = referenceResiliation(new Date(), () => randomInt(0, 1_000_000) / 1_000_000);
    const ip = adresseIp(request);
    const { error } = await admin.from("resiliations").insert({
      reference,
      user_id: c.userId,
      plan: c.plan ?? "pro",
      stripe_subscription_id: subscription.id,
      fin_acces: fin,
      adresse_ip: ip,
    });
    // La résiliation est déjà enregistrée chez Stripe : l'accusé est rendu même si sa copie en
    // base échoue (migration 068 pas encore appliquée), l'erreur est journalisée.
    if (error) console.error(`[resiliation] accusé ${reference} non enregistré :`, error.message);

    return NextResponse.json({ reference, finAcces: fin, plan: c.plan, enregistreLe: new Date().toISOString() });
  } catch (err) {
    return erreurServeur("api/resiliation POST", err);
  }
}
