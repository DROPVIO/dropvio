import test from "node:test";
import assert from "node:assert/strict";
import { abonnementAResilier, finAcces, referenceResiliation } from "./resiliation";

const base = { planProfil: null, subscriptionProfil: null, statutProfil: null, subscriptionExpert: null, expertManuel: false } as const;

test("référence : RES-AAAAMMJJ-XXXXXX", () => {
  assert.match(referenceResiliation(new Date("2026-11-22T10:00:00Z")), /^RES-20261122-[A-Z2-9]{6}$/);
});

test("abonnement Pro / Agency résiliable", () => {
  assert.deepEqual(abonnementAResilier({ ...base, planProfil: "agency", subscriptionProfil: "sub_1", statutProfil: "active" }), {
    ok: true,
    abonnement: { plan: "agency", subscriptionId: "sub_1" },
  });
  // Paiement en échec : plan null côté profil, l'abonnement reste résiliable.
  const r = abonnementAResilier({ ...base, subscriptionProfil: "sub_2", statutProfil: "past_due" });
  assert.deepEqual(r, { ok: true, abonnement: { plan: null, subscriptionId: "sub_2" } });
});

test("Expert : abonnement Stripe résiliable, accès manuel refusé", () => {
  assert.deepEqual(abonnementAResilier({ ...base, subscriptionExpert: "sub_e" }), { ok: true, abonnement: { plan: "expert", subscriptionId: "sub_e" } });
  assert.deepEqual(abonnementAResilier({ ...base, subscriptionExpert: "manuel_x", expertManuel: true }), { ok: false, code: "abonnement_manuel" });
});

test("aucun abonnement", () => {
  assert.deepEqual(abonnementAResilier(base), { ok: false, code: "no_subscription" });
  assert.deepEqual(abonnementAResilier({ ...base, subscriptionProfil: "sub_3", statutProfil: "canceled" }), { ok: false, code: "no_subscription" });
});

test("date de fin d'accès : cancel_at, fin d'essai, puis fin de période", () => {
  const items = { data: [{ current_period_end: 1_800_000_000 }] };
  assert.equal(finAcces({ status: "active", cancel_at: 1_700_000_000, items }), new Date(1_700_000_000_000).toISOString());
  assert.equal(finAcces({ status: "trialing", trial_end: 1_750_000_000, items }), new Date(1_750_000_000_000).toISOString());
  assert.equal(finAcces({ status: "active", items }), new Date(1_800_000_000_000).toISOString());
  assert.equal(finAcces({ status: "active", items: { data: [] } }), null);
});
