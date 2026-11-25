import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CARACTERES_ATTENDUS_SITE,
  INTERVALLE_MAJ_MS,
  INTERVALLE_SONDAGE_MS,
  SEUIL_INDICATEUR_MS,
  SEUIL_PROGRESSION_MS,
  avancementCreation,
  partAffichee,
  phaseChargement,
  secondesRestantes,
  texteRestant,
} from "./chargement";

describe("chargement — seuils selon le temps d'attente", () => {
  it("0 à 1 s : aucun indicateur", () => {
    assert.equal(SEUIL_INDICATEUR_MS, 1_000);
    for (const ms of [0, 500, 999]) assert.equal(phaseChargement(ms), "aucun", String(ms));
  });

  it("1 à 10 s : squelette", () => {
    assert.equal(SEUIL_PROGRESSION_MS, 10_000);
    for (const ms of [1_000, 4_000, 9_999]) assert.equal(phaseChargement(ms), "squelette", String(ms));
  });

  it("au-delà de 10 s : barre de progression", () => {
    for (const ms of [10_000, 30_000, 120_000]) assert.equal(phaseChargement(ms), "progression", String(ms));
  });

  it("mise à jour au moins une fois par seconde ; sondage de la création toutes les 1 à 2 s", () => {
    assert.ok(INTERVALLE_MAJ_MS <= 1_000);
    assert.ok(INTERVALLE_SONDAGE_MS >= 1_000 && INTERVALLE_SONDAGE_MS <= 2_000);
  });
});

describe("chargement — temps restant estimé", () => {
  it("vitesse moyenne constatée : 40 % en 20 s → 30 s restantes", () => {
    assert.equal(secondesRestantes(20_000, { fait: 40, total: 100 }), 30);
  });

  it("estimation non fiable → null (« encore quelques secondes »)", () => {
    assert.equal(secondesRestantes(20_000, null), null); // aucun avancement mesuré
    assert.equal(secondesRestantes(3_000, { fait: 40, total: 100 }), null); // moins de 5 s de mesure
    assert.equal(secondesRestantes(20_000, { fait: 5, total: 100 }), null); // moins de 10 %
    assert.equal(secondesRestantes(20_000, { fait: 95, total: 100 }), null); // plus de 90 %
    assert.equal(secondesRestantes(400_000, { fait: 10, total: 100 }), null); // plus de 10 min
    assert.deepEqual(texteRestant(null), { cle: "quelquesSecondes" });
  });

  it("texte en secondes, puis en minutes", () => {
    assert.deepEqual(texteRestant(42), { cle: "restantSecondes", valeurs: { secondes: 42 } });
    assert.deepEqual(texteRestant(61), { cle: "restantMinutes", valeurs: { minutes: 2 } });
  });

  it("barre : avancement mesuré plafonné à 95 %, sinon courbe lente sous 90 %", () => {
    assert.equal(partAffichee(20_000, { fait: 50, total: 100 }), 0.5);
    assert.equal(partAffichee(20_000, { fait: 200, total: 100 }), 0.95);
    assert.equal(partAffichee(10_000, null), 0);
    const tard = partAffichee(600_000, null);
    assert.ok(tard > 0.85 && tard < 0.9);
    assert.ok(partAffichee(20_000, null) < partAffichee(40_000, null));
  });
});

describe("chargement — avancement réel de la création de site", () => {
  it("rédaction : caractères reçus, jusqu'à 90 % ; gabarits puis fin", () => {
    assert.deepEqual(avancementCreation("preparation", 0), { fait: 0, total: CARACTERES_ATTENDUS_SITE });
    assert.equal(avancementCreation("redaction", 30_000).fait, 30_000);
    assert.equal(avancementCreation("relance", 10 ** 6).fait, CARACTERES_ATTENDUS_SITE * 0.9);
    assert.ok(avancementCreation("gabarits", 0).fait > CARACTERES_ATTENDUS_SITE * 0.9);
    assert.equal(avancementCreation("termine", 0).fait, CARACTERES_ATTENDUS_SITE);
  });
});
