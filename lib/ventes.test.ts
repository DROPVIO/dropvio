// Page « Mes ventes » et notifications : npm test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { VENTES_PAR_PAGE, changementAutorise, clientMasque, lienFournisseur, lireFiltreStatut, nombrePages, plagePage, resumeLignes, venteAffichee } from "./ventes";

const ROW = {
  id: "c1",
  created_at: "2026-11-14T10:00:00Z",
  shopify_order_id: 5001,
  shopify_order_name: "#1042",
  statut: "a_traiter" as const,
  statut_change_le: null,
  lignes: [
    { nom: "Lampe Aurora", quantite: 2, lien_aliexpress: "https://fr.aliexpress.com/item/1005.html" },
    { nom: "Câble USB", quantite: 1, lien_aliexpress: null },
  ],
  adresse_livraison: { first_name: "Camille", last_name: "Durand", address1: "12 rue des Lilas", city: "Lyon", zip: "69003", phone: "+33600000000", name: "Camille Durand" },
  client_nom: "Camille Durand",
};

describe("filtres", () => {
  it("statuts connus acceptés", () => {
    for (const s of ["a_traiter", "commandee", "ignoree"]) assert.equal(lireFiltreStatut(s), s);
  });
  it("absent ou inconnu : aucun filtre", () => {
    for (const s of [null, undefined, "", "livree", "A_TRAITER"]) assert.equal(lireFiltreStatut(s), null);
  });
});

describe("pagination à 50", () => {
  it("50 ventes par page", () => assert.equal(VENTES_PAR_PAGE, 50));
  it("bornes des pages 1, 2 et 3", () => {
    assert.deepEqual(plagePage("1"), { page: 1, from: 0, to: 49 });
    assert.deepEqual(plagePage("2"), { page: 2, from: 50, to: 99 });
    assert.deepEqual(plagePage(3), { page: 3, from: 100, to: 149 });
  });
  it("page invalide → page 1", () => {
    for (const p of [null, "", "0", "-3", "abc"]) assert.equal(plagePage(p).page, 1);
  });
  it("nombre de pages", () => {
    assert.equal(nombrePages(0), 1);
    assert.equal(nombrePages(50), 1);
    assert.equal(nombrePages(51), 2);
    assert.equal(nombrePages(120), 3);
  });
});

describe("changement de statut", () => {
  it("« Marquer commandée » et « Ignorer » depuis « à commander »", () => {
    assert.equal(changementAutorise("a_traiter", "commandee"), true);
    assert.equal(changementAutorise("a_traiter", "ignoree"), true);
  });
  it("on peut ignorer une vente commandée, ou commander une vente ignorée", () => {
    assert.equal(changementAutorise("commandee", "ignoree"), true);
    assert.equal(changementAutorise("ignoree", "commandee"), true);
  });
  it("pas de retour automatique ni de statut inconnu, pas de changement vers le même statut", () => {
    assert.equal(changementAutorise("commandee", "a_traiter"), false);
    assert.equal(changementAutorise("commandee", "commandee"), false);
    assert.equal(changementAutorise("a_traiter", "livree"), false);
  });
});

describe("données personnelles masquées", () => {
  const vente = venteAffichee(ROW);
  it("client : prénom et ville seulement", () => assert.deepEqual(vente.client, { prenom: "Camille", ville: "Lyon" }));
  it("aucune adresse, nom de famille, code postal ni téléphone dans ce qui quitte le serveur", () => {
    const texte = JSON.stringify(vente);
    for (const secret of ["Durand", "12 rue des Lilas", "69003", "+33600000000", "address1", "phone"]) assert.ok(!texte.includes(secret), secret);
  });
  it("sans prénom dans l'adresse : premier mot du nom", () => {
    assert.deepEqual(clientMasque({ city: "Nice" }, "Léa Martin"), { prenom: "Léa", ville: "Nice" });
    assert.deepEqual(clientMasque(null, null), { prenom: null, ville: null });
  });
  it("résumé : premier produit, autres produits, quantité totale", () => {
    assert.deepEqual([vente.produit, vente.autres, vente.quantite, vente.numero], ["Lampe Aurora", 1, 3, "#1042"]);
  });
});

describe("bouton « Ouvrir chez le fournisseur »", () => {
  it("lien AliExpress en https seulement", () => {
    assert.equal(lienFournisseur("https://fr.aliexpress.com/item/1.html"), "https://fr.aliexpress.com/item/1.html");
    assert.equal(lienFournisseur("http://fr.aliexpress.com/item/1.html"), null);
    assert.equal(lienFournisseur("https://aliexpress.com.piege.test/x"), null);
    assert.equal(lienFournisseur("javascript:alert(1)"), null);
  });
  it("premier lien valide des lignes", () => assert.equal(resumeLignes([{ lien_aliexpress: null }, { lien_aliexpress: "https://aliexpress.com/item/2.html" }]).lien, "https://aliexpress.com/item/2.html"));
  it("ne change pas le statut : un simple lien, sans appel à /api/ventes", () => {
    const page = readFileSync(new URL("../app/ventes/page.tsx", import.meta.url), "utf8");
    const lien = page.slice(page.indexOf("href={vente.lienFournisseur}"), page.indexOf("{t(\"ouvrirFournisseur\")}"));
    assert.ok(lien.includes('target="_blank"') && lien.includes("noopener"));
    assert.ok(!/onClick|changerStatut|fetch/.test(lien));
    assert.equal(venteAffichee(ROW).statut, "a_traiter");
  });
});

describe("une seule notification par commande (migration 051)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/051_ventes_notifications.sql", import.meta.url), "utf8");
  it("contrainte unique sur la commande", () => assert.match(sql, /unique \(commande_id\)/));
  it("créée seulement à l'insertion (un upsert rejoué met à jour, sans nouvelle notification)", () => {
    assert.match(sql, /after insert on commandes_a_preparer/);
    assert.doesNotMatch(sql, /after (insert or )?update/);
  });
  it("insertion idempotente et seulement pour une vente « à traiter »", () => {
    assert.match(sql, /on conflict \(commande_id\) do nothing/);
    assert.match(sql, /if new\.statut = 'a_traiter' then/);
  });
  it("e-mail désactivé par défaut", () => assert.match(sql, /notif_email_ventes boolean not null default false/));
});
