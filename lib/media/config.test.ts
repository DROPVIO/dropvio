// Table de configuration des médias (lib/media/config.ts) : npm test.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type { Plan } from "@/lib/plan-limits";
import { FOURNISSEURS, MEDIA_PAR_PLAN, generationDisponible, mentionGenerateur, reglageMedia } from "./config";
import { GENERATEURS_IMAGE, MediaProviderNotConfiguredError, generateImage } from "./index";

const PLANS = Object.keys(MEDIA_PAR_PLAN) as Plan[];
const fetchOrigine = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOrigine;
  delete process.env.OPENAI_API_KEY;
});

describe("générateur d'images et inclusion par plan", () => {
  it("OpenAI pour les plans payants (Pro, Agency, Expert), aucun générateur sans plan payant", () => {
    for (const plan of ["pro", "agency", "expert"] as Plan[]) {
      assert.deepEqual(reglageMedia(plan), { generateur: "openai", inclus: null }, plan);
      assert.equal(generationDisponible(plan), true, plan);
    }
    assert.deepEqual(reglageMedia("free"), { generateur: null, inclus: null });
    assert.equal(generationDisponible("free"), false);
  });

  it("inclusion non décidée : null partout, donc aucune mention « inclus » ni « facturé »", () => {
    for (const plan of PLANS) assert.equal(reglageMedia(plan).inclus, null, plan);
  });
});

describe("la mention affichée correspond au fournisseur appelé", () => {
  it("chaque fournisseur d'image de la table a une implémentation", () => {
    for (const plan of PLANS) {
      const { generateur } = reglageMedia(plan);
      if (generateur) assert.equal(typeof GENERATEURS_IMAGE[generateur], "function");
    }
  });

  it("le domaine réellement appelé est celui du fournisseur nommé dans la mention", async () => {
    for (const plan of PLANS) {
      const mention = mentionGenerateur(plan);
      if (!mention) {
        assert.throws(() => generateImage(plan, "test"), MediaProviderNotConfiguredError, plan);
        continue;
      }
      const appels: string[] = [];
      process.env.OPENAI_API_KEY = "sk-test";
      globalThis.fetch = (async (url: string | URL) => {
        appels.push(new URL(String(url)).hostname);
        return new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }] }), { status: 200 });
      }) as typeof fetch;

      await generateImage(plan, "Studio product photo");
      const fournisseur = reglageMedia(plan).generateur!;
      assert.deepEqual(appels, [FOURNISSEURS[fournisseur].domaine], plan);
      assert.equal(mention.fournisseur, FOURNISSEURS[fournisseur].libelle, plan);
    }
  });

  it("OpenAI n'est nommé que là où OpenAI est appelé", () => {
    for (const plan of PLANS) {
      const mention = mentionGenerateur(plan);
      if (mention?.fournisseur === FOURNISSEURS.openai.libelle) assert.equal(reglageMedia(plan).generateur, "openai");
    }
  });
});
