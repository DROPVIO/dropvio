// Tests de lib/expert-pricing.ts : npm test (node:test exécuté par tsx).
// Les attentes sont dérivées des constantes PLACEHOLDER, pour rester valables quand elles seront fixées.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { expertLignes, parseExpertMetadata } from "./expert-billing";
import { AGENCY_PRICE_EUR } from "./plan-limits";
import { CLAUDE_MODELS } from "./claude-models";
import {
  ENVELOPPE_TOKENS_MOIS,
  SITES_ENVELOPPE_EXPERT,
  EXPERT_BASE_EUR,
  EXPERT_MODELE_DEFAUT,
  EXPERT_MEDIAS_EN_VENTE,
  EXPERT_MODELS,
  IMAGE_PRICE_EUR,
  MARGE_PAR_MILLION_TOKENS_EUR,
  RATIO_ENTREE_SORTIE,
  TAUX_USD_EUR,
  coutMoyenParMillionEur,
  lignesRecapExpert,
  SUPPLEMENT_BASE_EUR,
  TOKENS_PAR_SITE_FABLE,
  TOKENS_PAR_SITE_OPUS,
  calculerPrixExpert,
  changerModele,
  expertPrice,
  expertRechargePrice,
  isSelectionVendable,
  parseExpertSelection,
  plafondSites,
  siteUnitPriceEur,
  type ExpertModel,
  type ExpertSelection,
} from "./expert-pricing";

const centimes = (n: number) => Math.round(n * 100);
const MODELES = Object.keys(EXPERT_MODELS) as ExpertModel[];
const sel = (model: ExpertModel, sites: number, images = 0): ExpertSelection => ({ model, sites, images });

describe("enveloppe de tokens et plafond de sites", () => {
  it("enveloppe = 50 sites Opus (figée, indépendante du quota Agency)", () => {
    assert.equal(SITES_ENVELOPPE_EXPERT, 50);
    assert.equal(ENVELOPPE_TOKENS_MOIS, SITES_ENVELOPPE_EXPERT * TOKENS_PAR_SITE_OPUS);
  });

  it("plafond Opus = floor(enveloppe / tokens par site Opus), soit 50 sites", () => {
    assert.equal(plafondSites("opus-5-5"), Math.floor(ENVELOPPE_TOKENS_MOIS / TOKENS_PAR_SITE_OPUS));
    assert.equal(plafondSites("opus-5-5"), SITES_ENVELOPPE_EXPERT);
  });

  it("plafond Fable = floor(enveloppe / tokens par site Fable)", () => {
    assert.equal(plafondSites("fable-5"), Math.floor(ENVELOPPE_TOKENS_MOIS / TOKENS_PAR_SITE_FABLE));
  });

  it(
    "plafond Fable différent du plafond Opus",
    { skip: TOKENS_PAR_SITE_FABLE === TOKENS_PAR_SITE_OPUS ? "TOKENS_PAR_SITE_FABLE [À CONFIRMER] vaut encore la même valeur qu'Opus" : false },
    () => {
      assert.notEqual(plafondSites("fable-5"), plafondSites("opus-5-5"));
    },
  );

  it("le modèle par défaut est Opus", () => {
    assert.equal(EXPERT_MODELE_DEFAUT, "opus-5-5");
  });
});

describe("recalage du curseur de sites au changement de modèle", () => {
  it("Opus → Fable : le plafond Opus est ramené dans le plafond Fable", () => {
    const s = changerModele(sel("opus-5-5", plafondSites("opus-5-5")), "fable-5");
    assert.equal(s.model, "fable-5");
    assert.equal(s.sites, Math.min(plafondSites("opus-5-5"), plafondSites("fable-5")));
  });

  it("Fable → Opus : le plafond Fable est ramené dans le plafond Opus", () => {
    const s = changerModele(sel("fable-5", plafondSites("fable-5")), "opus-5-5");
    assert.equal(s.model, "opus-5-5");
    assert.equal(s.sites, Math.min(plafondSites("fable-5"), plafondSites("opus-5-5")));
  });

  it("jamais de valeur hors plage, quel que soit le point de départ", () => {
    for (const depart of MODELES) {
      for (const arrivee of MODELES) {
        for (const sites of [-5, 0, 1, 17, 1_000_000, Number.NaN]) {
          const s = changerModele(sel(depart, sites), arrivee);
          assert.ok(s.sites >= 0 && s.sites <= plafondSites(arrivee), `${depart} → ${arrivee}, ${sites} sites : ${s.sites}`);
        }
      }
    }
  });

  it("une quantité sous les deux plafonds est conservée", () => {
    const n = Math.min(plafondSites("opus-5-5"), plafondSites("fable-5")) - 1;
    assert.equal(changerModele(changerModele(sel("opus-5-5", n), "fable-5"), "opus-5-5").sites, n);
  });
});

