import test from "node:test";
import assert from "node:assert/strict";
import { planEffectif } from "./plan-effectif";

test("Expert avec une période en cours garde son plan", () => {
  assert.equal(planEffectif("expert", true), "expert");
});

test("Expert expiré est traité comme Free", () => {
  assert.equal(planEffectif("expert", false), "free");
});

test("Pro et Agency ne dépendent pas des périodes Expert", () => {
  assert.equal(planEffectif("pro", false), "pro");
  assert.equal(planEffectif("agency", false), "agency");
});

test("Sans profil ni plan : Free", () => {
  assert.equal(planEffectif(null, false), "free");
  assert.equal(planEffectif(undefined, true), "free");
});
