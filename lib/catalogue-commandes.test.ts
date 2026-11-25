// Filtre « volume de commandes minimum » du catalogue, sans plancher : npm test.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { commandesMinFiltre } from "./catalogue-commandes";

describe("filtre de commandes minimum (sans plancher)", () => {
  it("absent ou illisible → aucun filtre", () => {
    for (const v of [null, undefined, "", "abc"]) assert.equal(commandesMinFiltre(v), null, String(v));
  });
  it("0 ou négatif → aucun filtre", () => {
    assert.equal(commandesMinFiltre("0"), null);
    assert.equal(commandesMinFiltre("-20"), null);
  });
  it("valeur saisie respectée, même sous 100", () => {
    assert.equal(commandesMinFiltre("1"), 1);
    assert.equal(commandesMinFiltre("50"), 50);
    assert.equal(commandesMinFiltre(500), 500);
    assert.equal(commandesMinFiltre("12.7"), 12);
  });
});