describe("prix", () => {
  it("base = prix Agency + supplément Expert", () => {
    assert.equal(EXPERT_BASE_EUR, AGENCY_PRICE_EUR + SUPPLEMENT_BASE_EUR);
    const { detail } = calculerPrixExpert(sel("opus-5-5", 12));
    assert.equal(detail.agency, AGENCY_PRICE_EUR);
    assert.equal(detail.supplement, SUPPLEMENT_BASE_EUR);
  });

  it("total mensuel = somme des lignes Stripe (expertLignes) pour les mêmes valeurs", () => {
    for (const model of MODELES) {
      for (const sites of [1, 7, plafondSites(model)]) {
        for (const images of [0, 30]) {
          const s = sel(model, sites, images);
          const stripe = expertLignes(s).reduce((somme, l) => somme + l.unitAmount * l.quantity, 0);
          assert.equal(centimes(calculerPrixExpert(s).total), stripe, `${model} ${sites} sites`);
          assert.equal(centimes(calculerPrixExpert(s).total), centimes(expertPrice(s).total));
        }
      }
    }
  });

  it("total mensuel = base + supplément + sites + images, au centime", () => {
    const { detail, total } = calculerPrixExpert(sel("opus-5-5", 12, 30));
    const attendu =
      centimes(AGENCY_PRICE_EUR) + centimes(SUPPLEMENT_BASE_EUR) +
      12 * centimes(siteUnitPriceEur("opus-5-5")) + 30 * centimes(IMAGE_PRICE_EUR);
    assert.equal(centimes(total), attendu);
    assert.equal(centimes(total), centimes(detail.agency + detail.supplement + detail.sites + detail.images));
  });

  it("recharge : pour un nombre de sites donné, total = sites × prix unitaire, sans base", () => {
    for (const model of MODELES) {
      for (let sites = 1; sites <= plafondSites(model); sites++) {
        const { detail, total } = calculerPrixExpert(sel(model, sites), "recharge");
        assert.equal(detail.agency + detail.supplement, 0);
        assert.equal(centimes(total), sites * centimes(siteUnitPriceEur(model)));
        assert.equal(total, expertRechargePrice(sel(model, sites)).total);
        // Même filtrage que createExpertRechargeSession : lignes Stripe sans la base.
        const stripe = expertLignes(sel(model, sites)).filter((l) => l.key !== "base").reduce((somme, l) => somme + l.unitAmount * l.quantity, 0);
        assert.equal(centimes(total), stripe);
      }
    }
  });

  it("recharge : le total ne dépend pas d'un aller-retour de modèle", () => {
    const avant = calculerPrixExpert(sel("opus-5-5", 20), "recharge").total;
    const apres = calculerPrixExpert(changerModele(changerModele(sel("opus-5-5", 20), "fable-5"), "opus-5-5"), "recharge").total;
    assert.equal(apres, avant);
  });
});

