// Règles d'accès aux abonnements Pro / Agency et au portail Stripe, en fonctions pures
// (testées par lib/abonnement-regles.test.ts). Les routes et le webhook rassemblent l'état du
// compte, ces fonctions décident.
//
// Un compte n'a jamais deux abonnements à la fois : tant qu'un abonnement Expert est en cours,
// Pro et Agency sont refusés (sinon le client paierait deux abonnements et le webhook Pro
// écraserait plan = 'expert').

export type EtatExpert = {
  /** profils.plan tel qu'en base (non résolu). */
  planProfil: string | null | undefined;
  /** Une ligne expert_periodes couvre la date du jour (offerte ou payée). */
  periodeExpertActive: boolean;
  /** Un abonnement Stripe non terminé porte metadata.plan = 'expert'. */
  abonnementExpertEnCours: boolean;
};

export function expertEnCours(etat: EtatExpert): boolean {
  return etat.planProfil === "expert" || etat.periodeExpertActive || etat.abonnementExpertEnCours;
}

/** Code d'erreur (clé apiErrors) si la souscription Pro / Agency doit être refusée, sinon null. */
export function refusSouscriptionPlanPayant(etat: EtatExpert): "expert_actif" | null {
  return expertEnCours(etat) ? "expert_actif" : null;
}

export type DecisionPortail =
  | { ok: true; configuration: string | null }
  | { ok: false; code: "no_subscription" | "portail_expert_ferme" };

/**
 * Ouverture du portail Stripe.
 * - pas de client Stripe, ou compte Expert offert (période manuelle) : rien à gérer ;
 * - abonné Expert : fermé, sauf si une configuration de portail dédiée existe
 *   (STRIPE_PORTAL_CONFIGURATION_EXPERT, sans changement de plan) : le portail s'ouvre avec elle ;
 * - sinon : portail par défaut du compte Stripe.
 */
export function decisionPortail(params: {
  aClientStripe: boolean;
  periodeManuelle: boolean;
  expert: boolean;
  configurationExpert: string | null | undefined;
}): DecisionPortail {
  if (!params.aClientStripe || params.periodeManuelle) return { ok: false, code: "no_subscription" };
  if (params.expert) {
    const configuration = params.configurationExpert?.trim();
    return configuration ? { ok: true, configuration } : { ok: false, code: "portail_expert_ferme" };
  }
  return { ok: true, configuration: null };
}
