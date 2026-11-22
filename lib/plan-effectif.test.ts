import test from "node:test";
import assert from "node:assert/strict";
import { planEffectif } from "./plan-effectif";

test("Expert avec une période en cours garde son plan", () => {
  assert.equal(planEffectif("expert", true), "expert");
});

test("Expert sans période en cours n'a aucun abonnement", () => {
  assert.equal(planEffectif("expert", false), null);
});

test("Pro et Agency ne dépendent pas des périodes Expert", () => {
  assert.equal(planEffectif("pro", false), "pro");
  assert.equal(planEffectif("agency", false), "agency");
});

test("Sans profil ni plan : aucun abonnement", () => {
  assert.equal(planEffectif(null, false), null);
  assert.equal(planEffectif(undefined, true), null);
});

test("Valeur inconnue (ancienne valeur ou faute de frappe) : aucun abonnement", () => {
  assert.equal(planEffectif("basique", true), null);
  assert.equal(planEffectif("gold", false), null);
});