describe("validation des ventes et des abonnements existants", () => {
  it("nouvelle vente : au-delà de l'enveloppe, refusée", () => {
    for (const model of MODELES) {
      assert.equal(isSelectionVendable(sel(model, plafondSites(model))), true);
      assert.equal(isSelectionVendable(sel(model, plafondSites(model) + 1)), false);
    }
  });

  it("webhook : un abonnement souscrit avec l'ancien plafond reste relisible", () => {
    for (const model of MODELES) {
      const ancien = EXPERT_MODELS[model].ancienPlafondSites;
      assert.deepEqual(parseExpertSelection(sel(model, ancien)), sel(model, ancien));
      // Les metadata des abonnements existants contiennent encore une clé « videos » : ignorée.
      const meta = parseExpertMetadata({ plan: "expert", user_id: "u", model, sites: String(ancien), images: "0", videos: "0" });
      assert.equal(meta?.selection.sites, ancien);
    }
  });

  it("parseExpertSelection refuse toujours les valeurs invalides", () => {
    for (const bad of [sel("opus-5-5", -1), sel("opus-5-5", 2.5), sel("opus-5-5", 10_000), { model: "gpt", sites: 1, images: 0 }]) {
      assert.equal(parseExpertSelection(bad), null);
    }
  });
});

describe("Fable 5.2 et prix par site", () => {
  it("l'offre Fable appelle claude-fable-5-2, la clé en base reste « fable-5 »", () => {
    assert.equal(CLAUDE_MODELS.fable, "claude-fable-5-2");
    assert.equal(EXPERT_MODELS["fable-5"].apiId, "claude-fable-5-2");
    assert.equal(EXPERT_MODELS["fable-5"].label, "Claude Fable 5.2");
  });

  it("tarifs : Fable 5.2 à 8 $ / 40 $, Opus 5.5 à 4 $ / 20 $, taux 0,92, ratio 3", () => {
    assert.deepEqual([EXPERT_MODELS["fable-5"].inputUsdParMillion, EXPERT_MODELS["fable-5"].outputUsdParMillion], [8, 40]);
    assert.deepEqual([EXPERT_MODELS["opus-5-5"].inputUsdParMillion, EXPERT_MODELS["opus-5-5"].outputUsdParMillion], [4, 20]);
    assert.equal(TAUX_USD_EUR, 0.92);
    assert.equal(RATIO_ENTREE_SORTIE, 3);
  });

  it("coût moyen par million avec RATIO = 3 : Opus 7,36 €, Fable 14,72 €", () => {
    assert.ok(Math.abs(coutMoyenParMillionEur("opus-5-5") - 7.36) < 1e-9);
    assert.ok(Math.abs(coutMoyenParMillionEur("fable-5") - 14.72) < 1e-9);
  });

  it("prix d'un site à 1 000 000 tokens : Opus 7,86 €, Fable 15,22 €", () => {
    assert.equal(TOKENS_PAR_SITE_OPUS, 1_000_000);
    assert.equal(TOKENS_PAR_SITE_FABLE, 1_000_000);
    assert.equal(siteUnitPriceEur("opus-5-5"), 7.86);
    assert.equal(siteUnitPriceEur("fable-5"), 15.22);
  });

  it("la marge de 0,50 € par million de tokens est ajoutée au coût réel", () => {
    assert.equal(MARGE_PAR_MILLION_TOKENS_EUR, 0.5);
    for (const model of ["opus-5-5", "fable-5"] as const) {
      assert.equal(Math.round((siteUnitPriceEur(model) - coutMoyenParMillionEur(model)) * 100) / 100, 0.5);
    }
  });
});

describe("ligne Images du récapitulatif", () => {
  const s = sel("opus-5-5", 10, 30);
  it("drapeau actif : ligne Images présente, au prix unitaire des images", () => {
    const images = lignesRecapExpert(s, "abonnement", true).find((l) => l.cle === "images");
    assert.deepEqual(images, { cle: "images", montant: Math.round(30 * IMAGE_PRICE_EUR * 100) / 100, quantite: 30 });
  });
  it("drapeau inactif : pas de ligne Images", () => {
    assert.equal(lignesRecapExpert(s, "abonnement", false).some((l) => l.cle === "images"), false);
  });
  it("valeur actuelle du drapeau respectée par défaut", () => {
    assert.equal(lignesRecapExpert(s).some((l) => l.cle === "images"), EXPERT_MEDIAS_EN_VENTE);
  });
  it("recharge : pas de ligne Agency", () => {
    assert.deepEqual(lignesRecapExpert(s, "recharge", false).map((l) => l.cle), ["sites"]);
  });
});
