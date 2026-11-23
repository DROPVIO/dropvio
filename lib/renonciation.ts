// Renonciation au contrat depuis l'espace client (droit de rétractation, art. L221-18 et L221-21
// du code de la consommation) : bouton « Renoncer au contrat ici » sur /abonnement pendant les
// 14 jours qui suivent la souscription. Confirmer arrête l'abonnement tout de suite et rembourse
// intégralement, via Stripe, tout ce qui a été payé sur cet abonnement.
//
// Ce module est pur (aucun appel réseau) sauf executerRenonciation, qui reçoit le client Stripe
// en paramètre (un faux client dans les tests).

export const DELAI_RETRACTATION_JOURS = 14;
export const MOTIF_MAX = 1000;

/** Date civile à Paris (AAAA-MM-JJ) d'un instant. */
export function dateParis(instant: Date): string {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

function ajouterJours(dateIso: string, jours: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + jours);
  return d.toISOString().slice(0, 10);
}

/** Dernier jour (date civile à Paris) où la renonciation est possible : le délai court à
 *  partir du lendemain de la souscription et expire à la fin du 14e jour. */
export function dernierJourRenonciation(souscription: Date): string {
  return ajouterJours(dateParis(souscription), DELAI_RETRACTATION_JOURS);
}

export function dansLeDelai(souscription: Date, maintenant = new Date()): boolean {
  return dateParis(maintenant) <= dernierJourRenonciation(souscription);
}

/** Référence lisible d'une renonciation : REN-AAAAMMJJ-XXXXXX (sans 0/O/1/I). */
export function referenceRenonciation(maintenant = new Date(), aleatoire: () => number = Math.random): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const date = maintenant.toISOString().slice(0, 10).replace(/-/g, "");
  let suffixe = "";
  for (let i = 0; i < 6; i++) suffixe += alphabet[Math.floor(aleatoire() * alphabet.length)];
  return `REN-${date}-${suffixe}`;
}

export type ChampRenonciation = "identifiant" | "dateSouscription" | "motif";

/** Le formulaire demande l'identifiant du compte (son e-mail), la date de souscription et un
 *  motif facultatif. L'identifiant et la date doivent correspondre au compte connecté et à son
 *  abonnement : ils confirment que la personne renonce bien à ce contrat-là. */
export function validerRenonciation(
  corps: unknown,
  attendu: { email: string; dateSouscription: string }
): { ok: true; motif: string | null } | { ok: false; champs: ChampRenonciation[] } {
  const c = (corps && typeof corps === "object" ? corps : {}) as Record<string, unknown>;
  const champs: ChampRenonciation[] = [];
  const identifiant = typeof c.identifiant === "string" ? c.identifiant.trim().toLowerCase() : "";
  if (!identifiant || identifiant !== attendu.email.trim().toLowerCase()) champs.push("identifiant");
  const date = typeof c.dateSouscription === "string" ? c.dateSouscription.trim() : "";
  if (date !== attendu.dateSouscription) champs.push("dateSouscription");
  let motif: string | null = null;
  if (c.motif !== undefined && c.motif !== null) {
    if (typeof c.motif !== "string" || c.motif.trim().length > MOTIF_MAX) champs.push("motif");
    else motif = c.motif.trim() || null;
  }
  return champs.length ? { ok: false, champs } : { ok: true, motif };
}

// ─── Stripe ─────────────────────────────────────────────────────────────────────

type Ref = string | { id: string } | null | undefined;
const idDe = (r: Ref) => (typeof r === "string" ? r : r?.id ?? null);

/** Sous-ensemble du client Stripe utilisé (le vrai client le satisfait). */
export type StripeRenonciation = {
  subscriptions: {
    cancel: (id: string) => Promise<{ id: string; status: string }>;
  };
  invoices: {
    list: (p: { subscription: string; status: "paid"; limit: number }) => Promise<{ data: Array<{ id?: string; amount_paid: number; currency: string }> }>;
  };
  invoicePayments: {
    list: (p: { invoice: string; limit: number }) => Promise<{
      data: Array<{ status: string; amount_paid: number | null; payment: { type: string; payment_intent?: Ref; charge?: Ref } }>;
    }>;
  };
  refunds: {
    create: (
      p: { payment_intent?: string; charge?: string; reason: "requested_by_customer"; metadata: Record<string, string> },
      o: { idempotencyKey: string }
    ) => Promise<{ id: string; amount: number; status: string | null }>;
  };
};

export type ResultatRenonciation = {
  montantRembourseCentimes: number;
  devise: string | null;
  refundIds: string[];
  /** Paiements dont le remboursement a échoué : à traiter à la main dans Stripe. */
  echecs: string[];
};

/** Arrête l'abonnement immédiatement, puis rembourse en totalité chaque paiement de ses
 *  factures payées. Les clés d'idempotence (abonnement + paiement) empêchent un double
 *  remboursement si la demande est rejouée. Un échec de remboursement n'interrompt pas les
 *  autres : il est renvoyé dans `echecs`. */
export async function executerRenonciation(stripe: StripeRenonciation, subscriptionId: string, reference: string): Promise<ResultatRenonciation> {
  await stripe.subscriptions.cancel(subscriptionId);

  const resultat: ResultatRenonciation = { montantRembourseCentimes: 0, devise: null, refundIds: [], echecs: [] };
  const factures = await stripe.invoices.list({ subscription: subscriptionId, status: "paid", limit: 100 });
  for (const facture of factures.data) {
    if (!facture.id || facture.amount_paid <= 0) continue;
    const paiements = await stripe.invoicePayments.list({ invoice: facture.id, limit: 100 });
    for (const p of paiements.data) {
      if (p.status !== "paid" || !p.amount_paid) continue;
      const paymentIntent = p.payment.type === "payment_intent" ? idDe(p.payment.payment_intent) : null;
      const charge = p.payment.type === "charge" ? idDe(p.payment.charge) : null;
      const cible = paymentIntent ?? charge;
      if (!cible) continue;
      try {
        const refund = await stripe.refunds.create(
          {
            ...(paymentIntent ? { payment_intent: paymentIntent } : { charge: charge! }),
            reason: "requested_by_customer",
            metadata: { renonciation: reference, subscription: subscriptionId },
          },
          { idempotencyKey: `renonciation-${subscriptionId}-${cible}` }
        );
        resultat.refundIds.push(refund.id);
        resultat.montantRembourseCentimes += refund.amount;
        resultat.devise = facture.currency;
      } catch (err) {
        // Déjà remboursé (demande rejouée hors idempotence) : rien à faire de plus.
        const code = (err as { code?: string })?.code;
        if (code === "charge_already_refunded") continue;
        console.error(`[renonciation] remboursement de ${cible} impossible :`, err instanceof Error ? err.message : err);
        resultat.echecs.push(cible);
      }
    }
  }
  return resultat;
}
