import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  dansLeDelai,
  dateParis,
  dernierJourRenonciation,
  executerRenonciation,
  referenceRenonciation,
  validerRenonciation,
  type StripeRenonciation,
} from "./renonciation";
import { SUJET_CONFIRMATION_RENONCIATION, emailConfirmationRenonciation } from "./emails/confirmation-renonciation";

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

describe("renonciation — délai de 14 jours", () => {
  it("date civile à Paris (passage à minuit)", () => {
    assert.equal(dateParis(new Date("2026-11-09T23:30:00Z")), "2026-11-10");
    assert.equal(dateParis(new Date("2026-07-09T21:59:00Z")), "2026-07-09");
  });

  it("expire à la fin du 14e jour après la souscription", () => {
    const souscription = new Date("2026-11-09T10:00:00Z");
    assert.equal(dernierJourRenonciation(souscription), "2026-11-23");
    assert.ok(dansLeDelai(souscription, new Date("2026-11-23T22:59:00Z"))); // 23:59 à Paris
    assert.ok(!dansLeDelai(souscription, new Date("2026-11-23T23:01:00Z"))); // 00:01 le 24
    assert.ok(dansLeDelai(souscription, souscription));
  });

  it("traverse les fins de mois", () => {
    assert.equal(dernierJourRenonciation(new Date("2026-02-20T12:00:00Z")), "2026-03-06");
  });
});

describe("renonciation — formulaire", () => {
  const attendu = { email: "Client@Exemple.fr", dateSouscription: "2026-11-20" };

  it("identifiant (sans casse) et date du compte, motif facultatif", () => {
    assert.deepEqual(validerRenonciation({ identifiant: " client@exemple.fr ", dateSouscription: "2026-11-20" }, attendu), { ok: true, motif: null });
    assert.deepEqual(validerRenonciation({ identifiant: "client@exemple.fr", dateSouscription: "2026-11-20", motif: "  Trop cher " }, attendu), {
      ok: true,
      motif: "Trop cher",
    });
  });

  it("refuse un identifiant ou une date qui ne correspondent pas", () => {
    assert.deepEqual(validerRenonciation({ identifiant: "autre@exemple.fr", dateSouscription: "2026-11-19" }, attendu), {
      ok: false,
      champs: ["identifiant", "dateSouscription"],
    });
    assert.deepEqual(validerRenonciation(null, attendu), { ok: false, champs: ["identifiant", "dateSouscription"] });
  });

  it("motif limité à 1000 caractères", () => {
    const r = validerRenonciation({ identifiant: "client@exemple.fr", dateSouscription: "2026-11-20", motif: "x".repeat(1001) }, attendu);
    assert.deepEqual(r, { ok: false, champs: ["motif"] });
  });

  it("référence REN-AAAAMMJJ-XXXXXX", () => {
    assert.match(referenceRenonciation(new Date("2026-11-23T08:00:00Z")), /^REN-20261123-[A-HJ-NP-Z2-9]{6}$/);
  });
});

function fauxStripe(options: { echec?: string; dejaRembourse?: string } = {}) {
  const appels: string[] = [];
  const refunds: Array<{ params: Record<string, unknown>; cle: string }> = [];
  const stripe: StripeRenonciation = {
    subscriptions: {
      cancel: async (id) => {
        appels.push(`cancel:${id}`);
        return { id, status: "canceled" };
      },
    },
    invoices: {
      list: async (p) => {
        appels.push(`invoices:${p.subscription}:${p.status}`);
        return {
          data: [
            { id: "in_1", amount_paid: 2900, currency: "eur" },
            { id: "in_essai", amount_paid: 0, currency: "eur" },
            { id: "in_2", amount_paid: 1000, currency: "eur" },
          ],
        };
      },
    },
    invoicePayments: {
      list: async ({ invoice }) => ({
        data:
          invoice === "in_1"
            ? [
                { status: "paid", amount_paid: 2900, payment: { type: "payment_intent", payment_intent: "pi_1" } },
                { status: "canceled", amount_paid: null, payment: { type: "payment_intent", payment_intent: "pi_annule" } },
              ]
            : [{ status: "paid", amount_paid: 1000, payment: { type: "charge", charge: { id: "ch_2" } } }],
      }),
    },
    refunds: {
      create: async (params, { idempotencyKey }) => {
        const cible = (params.payment_intent ?? params.charge) as string;
        if (cible === options.echec) throw Object.assign(new Error("carte expirée"), { code: "card_declined" });
        if (cible === options.dejaRembourse) throw Object.assign(new Error("déjà remboursé"), { code: "charge_already_refunded" });
        refunds.push({ params, cle: idempotencyKey });
        return { id: `re_${cible}`, amount: cible === "pi_1" ? 2900 : 1000, status: "succeeded" };
      },
    },
  };
  return { stripe, appels, refunds };
}

