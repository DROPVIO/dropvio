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
import { abonnementAResilier } from "@/lib/resiliation";
import {
  dansLeDelai,
  dateParis,
  dernierJourRenonciation,
  executerRenonciation,
  referenceRenonciation,
  validerRenonciation,
  type StripeRenonciation,
} from "@/lib/renonciation";
import type { Plan } from "@/lib/plan-limits";
import { envoyerEmail } from "@/lib/email";
import { emailConfirmationRenonciation } from "@/lib/emails/confirmation-renonciation";

// Renonciation au contrat depuis l'espace client (droit de rétractation, art. L221-21) :
// GET dit si le bouton « Renoncer au contrat ici » est proposé (abonnement souscrit il y a
// 14 jours au plus) et pré-remplit le formulaire ; POST arrête l'abonnement tout de suite et
// rembourse intégralement, via Stripe, les paiements de cet abonnement.

type Contexte =
  | { ok: true; userId: string; email: string; subscription: Stripe.Subscription; plan: Plan | null; souscription: Date }
  | { ok: false; reponse: NextResponse }
  | { ok: false; nonEligible: true };

const NON_ELIGIBLE = { ok: false, nonEligible: true } as const;

async function contexte(): Promise<Contexte> {
  const { supabase, user } = await getServerUserPlanOnly();
  if (!user) return { ok: false, reponse: apiError("auth_required", 401, "Connectez-vous pour renoncer à votre contrat.") };
  if (!user.email) return NON_ELIGIBLE;
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
  if (!etat.ok) return NON_ELIGIBLE;

  const subscription = await createStripeClient().subscriptions.retrieve(etat.abonnement.subscriptionId);
  if (subscription.status === "canceled" || subscription.status === "incomplete_expired") return NON_ELIGIBLE;
  const souscription = new Date((subscription.start_date ?? subscription.created) * 1000);
  if (!dansLeDelai(souscription)) return NON_ELIGIBLE;
  const plan = etat.abonnement.plan ?? planDepuisPriceId(subscription.items.data[0]?.price.id);
  return { ok: true, userId: user.id, email: user.email, subscription, plan, souscription };
}

export async function GET() {
  try {
    const c = await contexte();
    if (!c.ok) return "nonEligible" in c ? NextResponse.json({ eligible: false }) : c.reponse;
    return NextResponse.json({
      eligible: true,
      plan: c.plan,
      identifiant: c.email,
      dateSouscription: dateParis(c.souscription),
      dernierJour: dernierJourRenonciation(c.souscription),
    });
  } catch (err) {
    return erreurServeur("api/renonciation GET", err);
  }
}

export async function POST(request: Request) {
  try {
    const c = await contexte();
    if (!c.ok) {
      return "nonEligible" in c
        ? apiError("renonciation_hors_delai", 400, "Aucun abonnement souscrit depuis moins de 14 jours sur ce compte.")
        : c.reponse;
    }
    if (!(await checkRateLimit(`renonciation:${c.userId}`, { max: 5, windowMs: 3_600_000 }))) {
      return apiError("rate_limit", 429, "Trop de demandes en peu de temps. Réessayez dans quelques minutes.");
    }

    const dateSouscription = dateParis(c.souscription);
    const validation = validerRenonciation(await request.json().catch(() => null), { email: c.email, dateSouscription });
    if (!validation.ok) {
      return apiError("renonciation_invalide", 400, "Vérifiez l'identifiant du compte et la date de souscription.", { champs: validation.champs });
    }

    const reference = referenceRenonciation(new Date(), () => randomInt(0, 1_000_000) / 1_000_000);
    const recueLe = new Date().toISOString();
    const admin = createSupabaseAdminClient();
    const ip = adresseIp(request);
    const ligneBase = {
      reference,
      user_id: c.userId,
      nom: c.email,
      email: c.email,
      achat: c.plan ? `abonnement_${c.plan}` : "abonnement",
      achat_ref: c.subscription.id,
      date_achat: dateSouscription,
      adresse_ip: ip,
      created_at: recueLe,
    };
    // Trace écrite avant toute action Stripe. Sans la migration 069, les colonnes du parcours
    // connecté n'existent pas : la demande est alors enregistrée avec les seules colonnes de 067.
    let migration069 = true;
    const { error: erreurInsertion } = await admin.from("demandes_retractation").insert({
      ...ligneBase,
      origine: "espace_client",
      motif: validation.motif,
      stripe_subscription_id: c.subscription.id,
    });
    if (erreurInsertion) {
      migration069 = false;
      console.error(`[renonciation] ${reference} : insertion complète impossible (${erreurInsertion.message}), repli sur les colonnes de 067`);
      const { error } = await admin.from("demandes_retractation").insert(ligneBase);
      if (error) console.error(`[renonciation] ${reference} non enregistrée :`, error.message);
    }

    const stripe = createStripeClient();
    const resultat = await executerRenonciation(stripe as unknown as StripeRenonciation, c.subscription.id, reference);
    const remboursementComplet = resultat.echecs.length === 0;
    if (resultat.echecs.length) {
      console.error(`[renonciation] ${reference} : remboursement à terminer à la main dans Stripe (${resultat.echecs.join(", ")})`);
    }

    if (migration069) {
      const { error } = await admin
        .from("demandes_retractation")
        .update({
          statut: remboursementComplet ? "remboursee" : "recue",
          montant_rembourse_centimes: resultat.montantRembourseCentimes,
          devise: resultat.devise,
          stripe_refund_ids: resultat.refundIds,
          rembourse_le: remboursementComplet ? new Date().toISOString() : null,
        })
        .eq("reference", reference);
      if (error) console.error(`[renonciation] ${reference} : mise à jour du remboursement impossible :`, error.message);
    }

    // Le webhook customer.subscription.deleted fera la même mise à jour ; on n'attend pas son
    // arrivée pour que /abonnement affiche tout de suite l'abonnement arrêté.
    if (c.plan !== "expert") {
      const arrete = await stripe.subscriptions.retrieve(c.subscription.id);
      await synchroniserAbonnement(admin, arrete).catch((err) => console.error("[renonciation] synchronisation", err));
    }

    const { envoye } = await envoyerEmail(
      emailConfirmationRenonciation({
        a: c.email,
        reference,
        plan: c.plan,
        dateSouscription,
        recueLe,
        motif: validation.motif,
        montantRembourseCentimes: resultat.montantRembourseCentimes,
        devise: resultat.devise,
        remboursementComplet,
      })
    );

    return NextResponse.json({
      reference,
      plan: c.plan,
      recueLe,
      montantRembourseCentimes: resultat.montantRembourseCentimes,
      devise: resultat.devise,
      remboursementComplet,
      emailEnvoye: envoye,
      email: envoye ? c.email : null,
    });
  } catch (err) {
    return erreurServeur("api/renonciation POST", err);
  }
}
