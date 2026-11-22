import test from "node:test";
import assert from "node:assert/strict";
import { PHRASE_REMBOURSEMENT, SUJET_ACCUSE_RETRACTATION, emailAccuseRetractation } from "./accuse-retractation";

const base = { a: "j@exemple.fr", nom: "Jeanne Dupont", reference: "RET-20261122-ABCDEF", recueLe: "2026-11-22T13:05:00Z", achat: "Abonnement Pro (2026-11-20)" };

test("contenu : sujet, référence, date et heure, achat, phrase de remboursement", () => {
  const m = emailAccuseRetractation(base);
  assert.equal(m.a, "j@exemple.fr");
  assert.equal(m.sujet, SUJET_ACCUSE_RETRACTATION);
  for (const partie of [m.html, m.texte]) {
    assert.ok(partie.includes("RET-20261122-ABCDEF"));
    assert.ok(partie.includes("22 novembre 2026 à 14:05"));
    assert.ok(partie.includes("Abonnement Pro (2026-11-20)"));
    assert.ok(partie.includes(PHRASE_REMBOURSEMENT));
  }
  assert.doesNotMatch(m.html, /<img|https?:\/\//);
});

test("échappement HTML des champs saisis", () => {
  const m = emailAccuseRetractation({ ...base, nom: "<script>alert(1)</script>", achat: `Offre "Pro" & <b>x</b>` });
  assert.doesNotMatch(m.html, /<script>|<b>x<\/b>/);
  assert.ok(m.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(m.html.includes("Offre &quot;Pro&quot; &amp; &lt;b&gt;x&lt;/b&gt;"));
  assert.ok(m.texte.includes(`Offre "Pro" & <b>x</b>`));
});
