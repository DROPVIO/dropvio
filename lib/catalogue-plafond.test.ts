import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  borneDepuisListe,
  commandesMinRepli,
  comparerOrdreCatalogue,
  dansLePlafond,
  filtreBorne,
  fonctionSansBorne,
  lireBorneCatalogue,
} from "./catalogue-plafond";
import { CATALOGUE_MAX_PRO, PLAN_LIMITS, limitesDuPlan } from "./plan-limits";
import { remplirValeurs, valeursPrix } from "./prix";

const lire = (chemin: string) => readFileSync(new URL(`../${chemin}`, import.meta.url), "utf8");

/** Générateur pseudo-aléatoire déterministe (tests reproductibles). */
function aleatoire(graine: number) {
  let x = graine >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}

function melanger<T>(liste: T[], graine: number): T[] {
  const r = aleatoire(graine);
  const copie = [...liste];
  for (let i = copie.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [copie[i], copie[j]] = [copie[j], copie[i]];
  }
  return copie;
}

// 20 000 produits : id numériques de longueurs variées, beaucoup d'ex æquo sur les commandes
// (paliers de 50) et 1 000 produits de moins de 100 commandes, dont des produits à 0 commande :
// sans plancher, ils font partie du catalogue comme les autres.
const r = aleatoire(42);
const CATALOGUE = Array.from({ length: 20_000 }, (_, i) => ({
  id: String(100_000_000 + Math.floor(r() * 9e15)).slice(0, 9 + (i % 8)),
  commandes: i < 1_000 ? Math.floor(r() * 100) : 100 + 50 * Math.floor(r() * 400),
})).filter((p, i, t) => t.findIndex((q) => q.id === p.id) === i);

describe("plafond du catalogue — limites par plan", () => {
  it("Pro : 15 000 produits ; Agency et Expert : tout le catalogue", () => {
    assert.equal(CATALOGUE_MAX_PRO, 15_000);
    assert.equal(PLAN_LIMITS.pro.produitsMax, 15_000);
    assert.equal(PLAN_LIMITS.agency.produitsMax, null);
    assert.equal(PLAN_LIMITS.expert.produitsMax, null);
  });

  it("limites par boutique inchangées", () => {
    assert.equal(PLAN_LIMITS.pro.produitsBoutiqueMax, 200);
    assert.equal(PLAN_LIMITS.agency.produitsBoutiqueMax, 200);
    assert.equal(PLAN_LIMITS.expert.produitsBoutiqueMax, null);
  });

  it("Pro : exactement 15 000 produits accessibles, les premiers de l'ordre de référence", () => {
    const borne = borneDepuisListe(CATALOGUE, limitesDuPlan("pro").produitsMax);
    assert.ok(borne);
    assert.ok(CATALOGUE.length > 15_000);
    const accessibles = CATALOGUE.filter((p) => dansLePlafond(p, borne));
    assert.equal(accessibles.length, 15_000);
    const premiers = [...CATALOGUE].sort(comparerOrdreCatalogue).slice(0, 15_000);
    assert.deepEqual(new Set(accessibles.map((p) => p.id)), new Set(premiers.map((p) => p.id)));
  });

  it("Agency et Expert : aucune borne, tout le catalogue reste accessible", async () => {
    for (const plan of ["agency", "expert"] as const) {
      const borne = borneDepuisListe(CATALOGUE, limitesDuPlan(plan).produitsMax);
      assert.equal(borne, null, plan);
      assert.ok(CATALOGUE.every((p) => dansLePlafond(p, borne)), plan);
      // Aucune lecture en base pour un plan sans plafond.
      const sansBase = {} as Parameters<typeof lireBorneCatalogue>[0];
      assert.equal(await lireBorneCatalogue(sansBase, plan), null, plan);
    }
  });

  it("catalogue plus petit que le plafond : pas de borne", () => {
    assert.equal(borneDepuisListe(CATALOGUE.slice(0, 5_000), 15_000), null);
  });
});

describe("plafond du catalogue — ordre stable", () => {
  it("même ordre et même borne quel que soit l'ordre de lecture", () => {
    const a = [...melanger(CATALOGUE, 1)].sort(comparerOrdreCatalogue).map((p) => p.id);
    const b = [...melanger(CATALOGUE, 2)].sort(comparerOrdreCatalogue).map((p) => p.id);
    assert.deepEqual(a, b);
    assert.deepEqual(borneDepuisListe(melanger(CATALOGUE, 3), 15_000), borneDepuisListe(melanger(CATALOGUE, 4), 15_000));
  });

  it("commandes décroissantes, puis id croissant pour les ex æquo", () => {
    const tries = [
      { id: "200000001", commandes: 500 },
      { id: "100000002", commandes: 900 },
      { id: "100000001", commandes: 500 },
      { id: "1000000010", commandes: 500 },
    ].sort(comparerOrdreCatalogue);
    assert.deepEqual(tries.map((p) => p.id), ["100000002", "100000001", "1000000010", "200000001"]);
  });

  it("borne inclusive, ex æquo départagés par l'id", () => {
    const borne = { commandes: 500, id: "150" };
    assert.ok(dansLePlafond({ commandes: 501, id: "999" }, borne));
    assert.ok(dansLePlafond({ commandes: 500, id: "150" }, borne));
    assert.ok(dansLePlafond({ commandes: 500, id: "149" }, borne));
    assert.ok(!dansLePlafond({ commandes: 500, id: "151" }, borne));
    assert.ok(!dansLePlafond({ commandes: 499, id: "100" }, borne));
  });
});

