import test from "node:test";
import assert from "node:assert/strict";
import { SUJET_CONFIRMATION_RESILIATION, emailConfirmationResiliation } from "./confirmation-resiliation";

test("contenu : sujet, référence, offre, date de fin d'accès", () => {
  const m = emailConfirmationResiliation({ a: "c@exemple.fr", reference: "RES-20261122-ABCDEF", plan: "agency", finAcces: "2026-12-22T10:00:00Z" });
  assert.equal(m.sujet, SUJET_CONFIRMATION_RESILIATION);
  for (const partie of [m.html, m.texte]) {
    assert.ok(partie.includes("RES-20261122-ABCDEF"));
    assert.ok(partie.includes("Agency"));
    assert.ok(partie.includes("22 décembre 2026"));
  }
  assert.doesNotMatch(m.html, /<img|https?:\/\//);
});

test("date absente et échappement HTML de l'offre", () => {
  const m = emailConfirmationResiliation({ a: "c@exemple.fr", reference: "RES-1", plan: "<i>x</i>", finAcces: null });
  assert.ok(m.html.includes("date non communiquée"));
  assert.doesNotMatch(m.html, /<i>x<\/i>/);
  assert.ok(m.html.includes("&lt;i&gt;x&lt;/i&gt;"));
});
