import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ATTRIBUT_MENTION_IA, avecMentionIaSite, siteAvecMentionIa } from "./mention-ia-site";

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");
const messages = (langue: string) => JSON.parse(lire(`messages/${langue}.json`));

describe("mention « Contenu généré par IA » — traductions", () => {
  const attendu: Record<string, string> = {
    fr: "Contenu généré par IA",
    en: "AI-generated content",
    es: "Contenido generado por IA",
    it: "Contenuto generato dall'IA",
  };
  for (const [langue, texte] of Object.entries(attendu)) {
    it(`${langue} : interface et sites générés`, () => {
      const m = messages(langue);
      assert.equal(m.mentionIa.texte, texte);
      assert.equal(m.siteContenu.mentionIa, texte);
    });
  }
});

describe("mention IA — sites générés (pied de page)", () => {
  const page = `<html lang="fr"><body><main>x</main><footer><p>© Boutique</p></footer></body></html>`;

  it("ajoutée à la fin du footer", () => {
    const html = avecMentionIaSite(page, "Contenu généré par IA");
    assert.match(html, /<footer><p>© Boutique<\/p><p data-dv-mention-ia="".*>Contenu généré par IA<\/p>\n<\/footer>/);
  });

  it("sans footer : pied de page créé avant </body>", () => {
    const html = avecMentionIaSite(`<html><body><main>x</main></body></html>`, "AI-generated content");
    assert.match(html, /<footer data-dv-mention-ia-pied="".*AI-generated content<\/p><\/footer>\n<\/body>/);
  });

  it("idempotente et texte échappé", () => {
    const une = avecMentionIaSite(page, "a < b");
    assert.ok(une.includes("a &lt; b"));
    assert.equal(avecMentionIaSite(une, "a < b"), une);
    assert.equal(une.split(ATTRIBUT_MENTION_IA).length - 1, 1);
  });

  it("toutes les pages d'un site multi-pages", () => {
    const site = siteAvecMentionIa({ html: page, pages: { accueil: page, cgv: page }, avertissements: ["x"] }, "Contenu généré par IA");
    assert.ok(site.html.includes(ATTRIBUT_MENTION_IA));
    assert.ok(site.pages!.accueil.includes(ATTRIBUT_MENTION_IA));
    assert.ok(site.pages!.cgv.includes(ATTRIBUT_MENTION_IA));
    assert.deepEqual(site.avertissements, ["x"]);
  });

  it("appliquée par la génération et la modification de site", () => {
    const generation = lire("app/api/generate-site/route.ts");
    assert.equal(generation.match(/siteAvecMentionIa\(/g)?.length, 3);
    assert.ok(lire("app/api/modifier-site/route.ts").includes("avecMentionIaSite(html, textesSite.mentionIa)"));
  });
});

describe("mention IA — audits", () => {
  it("affichée sous les résultats de l'audit", () => {
    const page = lire("app/audit/page.tsx");
    const resultats = page.slice(page.indexOf('id="audit-results"'));
    assert.ok(resultats.includes("<MentionIa />"));
  });
});

describe("mention IA — textes", () => {
  it("affichée sous le nom ou la description générés (Site Builder et boutique)", () => {
    for (const chemin of ["app/site-builder/page.tsx", "app/site-builder/boutique/[id]/page.tsx"]) {
      const page = lire(chemin);
      assert.ok(/texteGenereIa \? <MentionIa/.test(page), chemin);
      assert.equal(page.match(/setTexteGenereIa\(true\)/g)?.length, 2, chemin);
    }
  });

  it("affichée après une réécriture IA des fiches produits", () => {
    assert.ok(lire("components/site-builder/ActionProduitsIA.tsx").includes('action === "reecrire-produits" && resultat.modifies > 0 ? <MentionIa />'));
  });
});
