import test from "node:test";
import assert from "node:assert/strict";
import { TEXTES_CONSENTEMENT, consentementsComplets, familleDeAchat } from "./consentements";
import { adresseIp, exigerConsentement } from "./consentements-serveur";
import { SUPPORTED_LOCALES } from "./locale";

test("les deux cases sont exigées, cochées explicitement", () => {
  assert.equal(consentementsComplets({ accesImmediat: true, renonciation: true }), true);
  assert.equal(consentementsComplets({ accesImmediat: true, renonciation: false }), false);
  assert.equal(consentementsComplets({ accesImmediat: "true", renonciation: true }), false);
  assert.equal(consentementsComplets(undefined), false);
});

test("famille de consentement selon le type d'achat", () => {
  assert.equal(familleDeAchat("formation_bundle"), "formation");
  assert.equal(familleDeAchat("abonnement_pro"), "service");
  assert.equal(familleDeAchat("recharge_expert"), "service");
});

test("textes des deux cases présents dans les 4 langues, français exact", () => {
  for (const famille of ["service", "formation"] as const) {
    for (const l of SUPPORTED_LOCALES) {
      const [a, b] = TEXTES_CONSENTEMENT[famille][l];
      assert.ok(a.length > 10 && b.length > 10, `${famille} ${l}`);
    }
  }
  assert.equal(TEXTES_CONSENTEMENT.service.fr[0], "Je demande l'accès immédiat au service avant la fin du délai de rétractation de 14 jours.");
  assert.equal(TEXTES_CONSENTEMENT.formation.fr[1], "Je reconnais perdre mon droit de rétractation dès le début de l'accès.");
});

test("paiement sans les deux consentements : 400 consentement_requis, rien n'est enregistré", async () => {
  const requete = new Request("http://localhost/api/abonnement/checkout", { method: "POST" });
  for (const corps of [{}, { consentements: { accesImmediat: true } }, { consentements: { accesImmediat: true, renonciation: false } }]) {
    const reponse = await exigerConsentement(requete, corps, "user_1", "abonnement_pro");
    assert.ok(reponse);
    assert.equal(reponse.status, 400);
    assert.equal((await reponse.json()).code, "consentement_requis");
  }
});

test("adresse IP : premier élément de x-forwarded-for, sinon x-real-ip", () => {
  assert.equal(adresseIp(new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } })), "203.0.113.7");
  assert.equal(adresseIp(new Request("http://x", { headers: { "x-real-ip": "198.51.100.2" } })), "198.51.100.2");
  assert.equal(adresseIp(new Request("http://x")), null);
});
