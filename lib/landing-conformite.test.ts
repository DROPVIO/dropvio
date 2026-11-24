import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ancreTitre, lireDocumentLegal } from "./legal-content";
import { STRIPE_FIXED, STRIPE_RATE_UE } from "./calcul-marge";

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const LANGUES = ["fr", "en", "es", "it"] as const;
const messages = (langue: string) => JSON.parse(lire(`messages/${langue}.json`));

describe("landing — allégations et prix", () => {
  it("aucune mention « gratuit » ni de marques citées comme caution", () => {
    for (const langue of LANGUES) {
      const landing = JSON.stringify(messages(langue).landing);
      assert.doesNotMatch(landing, /gratuit|gratis|gratuito|\bfree (plan|trial|forever)\b/i, langue);
      assert.doesNotMatch(landing, /Nielsen|McKinsey|Unbounce/, langue);
      assert.doesNotMatch(landing, /quasi illimit|near-unlimited|casi ilimitad|quasi illimitat/i, langue);
      // Pas de délai de support garanti : rien dans le code ne l'organise.
      assert.doesNotMatch(JSON.stringify(messages(langue).landing.pricing.features), /24 h/i, langue);
    }
  });

  it("prix affichés TTC", () => {
    const attendu: Record<string, RegExp> = { fr: /TTC/, en: /incl\. VAT/, es: /IVA incl\./, it: /IVA incl\./ };
    for (const langue of LANGUES) {
      const l = messages(langue).landing;
      assert.match(l.pricing.perMonth, attendu[langue], langue);
      assert.match(l.demo.perMonth, attendu[langue], langue);
    }
  });

  it("un seul appel à l'action principal, identique partout", () => {
    for (const langue of LANGUES) {
      const l = messages(langue).landing;
      assert.equal(l.nav.cta, l.hero.ctaPrimary, langue);
      assert.equal(l.final.cta, l.hero.ctaPrimary, langue);
    }
    assert.equal(messages("fr").landing.hero.ctaPrimary, "Créer mon compte");
  });

  it("exemple de marge : TVA et frais Stripe UE déduits, total juste", () => {
    const chaine = lire("components/landing/ChaineSection.tsx");
    const euros = (s: string) => Number(s.replace("−", "").replace(",", "."));
    const lignes = Object.fromEntries([...chaine.matchAll(/\["(s2\w+)", "([−\d,]+) €"\]/g)].map((m) => [m[1], euros(m[2])]));
    const prix = lignes.s2Sale;
    assert.equal(lignes.s2Fees, Math.round((prix * STRIPE_RATE_UE + STRIPE_FIXED) * 100) / 100);
    assert.equal(lignes.s2Tax, Math.round((prix / 1.2) * 0.2 * 100) / 100);
    const net = Math.round((prix - lignes.s2Cost - lignes.s2Fees - lignes.s2Tax) * 100) / 100;
    assert.ok(chaine.includes(`${net.toFixed(2).replace(".", ",")} €`), String(net));
  });

  it("exemples signalés : illustratifs, et contenu généré par IA pour l'audit", () => {
    const chaine = lire("components/landing/ChaineSection.tsx");
    assert.ok(chaine.includes('t("exempleIa")'));
    assert.equal(chaine.match(/t\("s2Illustrative"\)/g)?.length, 2);
    for (const langue of LANGUES) assert.ok(messages(langue).landing.chain.exempleIa.length > 0, langue);
    assert.equal(messages("fr").landing.chain.exempleIa, "Exemple illustratif · Contenu généré par IA");
  });

  it("vouvoiement dans les textes français de la landing et de l'inscription", () => {
    const fr = messages("fr");
    const textes = JSON.stringify([fr.landing.hero, fr.landing.demo, fr.landing.chain, fr.landing.pricing, fr.auth.register]);
    assert.doesNotMatch(textes, /\b(ton|ta|tes|tu|toi)\b|Débloque |réessaie\b/);
  });
});

describe("landing — liens juridiques et formulaire", () => {
  it("pied de page : mentions légales, CGV, confidentialité, cookies, rétractation", () => {
    const pied = lire("components/PiedDePageLegal.tsx");
    for (const lien of ["/mentions-legales", "/cgv", "/confidentialite", "/confidentialite#cookies", "/retractation"]) {
      assert.ok(pied.includes(`href="${lien}"`), lien);
    }
    for (const langue of LANGUES) assert.ok(messages(langue).piedDePage.cookies, langue);
  });

  it("la section cookies de la politique de confidentialité a son ancre", async () => {
    assert.equal(ancreTitre("7. Cookies"), "cookies");
    assert.equal(ancreTitre("6. Tes droits"), "tes-droits");
    assert.match(await lireDocumentLegal("confidentialite"), /<h2 id="cookies">/);
  });

  it("inscription : lien vers la confidentialité, aucune case pré-cochée", () => {
    const page = lire("app/register/page.tsx");
    assert.ok(page.includes('href="/confidentialite"'));
    assert.doesNotMatch(page, /defaultChecked|checked=\{true\}/);
    for (const langue of LANGUES) assert.match(messages(langue).auth.register.confidentialite, /<lien>.+<\/lien>/, langue);
  });
});

describe("espace client — résiliation et renonciation", () => {
  it("paramètres : « Résilier mon abonnement » toujours, « Renoncer au contrat ici » si éligible", () => {
    const modal = lire("components/ParametresModal.tsx");
    assert.ok(modal.includes('href="/resiliation"'));
    assert.ok(/renonciationPossible \? \(\s*<Link href="\/renonciation"/.test(modal));
    assert.ok(modal.includes('fetch("/api/renonciation")'));
  });
});
