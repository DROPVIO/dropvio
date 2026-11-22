// Règles d'abonnement (Expert / Pro / Agency, portail Stripe) : npm test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { decisionPortail, refusSouscriptionPlanPayant, type EtatExpert } from "./abonnement-regles";

const LANGUES = ["fr", "en", "es", "it"] as const;
const lireMessages = (langue: string) => JSON.parse(readFileSync(new URL(`../messages/${langue}.json`, import.meta.url), "utf8"));

const SANS_EXPERT: EtatExpert = { planProfil: null, periodeExpertActive: false, abonnementExpertEnCours: false };

describe("souscription Pro / Agency", () => {
  it("acceptée pour un compte sans Expert", () => {
    assert.equal(refusSouscriptionPlanPayant(SANS_EXPERT), null);
    assert.equal(refusSouscriptionPlanPayant({ ...SANS_EXPERT, planProfil: "pro" }), null);
    assert.equal(refusSouscriptionPlanPayant({ ...SANS_EXPERT, planProfil: null }), null);
  });

  it("refusée si profils.plan vaut expert", () => {
    assert.equal(refusSouscriptionPlanPayant({ ...SANS_EXPERT, planProfil: "expert" }), "expert_actif");
  });

  it("refusée si une période Expert couvre la date du jour, même sans plan", () => {
    assert.equal(refusSouscriptionPlanPayant({ ...SANS_EXPERT, periodeExpertActive: true }), "expert_actif");
  });

  it("refusée si un abonnement Expert est encore en cours chez Stripe", () => {
    assert.equal(refusSouscriptionPlanPayant({ ...SANS_EXPERT, abonnementExpertEnCours: true }), "expert_actif");
  });
});

describe("portail Stripe", () => {
  const base = { aClientStripe: true, periodeManuelle: false, expert: false, configurationExpert: undefined };

  it("ouvert avec la configuration par défaut pour Pro / Agency", () => {
    assert.deepEqual(decisionPortail(base), { ok: true, configuration: null });
  });

  it("rien à gérer sans client Stripe ou pour un Expert offert", () => {
    assert.deepEqual(decisionPortail({ ...base, aClientStripe: false }), { ok: false, code: "no_subscription" });
    assert.deepEqual(decisionPortail({ ...base, expert: true, periodeManuelle: true }), { ok: false, code: "no_subscription" });
  });

  it("fermé aux abonnés Expert sans configuration dédiée", () => {
    assert.deepEqual(decisionPortail({ ...base, expert: true }), { ok: false, code: "portail_expert_ferme" });
    assert.deepEqual(decisionPortail({ ...base, expert: true, configurationExpert: "  " }), { ok: false, code: "portail_expert_ferme" });
  });

  it("ouvert aux abonnés Expert avec la configuration dédiée uniquement", () => {
    assert.deepEqual(decisionPortail({ ...base, expert: true, configurationExpert: "bpc_test" }), { ok: true, configuration: "bpc_test" });
  });
});

describe("messages d'erreur traduits", () => {
  it("expert_actif et portail_expert_ferme existent dans les quatre langues", () => {
    for (const langue of LANGUES) {
      const { apiErrors } = lireMessages(langue);
      assert.ok(typeof apiErrors.expert_actif === "string" && apiErrors.expert_actif.length > 0, langue);
      assert.ok(typeof apiErrors.portail_expert_ferme === "string" && apiErrors.portail_expert_ferme.length > 0, langue);
    }
  });
});