describe("plafond du catalogue — application côté serveur", () => {
  it("filtre PostgREST identique à la règle", () => {
    assert.equal(filtreBorne({ commandes: 500, id: "123" }), 'commandes.gt.500,and(commandes.eq.500,id.lte."123")');
  });

  it("repli sans migration 070 : jamais plus de produits que le plafond", () => {
    const borne = borneDepuisListe(CATALOGUE, 15_000)!;
    const min = commandesMinRepli(null, borne);
    const repli = CATALOGUE.filter((p) => p.commandes >= min);
    assert.ok(repli.length <= 15_000);
    assert.ok(repli.every((p) => dansLePlafond(p, borne)));
    assert.equal(commandesMinRepli(borne.commandes + 500, borne), borne.commandes + 500);
    assert.ok(fonctionSansBorne({ code: "PGRST202" }));
    assert.ok(!fonctionSansBorne({ code: "42501" }));
  });

  it("les routes du catalogue appliquent la borne", () => {
    const produits = lire("app/api/aliexpress/products/route.ts");
    assert.ok(produits.includes("lireBorneCatalogue(supabase, plan)") && produits.includes("parametresBorne(borne)"));
    for (const chemin of ["app/api/catalogue/route.ts", "app/api/boutiques/[id]/suggestions-produits/route.ts"]) {
      const route = lire(chemin);
      assert.ok(route.includes("lireBorneCatalogue(supabase, plan)") && route.includes("filtreBorne(borne)"), chemin);
    }
  });

  it("migration 070 : bornes dans les deux fonctions de rotation", () => {
    const sql = lire("supabase/migrations/070_plafond_catalogue_pro.sql");
    assert.equal(sql.match(/p_borne_commandes\s+integer default null/g)?.length, 2);
    assert.equal(sql.match(/d\.id <= p_borne_id/g)?.length, 2);
  });
});

describe("plafond du catalogue — textes", () => {
  it("nombre formaté selon la langue, à partir de la constante", () => {
    assert.equal(valeursPrix("en").catalogueMax, "15,000");
    assert.equal(valeursPrix("it").catalogueMax, "15.000");
    assert.equal(valeursPrix("fr").catalogueMax.replace(/\s/g, " "), "15 000");
    assert.equal(remplirValeurs("Catalogue de {catalogueMax} produits", valeursPrix("en")), "Catalogue de 15,000 produits");
  });

  it("landing, tarifs et FAQ citent {catalogueMax}, jamais le nombre en dur (4 langues)", () => {
    for (const langue of ["fr", "en", "es", "it"]) {
      const m = JSON.parse(lire(`messages/${langue}.json`));
      const textes = [m.landing.pricing.features.pro[0], m.landing.demo.f4, m.landing.faq.a1, m.faq.questions.differences.pro];
      for (const texte of textes) assert.ok(texte.includes("{catalogueMax}"), `${langue} : ${texte}`);
      assert.doesNotMatch(JSON.stringify(m), /15[ .,  ]?000/, langue);
      assert.ok(m.landing.pricing.features.agency[1].length > 0, langue);
    }
  });
});

describe("catalogue — absence de plancher de commandes", () => {
  it("les produits peu ou pas commandés comptent dans l'ordre et le plafond", () => {
    const petit = [
      { id: "300", commandes: 0 },
      { id: "100", commandes: 12 },
      { id: "200", commandes: 99 },
      { id: "400", commandes: 5_000 },
    ];
    assert.deepEqual([...petit].sort(comparerOrdreCatalogue).map((p) => p.id), ["400", "200", "100", "300"]);
    // Plafond de 3 : la borne tombe sur un produit à 12 commandes, sous l'ancien plancher de 100.
    assert.deepEqual(borneDepuisListe(petit, 3), { id: "100", commandes: 12 });
    // Sans plafond, même un produit à 0 commande est accessible.
    assert.ok(dansLePlafond({ id: "300", commandes: 0 }, borneDepuisListe(petit, null)));
  });

  it("Agency et Expert : les 20 000 produits, y compris ceux de moins de 100 commandes", () => {
    const sousCent = CATALOGUE.filter((p) => p.commandes < 100);
    assert.ok(sousCent.length > 0);
    for (const plan of ["agency", "expert"] as const) {
      const borne = borneDepuisListe(CATALOGUE, limitesDuPlan(plan).produitsMax);
      assert.equal(CATALOGUE.filter((p) => dansLePlafond(p, borne)).length, CATALOGUE.length, plan);
    }
  });

  it("aucun plancher dans le code des routes, du plafond et de la page", () => {
    for (const chemin of [
      "lib/catalogue-commandes.ts",
      "lib/catalogue-plafond.ts",
      "app/api/aliexpress/products/route.ts",
      "app/api/catalogue/route.ts",
      "app/api/catalogue/compte/route.ts",
      "app/produits-gagnants/page.tsx",
    ]) {
      const code = lire(chemin);
      assert.doesNotMatch(code, /COMMANDES_MIN_DEFAUT|commandesMinEffectif|\.gte\("commandes"/, chemin);
    }
  });

  it("migration 070 : aucun plancher, filtre de commandes facultatif", () => {
    const sql = lire("supabase/migrations/070_plafond_catalogue_pro.sql");
    assert.doesNotMatch(sql, /greatest\(coalesce\(p_commandes_min/);
    assert.doesNotMatch(sql, /commandes\s*>=\s*100/);
    assert.equal(sql.match(/\(p_commandes_min is null or d\.commandes\s+>= p_commandes_min\)/g)?.length, 2);
  });

  it("aucun texte n'annonce le plancher (4 langues)", () => {
    for (const langue of ["fr", "en", "es", "it"]) {
      const m = JSON.parse(lire(`messages/${langue}.json`));
      assert.equal(m.dashboard.produits.ordersMinHint, undefined, langue);
    }
  });
});
