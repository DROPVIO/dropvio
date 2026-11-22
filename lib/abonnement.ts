import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { aPeriodeManuelleActive, getPeriodeExpert } from "./expert-quota";
import { planDepuisPriceId } from "./stripe";
import { refusSouscriptionPlanPayant } from "./abonnement-regles";

// Seuls ces statuts donnent accès aux outils. past_due (paiement échoué, Stripe relance),
// unpaid, canceled, incomplete… repassent le compte sans plan (null), c'est-à-dire sans accès :
// pas de période de grâce, le compte et ses données restent intacts.
const STATUTS_AVEC_ACCES = new Set<Stripe.Subscription.Status>(["trialing", "active"]);

// Code PostgreSQL « undefined_column » (colonne pas encore créée par sa migration).
const COLONNE_ABSENTE = "42703";

function versIso(timestamp: number | null | undefined): string | null {
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

/** Recopie l'état d'un abonnement Stripe dans profils (client admin obligatoire : le trigger
 *  de 045_abonnements.sql ignore ces colonnes pour tout autre rôle).
 *
 *  Le compte est retrouvé par metadata.user_id (posé à la création, voir
 *  app/api/abonnement/checkout/route.ts), sinon par stripe_customer_id — un abonnement recréé
 *  depuis le dashboard Stripe n'a pas forcément la metadata. */
export async function synchroniserAbonnement(admin: SupabaseClient, subscription: Stripe.Subscription): Promise<void> {
  // Le plan Expert a son propre cycle (lib/expert-billing.ts) : son prix est propre à chaque
  // abonné, planDepuisPriceId le prendrait pour un Price inconnu et couperait l'accès. Un
  // compte offert manuellement ne dépend d'aucun abonnement Stripe.
  if (subscription.metadata?.plan === "expert") return;
  const compte = subscription.metadata?.user_id;
  if (compte && (await aPeriodeManuelleActive(admin, compte))) return;

  const item = subscription.items.data[0];
  const planPayant = planDepuisPriceId(item?.price.id);
  const acces = STATUTS_AVEC_ACCES.has(subscription.status) && planPayant !== null;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  // Filet de sécurité : la souscription Pro / Agency est refusée à un abonné Expert
  // (app/api/abonnement/checkout/route.ts), mais un abonnement peut encore arriver par une
  // session ouverte avant l'Expert ou être créé depuis le dashboard Stripe. Il ne doit jamais
  // écraser plan = 'expert' : l'événement est ignoré (sans erreur, sinon Stripe le renverrait
  // indéfiniment) et signalé pour une annulation et un remboursement manuels.
  const cible = admin.from("profils").select("id, plan");
  const { data: profilCible } = compte
    ? await cible.eq("id", compte).maybeSingle()
    : await cible.eq("stripe_customer_id", customerId).maybeSingle();
  if (profilCible) {
    const periodeExpert = await getPeriodeExpert(admin, profilCible.id);
    const refus = refusSouscriptionPlanPayant({
      planProfil: profilCible.plan,
      periodeExpertActive: periodeExpert !== null,
      abonnementExpertEnCours: false,
    });
    if (refus) {
      console.error(
        `[abonnement] ${subscription.id} (${planPayant ?? "plan inconnu"}) ignoré : le compte ${profilCible.id} a un abonnement Expert en cours. À annuler et rembourser manuellement.`
      );
      return;
    }
  }

  const valeurs: Record<string, unknown> = {
    plan: acces ? planPayant : null,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    abonnement_statut: subscription.status,
    essai_fin: versIso(subscription.trial_end),
    periode_fin: versIso(item?.current_period_end),
  };
  if (subscription.trial_end) valeurs.essai_utilise = true;
  // Résiliation programmée (fin de période) : affichée sur /abonnement et /parametres.
  valeurs.annulation_fin_periode = Boolean(subscription.cancel_at_period_end);

  const userId = subscription.metadata?.user_id;
  const ecrire = (v: Record<string, unknown>) => {
    const requete = admin.from("profils").update(v);
    return userId ? requete.eq("id", userId) : requete.eq("stripe_customer_id", customerId);
  };
  let { error } = await ecrire(valeurs);
  // Migration 065 pas encore appliquée (colonne absente) : on écrit le reste plutôt que de
  // bloquer la synchronisation de l'abonnement.
  if (error?.code === COLONNE_ABSENTE) {
    const { annulation_fin_periode: _ignore, ...sansAnnulation } = valeurs;
    void _ignore;
    ({ error } = await ecrire(sansAnnulation));
  }

  if (error) {
    // Remonté au webhook, qui répond 500 : Stripe renverra l'événement plus tard plutôt que de
    // laisser un compte payant sans accès (ou l'inverse).
    throw new Error(`Synchronisation de l'abonnement ${subscription.id} impossible : ${error.message}`);
  }
}
