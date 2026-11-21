// Pauses par outil : npm test.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CREDITS_PAR_IMAGE, OUTILS_IA, PAUSES_PAR_PLAN, configOutil, planAvecPauses, type ConfigOutil, type OutilIa } from "./pauses-outils";
import { creditsUtilises, deciderReservation, etatOutil, rendreReservation, type UsageOutil } from "./pauses-outils-regles";

const MIN = 60_000;
// 10 crédits par période de 60 min, pause de 30 min, 2 crédits par image : 5 images par période.
const CONFIG: ConfigOutil = { cout: 2, creditsMax: 10, periodeMs: 60 * MIN, pauseMs: 30 * MIN };
const T0 = Date.UTC(2026, 10, 15, 10, 0, 0);

/** Simule le serveur : décision puis enregistrement, comme outils_credits_reserver. */
function reserver(usages: UsageOutil[], config: ConfigOutil | null, maintenant: number) {
  const decision = deciderReservation(config, usages, maintenant);
  if (decision.ok) usages.push({ id: `r${usages.length}`, credits: decision.credits, date: maintenant, declenchePause: decision.declenchePause, rendu: false });
  return decision;
}

describe("réglages validés", () => {
  // Tableau validé : 1 crédit = 1 image, compteur propre à chaque outil.
  const ATTENDU = {
    pro: {
      studio_prompt_libre: { creditsMax: 5, periode: 60, pause: 60 },
      studio_images_produits: { creditsMax: 5, periode: 60, pause: 60 },
      boutique_images_produits: { creditsMax: 10, periode: 60, pause: 120 },
      landing_page: { creditsMax: 6, periode: 60, pause: 60 },
    },
    agency: {
      studio_prompt_libre: { creditsMax: 10, periode: 60, pause: 30 },
      studio_images_produits: { creditsMax: 10, periode: 60, pause: 30 },
      boutique_images_produits: { creditsMax: 20, periode: 60, pause: 60 },
      landing_page: { creditsMax: 9, periode: 60, pause: 30 },
    },
  } as const;

  it("1 crédit par image dans tous les outils", () => {
    for (const outil of OUTILS_IA) assert.equal(CREDITS_PAR_IMAGE[outil], 1, outil);
  });

  it("chaque outil Pro et Agency a exactement les valeurs du tableau", () => {
    for (const plan of ["pro", "agency"] as const) {
      for (const outil of OUTILS_IA) {
        const { creditsMax, periode, pause } = ATTENDU[plan][outil];
        assert.deepEqual(
          configOutil(plan, outil),
          { cout: 1, creditsMax, periodeMs: periode * MIN, pauseMs: pause * MIN },
          `${plan} ${outil}`
        );
      }
    }
  });

  it("Pro studio_prompt_libre : 5 images, puis pause de 60 min", () => {
    const config = configOutil("pro", "studio_prompt_libre");
    const usages: UsageOutil[] = [];
    for (let i = 0; i < 5; i++) assert.equal(reserver(usages, config, T0 + i * MIN).ok, true);
    assert.deepEqual(deciderReservation(config, usages, T0 + 5 * MIN), { ok: false, raison: "pause", finPause: T0 + 4 * MIN + 60 * MIN });
  });

  it("Agency boutique_images_produits : 20 images, puis pause de 60 min", () => {
    const config = configOutil("agency", "boutique_images_produits");
    const usages: UsageOutil[] = [];
    for (let i = 0; i < 20; i++) assert.equal(reserver(usages, config, T0).ok, true);
    assert.deepEqual(deciderReservation(config, usages, T0 + MIN), { ok: false, raison: "pause", finPause: T0 + 60 * MIN });
  });

  it("Expert n'a aucune pause", () => {
    assert.equal(planAvecPauses("expert"), false);
    assert.equal("expert" in PAUSES_PAR_PLAN, false);
  });
});

describe("réglages à définir", () => {
  it("un réglage à null bloque l'outil (« réglages à définir »)", () => {
    const reglages = structuredClone(PAUSES_PAR_PLAN);
    reglages.pro.landing_page = { credits_max: null, periode_minutes: null, pause_minutes: null };
    assert.equal(configOutil("pro", "landing_page", reglages), null);
    assert.deepEqual(etatOutil(configOutil("pro", "landing_page", reglages), [], T0), { statut: "a_definir" });
    assert.deepEqual(deciderReservation(configOutil("pro", "landing_page", reglages), [], T0), { ok: false, raison: "a_definir" });
  });

  it("un seul réglage manquant suffit à bloquer l'outil", () => {
    const reglages = structuredClone(PAUSES_PAR_PLAN);
    reglages.pro.studio_prompt_libre = { credits_max: 10, periode_minutes: 60, pause_minutes: null };
    const couts = { ...CREDITS_PAR_IMAGE, studio_prompt_libre: 2 };
    assert.equal(configOutil("pro", "studio_prompt_libre", reglages, couts), null);
    reglages.pro.studio_prompt_libre.pause_minutes = 30;
    assert.deepEqual(configOutil("pro", "studio_prompt_libre", reglages, couts), CONFIG);
  });

  it("une image plus chère que credits_max : réglage invalide, outil bloqué", () => {
    const reglages = structuredClone(PAUSES_PAR_PLAN);
    reglages.agency.landing_page = { credits_max: 1, periode_minutes: 60, pause_minutes: 30 };
    assert.equal(configOutil("agency", "landing_page", reglages, { ...CREDITS_PAR_IMAGE, landing_page: 2 }), null);
  });
});

