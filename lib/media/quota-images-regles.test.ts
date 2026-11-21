// Règles du quota d'images (coût d'un lot, images possibles) : npm test.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { imagesPossiblesBudget, planifierLot, sourceQuotaImages } from "./quota-images-regles";

describe("source du quota par plan", () => {
  it("Expert : quota d'images ; Pro et Agency : budget IA ; sans plan payant : aucune génération", () => {
    assert.equal(sourceQuotaImages("expert"), "expert");
    assert.equal(sourceQuotaImages("pro"), "budget");
    assert.equal(sourceQuotaImages("agency"), "budget");
    assert.equal(sourceQuotaImages("free"), null);
  });
});

describe("images couvertes par le budget restant", () => {
  it("arrondi à l'image entière inférieure, jamais négatif", () => {
    assert.equal(imagesPossiblesBudget(6, 0, 0.1), 60);
    assert.equal(imagesPossiblesBudget(6, 5.75, 0.1), 2);
    assert.equal(imagesPossiblesBudget(0.3, 0, 0.1), 3);
    assert.equal(imagesPossiblesBudget(6, 7, 0.1), 0);
    assert.equal(imagesPossiblesBudget(6, 0, 0), 0);
  });
});

describe("coût estimé d'un lot", () => {
  it("nombre d'images × coût par image, couvert si le quota suffit", () => {
    assert.deepEqual(planifierLot(180, 1, 200, 0.1), { images: 180, coutEur: 18, couvert: true, imagesPossibles: 180, produitsPossibles: 180 });
  });
  it("quota insuffisant : pas couvert, images et produits possibles calculés", () => {
    assert.deepEqual(planifierLot(180, 1, 42, 0.1), { images: 180, coutEur: 18, couvert: false, imagesPossibles: 42, produitsPossibles: 42 });
    // 2 images par produit : 42 images possibles = 21 produits entiers.
    assert.equal(planifierLot(100, 2, 42, 0.1).produitsPossibles, 21);
    assert.equal(planifierLot(10, 3, 5, 0.1).produitsPossibles, 1);
  });
  it("quota épuisé : aucune image possible", () => {
    const lot = planifierLot(5, 1, 0, 0.1);
    assert.equal(lot.couvert, false);
    assert.equal(lot.produitsPossibles, 0);
  });
});
