import test from "node:test";
import assert from "node:assert/strict";
import { referenceRetractation, validerDemande } from "./retractation";

test("demande valide nettoyée", () => {
  const r = validerDemande({ nom: "  Jeanne Dupont ", email: "Jeanne@Exemple.FR", achat: "Abonnement Pro", achatRef: null, dateAchat: "2026-11-15" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.demande.nom, "Jeanne Dupont");
    assert.equal(r.demande.email, "jeanne@exemple.fr");
  }
});

test("champs invalides signalés", () => {
  const r = validerDemande({ nom: "J", email: "pas-un-email", achat: "", dateAchat: "15/11/2026" });
  assert.deepEqual(r.ok ? [] : r.champs, ["nom", "email", "achat", "dateAchat"]);
  const futur = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const r2 = validerDemande({ nom: "Jeanne", email: "j@x.fr", achat: "Formation", dateAchat: futur });
  assert.deepEqual(r2.ok ? [] : r2.champs, ["dateAchat"]);
});

test("référence : RET-AAAAMMJJ-XXXXXX", () => {
  assert.match(referenceRetractation(new Date("2026-11-22T10:00:00Z")), /^RET-20261122-[A-Z2-9]{6}$/);
});
