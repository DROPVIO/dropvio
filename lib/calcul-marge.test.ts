import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCharges, STRIPE_FIXED_UK, STRIPE_FIXED_US, VAT_RATE_UK } from "./calcul-marge";

const BASE = { extraUE: false, tauxCharge: "", tauxTaxe: "" };
const proche = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

describe("calculateur de marge — mode UK", () => {
  it("sans option : VAT 20 % + Stripe 1,5 % + 0,20 £, comme avant", () => {
    const c = getCharges("uk", { ...BASE, stripeRateUK: "1.5", tauxRetourUK: "" });
    proche(c.rate, 0.015 + VAT_RATE_UK);
    assert.equal(c.fixed, STRIPE_FIXED_UK);
    assert.deepEqual(c.breakdown.map((l) => l.labelKey), ["bdStripeUk", "bdVat", "bdRetour"]);
  });

  it("carte internationale : +1,5 %", () => {
    const c = getCharges("uk", { ...BASE, stripeRateUK: "1.5", carteInternationaleUK: true });
    proche(c.rate, 0.015 + 0.015 + VAT_RATE_UK);
    assert.ok(c.breakdown.some((l) => l.labelKey === "bdCarteInternationale" && l.detail === "+1.5%"));
  });

  it("conversion de devise : +1 %, cumulable avec la carte internationale", () => {
    const c = getCharges("uk", { ...BASE, stripeRateUK: "1.5", carteInternationaleUK: true, conversionDeviseUK: true });
    proche(c.rate, 0.015 + 0.015 + 0.01 + VAT_RATE_UK);
    assert.equal(c.fixed, STRIPE_FIXED_UK);
  });
});

describe("calculateur de marge — mode US", () => {
  it("sans option ni douane : Stripe 2,9 % + 0,30 $, comme avant", () => {
    const c = getCharges("us", { ...BASE, stripeRateUS: "2.9", usState: "CA", salesTaxNexusUS: false });
    proche(c.rate, 0.029);
    assert.equal(c.fixed, STRIPE_FIXED_US);
    assert.deepEqual(c.breakdown.map((l) => l.labelKey), ["bdStripeUs", "bdRetour", "bdSalesTax"]);
  });

  it("taxe de vente de l'état seulement avec nexus confirmé", () => {
    const c = getCharges("us", { ...BASE, stripeRateUS: "2.9", usState: "CA", salesTaxNexusUS: true });
    proche(c.rate, 0.029 + 0.0725);
  });

  it("suppléments carte internationale (+1,5 %) et conversion (+1 %)", () => {
    const c = getCharges("us", { ...BASE, stripeRateUS: "2.9", carteInternationaleUS: true, conversionDeviseUS: true });
    proche(c.rate, 0.029 + 0.015 + 0.01);
  });

  it("droits de douane manuels déduits comme coût fixe par commande", () => {
    const c = getCharges("us", { ...BASE, stripeRateUS: "2.9", douaneParCommandeUS: "4.5" });
    proche(c.fixed, STRIPE_FIXED_US + 4.5);
    assert.ok(c.breakdown.some((l) => l.labelKey === "bdDouaneUs" && l.detail === "$4.50"));
  });

  it("douane vide ou négative : ignorée", () => {
    assert.equal(getCharges("us", { ...BASE, douaneParCommandeUS: "" }).fixed, STRIPE_FIXED_US);
    assert.equal(getCharges("us", { ...BASE, douaneParCommandeUS: "-3" }).fixed, STRIPE_FIXED_US);
  });
});

describe("calculateur de marge — les autres modes ignorent les options UK/US", () => {
  it("France et Belgique inchangées", () => {
    const options = { carteInternationaleUK: true, conversionDeviseUK: true, carteInternationaleUS: true, conversionDeviseUS: true, douaneParCommandeUS: "10" };
    const fr = getCharges("france", { ...BASE, ...options });
    proche(fr.rate, 0.123 + 0.015);
    assert.equal(fr.fixed, 0.25);
    const be = getCharges("be", { ...BASE, ...options, stripeRateBE: "1.5" });
    proche(be.rate, 0.015 + 0.21);
    assert.equal(be.fixed, 0.25);
  });
});
