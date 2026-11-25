import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGUE_MAX_PRO, CATALOGUE_TAILLE_AFFICHEE, tailleCatalogueAffichee } from "./plan-limits";
import { remplirValeurs, valeursPrix } from "./prix";

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const LANGUES = ["fr", "en", "es", "it"] as const;

describe("taille du catalogue complet affichée (« 40K »)", () => {
  it("une seule constante, qui vaut 40K", () => {
    assert.equal(CATALOGUE_TAILLE_AFFICHEE, "40K");
    assert.equal(valeursPrix("fr").taille, "40K");
  });

  it("les 4 langues passent par la variable {taille} après « catalogue complet »", () => {
    const attendu: Record<(typeof LANGUES)[number], RegExp> = {
      fr: /[Cc]atalogue complet \(\{taille\} produits\)/,
      en: /[Ff]ull catalog \(\{taille\} products\)/,
      es: /[Cc]atálogo completo \(\{taille\} productos\)/,
      it: /[Cc]atalogo completo \(\{taille\} prodotti\)/,
    };
    for (const langue of LANGUES) {
      const m = JSON.parse(lire(`messages/${langue}.json`));
      const textes = [
        m.parametres.usage.catalogueFull,
        m.dashboard.utilisation.catalogueFull,
        m.landing.pricing.features.agency[1],
        m.landing.faq.a1,
        m.faq.questions.differences.agency,
      ];
      for (const texte of textes) assert.match(texte, attendu[langue], `${langue} : ${texte}`);
      // Jamais écrit en dur dans les traductions.
      assert.doesNotMatch(JSON.stringify(m), /40K/, langue);
    }
  });

  it("rendu exact dans chaque langue", () => {
    const rendus: Record<(typeof LANGUES)[number], string> = {
      fr: "Catalogue complet (40K produits)",
      en: "Full catalog (40K products)",
      es: "Catálogo completo (40K productos)",
      it: "Catalogo completo (40K prodotti)",
    };
    for (const langue of LANGUES) {
      const m = JSON.parse(lire(`messages/${langue}.json`));
      assert.equal(remplirValeurs(m.parametres.usage.catalogueFull, valeursPrix(langue)), rendus[langue], langue);
    }
  });

  it("limite Pro sous la même forme : 15K", () => {
    assert.equal(tailleCatalogueAffichee(CATALOGUE_MAX_PRO), "15K");
    assert.equal(tailleCatalogueAffichee(1_234, "fr").replace(/\s/g, " "), "1 234");
    assert.equal(remplirValeurs(JSON.parse(lire("messages/fr.json")).landing.pricing.features.pro[0], valeursPrix("fr")), "Catalogue de 15K produits");
  });

  it("les composants passent la constante aux traductions", () => {
    for (const chemin of ["components/ParametresModal.tsx", "app/dashboard/utilisation/page.tsx"]) {
      const code = lire(chemin);
      assert.ok(code.includes("{ taille: CATALOGUE_TAILLE_AFFICHEE }"), chemin);
      assert.ok(code.includes("tailleCatalogueAffichee(usage.catalogue.max"), chemin);
    }
  });
});
