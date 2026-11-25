import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DUREE_FRAICHEUR_MS,
  abonner,
  chargerCache,
  instantane,
  invaliderCache,
  modifierCache,
  remettreCache,
  viderCache,
} from "./cache-client";

function compteur<T>(valeur: T) {
  let appels = 0;
  return {
    charger: async () => {
      appels += 1;
      return valeur;
    },
    get appels() {
      return appels;
    },
  };
}

describe("cache client — données déjà lues", () => {
  beforeEach(() => viderCache());

  it("au retour sur une page, aucune nouvelle requête tant que la donnée est fraîche", async () => {
    let maintenant = 1_000;
    const horloge = () => maintenant;
    const c = compteur({ n: 1 });
    await chargerCache("/api/x", c.charger, { maintenant: horloge });
    maintenant += DUREE_FRAICHEUR_MS - 1;
    assert.deepEqual(await chargerCache("/api/x", c.charger, { maintenant: horloge }), { n: 1 });
    assert.equal(c.appels, 1);
  });

  it("donnée ancienne : toujours affichée pendant la relecture en arrière-plan", async () => {
    let maintenant = 1_000;
    const horloge = () => maintenant;
    await chargerCache("/api/x", async () => "v1", { maintenant: horloge });
    maintenant += DUREE_FRAICHEUR_MS + 1;
    let resoudre!: (v: string) => void;
    const promesse = chargerCache("/api/x", () => new Promise<string>((r) => (resoudre = r)), { maintenant: horloge });
    assert.equal(instantane("/api/x")?.donnees, "v1");
    assert.equal(instantane("/api/x")?.enCours, true);
    resoudre("v2");
    await promesse;
    assert.equal(instantane("/api/x")?.donnees, "v2");
  });

  it("une seule requête à la fois par clé", async () => {
    const c = compteur("v");
    await Promise.all([chargerCache("/api/y", c.charger), chargerCache("/api/y", c.charger), chargerCache("/api/y", c.charger)]);
    assert.equal(c.appels, 1);
  });

  it("erreur gardée dans l'entrée, sans effacer les données affichées", async () => {
    await chargerCache("/api/z", async () => "ok");
    await chargerCache("/api/z", async () => Promise.reject(new Error("réseau")), { force: true });
    assert.equal(instantane("/api/z")?.donnees, "ok");
    assert.ok(instantane("/api/z")?.erreur instanceof Error);
  });
});

describe("cache client — mise à jour optimiste", () => {
  beforeEach(() => viderCache());

  it("modification immédiate, retour à l'état précédent si l'envoi échoue", async () => {
    await chargerCache("/api/liste", async () => ({ items: ["a", "b"] }));
    const precedent = modifierCache<{ items: string[] }>("/api/liste", (d) => ({ items: d.items.filter((x) => x !== "a") }));
    assert.deepEqual(instantane("/api/liste")?.donnees, { items: ["b"] });
    remettreCache("/api/liste", precedent!);
    assert.deepEqual(instantane("/api/liste")?.donnees, { items: ["a", "b"] });
  });

  it("les abonnés (pages affichées) sont prévenus de chaque changement", async () => {
    let notifications = 0;
    const desabonner = abonner("/api/n", () => (notifications += 1));
    await chargerCache("/api/n", async () => 1);
    modifierCache<number>("/api/n", (n) => n + 1);
    desabonner();
    modifierCache<number>("/api/n", (n) => n + 1);
    assert.equal(notifications, 3); // en cours, chargée, modifiée
  });

  it("invalider : la donnée reste affichée mais sera relue", async () => {
    const c = compteur("v");
    await chargerCache("/api/sites", c.charger);
    invaliderCache("/api/sites");
    assert.equal(instantane("/api/sites")?.donnees, "v");
    await chargerCache("/api/sites", c.charger);
    assert.equal(c.appels, 2);
  });

  it("vidé à la déconnexion", async () => {
    await chargerCache("/api/prive", async () => "secret");
    viderCache();
    assert.equal(instantane("/api/prive"), undefined);
  });
});