describe("renonciation — arrêt et remboursement intégral via Stripe", () => {
  it("arrête l'abonnement puis rembourse chaque paiement des factures payées", async () => {
    const { stripe, appels, refunds } = fauxStripe();
    const r = await executerRenonciation(stripe, "sub_1", "REN-20261123-ABCDEF");
    assert.equal(appels[0], "cancel:sub_1");
    assert.equal(appels[1], "invoices:sub_1:paid");
    assert.deepEqual(r, { montantRembourseCentimes: 3900, devise: "eur", refundIds: ["re_pi_1", "re_ch_2"], echecs: [] });
    assert.deepEqual(refunds.map((x) => x.cle), ["renonciation-sub_1-pi_1", "renonciation-sub_1-ch_2"]);
    assert.equal(refunds[0].params.payment_intent, "pi_1");
    assert.equal(refunds[1].params.charge, "ch_2");
    assert.equal(refunds[0].params.reason, "requested_by_customer");
    // Remboursement intégral : aucun montant partiel n'est passé à Stripe.
    assert.ok(refunds.every((x) => !("amount" in x.params)));
  });

  it("un échec de remboursement est signalé sans bloquer les autres", async () => {
    const { stripe } = fauxStripe({ echec: "pi_1" });
    const erreur = console.error;
    console.error = () => {};
    try {
      const r = await executerRenonciation(stripe, "sub_1", "REN");
      assert.deepEqual(r.echecs, ["pi_1"]);
      assert.equal(r.montantRembourseCentimes, 1000);
    } finally {
      console.error = erreur;
    }
  });

  it("paiement déjà remboursé : ignoré, pas compté comme un échec", async () => {
    const { stripe } = fauxStripe({ dejaRembourse: "ch_2" });
    const r = await executerRenonciation(stripe, "sub_1", "REN");
    assert.deepEqual(r.echecs, []);
    assert.equal(r.montantRembourseCentimes, 2900);
  });
});

describe("renonciation — e-mail de confirmation", () => {
  const base = {
    a: "client@exemple.fr",
    reference: "REN-20261123-ABCDEF",
    plan: "pro",
    dateSouscription: "2026-11-20",
    recueLe: "2026-11-23T09:05:00Z",
    motif: "<b>Trop cher</b>",
    montantRembourseCentimes: 2900,
    devise: "eur",
    remboursementComplet: true,
  };

  it("référence, offre, dates, motif échappé et montant remboursé", () => {
    const m = emailConfirmationRenonciation(base);
    assert.equal(m.sujet, SUJET_CONFIRMATION_RENONCIATION);
    for (const partie of [m.html, m.texte]) {
      assert.ok(partie.includes("REN-20261123-ABCDEF"));
      assert.ok(partie.includes("Pro"));
      assert.ok(partie.includes("20 novembre 2026"));
      assert.ok(partie.includes("23 novembre 2026 à 10:05"));
      assert.ok(/29,00\s€/.test(partie));
      assert.ok(partie.includes("intégralité des sommes versées"));
    }
    assert.ok(m.html.includes("&lt;b&gt;Trop cher&lt;/b&gt;"));
  });

  it("remboursement incomplet : délai légal de 14 jours annoncé", () => {
    const m = emailConfirmationRenonciation({ ...base, remboursementComplet: false, motif: null });
    assert.ok(m.texte.includes("au plus tard 14 jours"));
    assert.ok(!m.texte.includes("Motif"));
  });
});

describe("renonciation — parcours dans l'espace client", () => {
  it("bouton « Renoncer au contrat ici » sur /abonnement, seulement si éligible", () => {
    const page = lire("app/abonnement/page.tsx");
    assert.ok(page.includes('fetch("/api/renonciation")'));
    assert.ok(/renonciationPossible \? \(\s*<Link\s+href="\/renonciation"/.test(page));
    for (const langue of ["fr", "en", "es", "it"]) {
      const m = JSON.parse(lire(`messages/${langue}.json`));
      assert.ok(m.renonciation.bouton.length > 0, langue);
      assert.ok(m.apiErrors.renonciation_invalide && m.apiErrors.renonciation_hors_delai, langue);
    }
    assert.equal(JSON.parse(lire("messages/fr.json")).renonciation.bouton, "Renoncer au contrat ici");
  });

  it("formulaire : identifiant, date de souscription, motif facultatif ; page protégée", () => {
    const form = lire("components/renonciation/FormulaireRenonciation.tsx");
    assert.ok(form.includes('t("identifiant")') && form.includes('t("dateSouscription")') && form.includes('t("motif")'));
    assert.ok(!/value=\{motif\}[^>]*required/.test(form));
    assert.ok(lire("proxy.ts").includes('const RENONCIATION_PATH = "/renonciation"'));
  });

  it("migration 069 : colonnes du parcours connecté, non appliquée par le code", () => {
    const sql = lire("supabase/migrations/069_renonciation_espace_client.sql");
    for (const colonne of ["origine", "motif", "stripe_subscription_id", "montant_rembourse_centimes", "stripe_refund_ids", "rembourse_le"]) {
      assert.ok(sql.includes(`add column if not exists ${colonne}`), colonne);
    }
    assert.ok(sql.includes("'remboursee'"));
  });
});

describe("résiliation — parcours dans l'espace client", () => {
  it("bouton « Résilier mon abonnement » (4 langues) sur /abonnement et dans le pied de page", () => {
    const attendu: Record<string, string> = {
      fr: "Résilier mon abonnement",
      en: "Cancel my subscription",
      es: "Cancelar mi suscripción",
      it: "Disdici il mio abbonamento",
    };
    for (const [langue, texte] of Object.entries(attendu)) {
      assert.equal(JSON.parse(lire(`messages/${langue}.json`)).resiliation.lien, texte);
    }
    assert.ok(/href="\/resiliation"[\s\S]{0,300}tResiliation\("lien"\)/.test(lire("app/abonnement/page.tsx")));
  });

  it("trois clics au plus : bouton → « Confirmer la résiliation » → confirmation", () => {
    const parcours = lire("components/resiliation/ParcoursResiliation.tsx");
    assert.equal(parcours.match(/onClick=\{confirmer\}/g)?.length, 1);
    assert.ok(parcours.includes('fetch("/api/resiliation", { method: "POST" })'));
  });

  it("effet en fin de période, sans remboursement, confirmation par e-mail", () => {
    const route = lire("app/api/resiliation/route.ts");
    assert.ok(route.includes("cancel_at_period_end: true"));
    assert.ok(!route.includes("refunds.create"));
    assert.ok(route.includes("emailConfirmationResiliation("));
  });
});
