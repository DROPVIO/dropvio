import type { Plan } from "./plan-limits";

/** Référence lisible d'un accusé de résiliation : RES-AAAAMMJJ-XXXXXX (sans 0/O/1/I). */
export function referenceResiliation(maintenant = new Date(), aleatoire: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const date = maintenant.toISOString().slice(0, 10).replace(/-/g, "");
  let suffixe = "";
  for (let i = 0; i < 6; i++) suffixe += alphabet[Math.floor(aleatoire() * alphabet.length)];
  return `RES-${date}-${suffixe}`;
}

export type AbonnementResiliable = {
  /** null : plan non connu côté profil (paiement en échec) ; relu depuis Stripe. */
  plan: Plan | null;
  subscriptionId: string;
};

export type EtatResiliation =
  | { ok: true; abonnement: AbonnementResiliable }
  | { ok: false; code: "no_subscription" | "abonnement_manuel" };

/** Détermine l'abonnement Stripe à résilier pour un compte : Pro / Agency (profils) ou Expert
 *  (période en cours). Un accès offert manuellement n'a pas d'abonnement Stripe à résilier. */
export function abonnementAResilier(entree: {
  planProfil: Plan | null;
  subscriptionProfil: string | null;
  statutProfil: string | null;
  subscriptionExpert: string | null;
  expertManuel: boolean;
}): EtatResiliation {
  if (entree.subscriptionExpert) {
    if (entree.expertManuel) return { ok: false, code: "abonnement_manuel" };
    return { ok: true, abonnement: { plan: "expert", subscriptionId: entree.subscriptionExpert } };
  }
  const statutsResiliables = new Set(["trialing", "active", "past_due", "unpaid"]);
  if (
    entree.subscriptionProfil &&
    (entree.planProfil === "pro" || entree.planProfil === "agency" || statutsResiliables.has(entree.statutProfil ?? ""))
  ) {
    return { ok: true, abonnement: { plan: entree.planProfil, subscriptionId: entree.subscriptionProfil } };
  }
  return { ok: false, code: "no_subscription" };
}

/** Date de fin d'accès d'un abonnement résilié en fin de période (ou en fin d'essai). */
export function finAcces(subscription: {
  status: string;
  cancel_at?: number | null;
  trial_end?: number | null;
  items: { data: Array<{ current_period_end?: number | null }> };
}): string | null {
  const ts =
    subscription.cancel_at ??
    (subscription.status === "trialing" ? subscription.trial_end : null) ??
    subscription.items.data[0]?.current_period_end ??
    null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}
