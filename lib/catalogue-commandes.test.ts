// Plancher de 100 commandes du catalogue : npm test.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COMMANDES_MIN_DEFAUT, commandesMinEffectif } from "./catalogue-commandes";

describe("minimum de commandes", () => {
  it("le plancher est 100", () => assert.equal(COMMANDES_MIN_DEFAUT, 100));
  it("requête sans commandesMin → 100", () => {
    for (const v of [null, undefined, "", "abc"]) assert.equal(commandesMinEffectif(v), 100, String(v));
  });
  it("commandesMin=50 → 100", () => assert.equal(commandesMinEffectif("50"), 100));
  it("commandesMin=0 ou négatif → 100", () => {
    assert.equal(commandesMinEffectif("0"), 100);
    assert.equal(commandesMinEffectif("-20"), 100);
  });
  it("commandesMin=100 → 100", () => assert.equal(commandesMinEffectif("100"), 100));
  it("commandesMin=500 → 500", () => assert.equal(commandesMinEffectif("500"), 500));
  it("plage « sweet spot » qui commence sous 100 → bas de plage ramené à 100, haut inchangé", () => {
    const params = new URLSearchParams("commandesMin=20&commandesMax=1000");
    assert.equal(commandesMinEffectif(params.get("commandesMin")), 100);
    assert.equal(params.get("commandesMax"), "1000");
  });
});
