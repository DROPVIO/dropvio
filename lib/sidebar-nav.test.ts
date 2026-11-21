// Sous-menus de la barre latérale : npm test.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GROUPES_NAV, basculerGroupe, groupeDeLaRoute, ouvertAuChargement, sousEntreeActive } from "./sidebar-nav";

describe("ouverture et fermeture", () => {
  it("un clic ouvre un sous-menu fermé", () => assert.equal(basculerGroupe(null, "site-builder"), "site-builder"));
  it("un second clic le referme", () => assert.equal(basculerGroupe("site-builder", "site-builder"), null));
});

describe("un seul sous-menu ouvert à la fois", () => {
  it("ouvrir un autre sous-menu ferme le premier", () => {
    assert.equal(basculerGroupe("produits-gagnants", "site-builder"), "site-builder");
    assert.equal(basculerGroupe("site-builder", "produits-gagnants"), "produits-gagnants");
  });
});

describe("sous-entrée active au chargement", () => {
  const cas: [string, string | null][] = [
    ["/mes-sites", "site-builder"],
    ["/site-builder", "site-builder"],
    ["/site-builder/boutique/abc", "site-builder"],
    ["/produits-gagnants", "produits-gagnants"],
    ["/dashboard", null],
    ["/studio", null],
    ["/site-builder-x", null],
  ];
  for (const [route, attendu] of cas) {
    it(`${route} → ${attendu ?? "aucun"} ouvert`, () => assert.equal(ouvertAuChargement(route), attendu));
  }

  it("la sous-entrée la plus précise est active", () => {
    assert.equal(sousEntreeActive("/site-builder/boutique/abc", GROUPES_NAV["site-builder"])?.href, "/site-builder");
    assert.equal(sousEntreeActive("/mes-sites", GROUPES_NAV["site-builder"])?.href, "/mes-sites");
  });

  it("la page Catalogue et ses fiches activent « Catalogue », pas « Tous les produits »", () => {
    assert.equal(sousEntreeActive("/produits-gagnants/catalogue", GROUPES_NAV["produits-gagnants"])?.href, "/produits-gagnants/catalogue");
    assert.equal(sousEntreeActive("/produits-gagnants/catalogue/123", GROUPES_NAV["produits-gagnants"])?.href, "/produits-gagnants/catalogue");
    assert.equal(groupeDeLaRoute("/produits-gagnants/catalogue"), "produits-gagnants");
  });

  it("une entrée « bientôt » n'est jamais active", () => {
    const enfants = [{ href: "/a", labelKey: "a" }, { href: "/a/b", labelKey: "b", soon: true }];
    assert.equal(sousEntreeActive("/a/b", enfants)?.href, "/a");
  });
});