describe("décompte", () => {
  it("chaque image réservée décompte son coût de la période", () => {
    const usages: UsageOutil[] = [];
    reserver(usages, CONFIG, T0);
    reserver(usages, CONFIG, T0 + MIN);
    assert.equal(creditsUtilises(usages, CONFIG, T0 + 2 * MIN), 4);
    assert.deepEqual(etatOutil(CONFIG, usages, T0 + 2 * MIN), { statut: "actif", restants: 6, creditsMax: 10, cout: 2, imagesPossibles: 3 });
  });

  it("période glissante : un crédit sorti de la fenêtre ne compte plus", () => {
    const usages: UsageOutil[] = [];
    reserver(usages, CONFIG, T0);
    reserver(usages, CONFIG, T0 + 30 * MIN);
    assert.equal(creditsUtilises(usages, CONFIG, T0 + 59 * MIN), 4);
    assert.equal(creditsUtilises(usages, CONFIG, T0 + 61 * MIN), 2);
  });

  it("credits_max n'est jamais dépassé", () => {
    const usages: UsageOutil[] = [];
    for (let i = 0; i < 20; i++) reserver(usages, CONFIG, T0 + i * 1000);
    assert.equal(creditsUtilises(usages, CONFIG, T0 + 30_000), 10);
  });
});

describe("calcul de la pause", () => {
  it("la réservation qui atteint credits_max déclenche la pause, à sa date", () => {
    const usages: UsageOutil[] = [];
    for (let i = 0; i < 4; i++) assert.equal(reserver(usages, CONFIG, T0 + i * MIN).ok, true);
    const cinquieme = reserver(usages, CONFIG, T0 + 10 * MIN);
    assert.deepEqual(cinquieme, { ok: true, credits: 2, declenchePause: true, restantsApres: 0, finPause: T0 + 40 * MIN });
    assert.deepEqual(deciderReservation(CONFIG, usages, T0 + 11 * MIN), { ok: false, raison: "pause", finPause: T0 + 40 * MIN });
  });

  it("coût non divisible : la pause part de la dernière image possible", () => {
    const config: ConfigOutil = { ...CONFIG, cout: 3 }; // 10 crédits : 3 images, 1 crédit inutilisable
    const usages: UsageOutil[] = [];
    reserver(usages, config, T0);
    reserver(usages, config, T0 + MIN);
    const troisieme = reserver(usages, config, T0 + 2 * MIN);
    assert.equal(troisieme.ok && troisieme.declenchePause, true);
    assert.equal(etatOutil(config, usages, T0 + 3 * MIN).statut, "pause");
  });
});

describe("fin de pause", () => {
  it("à la fin de la pause, l'outil repart avec une période neuve", () => {
    const usages: UsageOutil[] = [];
    for (let i = 0; i < 5; i++) reserver(usages, CONFIG, T0 + i * MIN); // pause de T0+4 à T0+34
    assert.equal(etatOutil(CONFIG, usages, T0 + 34 * MIN - 1).statut, "pause");
    // Les crédits d'avant la pause sont encore dans la fenêtre de 60 min, mais ne comptent plus.
    assert.deepEqual(etatOutil(CONFIG, usages, T0 + 34 * MIN), { statut: "actif", restants: 10, creditsMax: 10, cout: 2, imagesPossibles: 5 });
    assert.equal(reserver(usages, CONFIG, T0 + 35 * MIN).ok, true);
  });
});

describe("remboursement sur échec", () => {
  it("une réservation rendue ne compte plus", () => {
    let usages: UsageOutil[] = [];
    reserver(usages, CONFIG, T0);
    reserver(usages, CONFIG, T0 + MIN);
    usages = rendreReservation(usages, "r1");
    assert.equal(creditsUtilises(usages, CONFIG, T0 + 2 * MIN), 2);
  });

  it("rendre la réservation qui avait déclenché la pause lève la pause", () => {
    let usages: UsageOutil[] = [];
    for (let i = 0; i < 5; i++) reserver(usages, CONFIG, T0 + i * MIN);
    assert.equal(etatOutil(CONFIG, usages, T0 + 5 * MIN).statut, "pause");
    usages = rendreReservation(usages, "r4");
    assert.deepEqual(etatOutil(CONFIG, usages, T0 + 5 * MIN), { statut: "actif", restants: 2, creditsMax: 10, cout: 2, imagesPossibles: 1 });
  });
});

describe("indépendance entre outils", () => {
  it("la pause d'un outil ne bloque pas les autres", () => {
    // Un journal par outil, comme la table d'usage filtrée par (utilisateur, outil).
    const journaux: Record<OutilIa, UsageOutil[]> = {
      studio_prompt_libre: [],
      studio_images_produits: [],
      boutique_images_produits: [],
      landing_page: [],
    };
    for (let i = 0; i < 5; i++) reserver(journaux.boutique_images_produits, CONFIG, T0 + i * 1000);
    assert.equal(etatOutil(CONFIG, journaux.boutique_images_produits, T0 + MIN).statut, "pause");
    for (const outil of ["studio_prompt_libre", "studio_images_produits", "landing_page"] as const) {
      assert.equal(reserver(journaux[outil], CONFIG, T0 + MIN).ok, true, outil);
    }
  });
});
