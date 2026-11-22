// Budget IA par tokens (génération de landing pages) : npm test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BudgetIaDepasse, SuiviBudgetIa, coutImagesEuros, decisionBudget, getBudgetParFonction, getBudgetUsedEuros, getImagesUsedEuros, reponseBudgetDepasse, tokensSortieEquivalents } from "./ai-budget";
import { coutEuros, PRIX_EUR_PAR_MILLION } from "./ai-pricing";
import { AI_BUDGET_EUR_PAR_PLAN, IMAGE_BUDGET_EUR_PAR_PLAN, budgetImagesEur } from "./plan-limits";
import { IMAGE_PRICE_EUR } from "./expert-pricing";
import { lireQuotaImages } from "./media/quota-images-serveur";

/** Client Supabase factice : chaque lecture renvoie `lignes`, chaque appel est noté. */
function fauxSupabase(lignes: Record<string, unknown>[] = []) {
  const appels: string[] = [];
  const requete = (table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "gte", "order", "update", "upsert"]) q[m] = () => q;
    q.maybeSingle = async () => ({ data: null, error: null });
    q.insert = async () => {
      appels.push(`insert:${table}`);
      return { error: null };
    };
    q.then = (ok: (v: unknown) => unknown) => ok({ data: lignes, error: null });
    return q;
  };
  const client = {
    from: (table: string) => {
      appels.push(`from:${table}`);
      return requete(table);
    },
  } as unknown as SupabaseClient;
  return { client, appels };
}

describe("coût à partir des tokens réellement consommés", () => {
  it("tarifs du modèle (configuration lib/ai-pricing.ts), entrée et sortie", () => {
    const p = PRIX_EUR_PAR_MILLION["claude-sonnet-5-5"];
    assert.equal(coutEuros("claude-sonnet-5-5", 1_000_000, 0), p.entree);
    assert.equal(coutEuros("claude-sonnet-5-5", 0, 1_000_000), p.sortie);
    assert.ok(Math.abs(coutEuros("claude-sonnet-5-5", 1_000_000, 100_000) - (p.entree + p.sortie / 10)) < 1e-9);
  });

  it("le suivi additionne l'usage renvoyé par l'API, cache compris", () => {
    const { client } = fauxSupabase();
    const suivi = new SuiviBudgetIa(client, "u1", "pro", "site_builder", { ecriture: client });
    suivi.ajouter("claude-sonnet-5-5", { input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 400, cache_read_input_tokens: 1000 });
    // Entrée équivalente : 1000 + 400 × 1,25 + 1000 × 0,1 = 1600 tokens.
    assert.ok(Math.abs(suivi.coutEngageEuros - coutEuros("claude-sonnet-5-5", 1600, 2000)) < 1e-12);
    assert.deepEqual(suivi.tokensReels, { entree: 1000, sortie: 2000, cacheEcriture: 400, cacheLecture: 1000 });
  });

  it("tokens équivalents au budget restant (indication affichée)", () => {
    assert.equal(tokensSortieEquivalents(PRIX_EUR_PAR_MILLION["claude-sonnet-5-5"].sortie, "claude-sonnet-5-5"), 1_000_000);
    assert.equal(tokensSortieEquivalents(-1, "claude-sonnet-5-5"), 0);
  });
});

describe("refus quand le budget est insuffisant", () => {
  it("décision : l'estimation doit tenir dans le budget restant", () => {
    assert.deepEqual(decisionBudget(6, 5, 0, 0.5), { ok: true, restantEuros: 1 });
    assert.equal(decisionBudget(6, 5, 0.6, 0.5).ok, false);
    assert.equal(decisionBudget(6, 7, 0, 0.01).restantEuros, 0);
  });

  it("avant la génération, l'estimation est refusée et le budget restant est renvoyé", async () => {
    // Génération de sites : 5,90 € utilisés sur les 6 € du budget IA du plan Pro.
    const tokensSortie = (5.9 * 1_000_000) / PRIX_EUR_PAR_MILLION["claude-sonnet-5-5"].sortie;
    const { client } = fauxSupabase([{ feature: "site_builder", compteur: 0, tokens_entree: 0, tokens_sortie: tokensSortie }]);
    const suivi = new SuiviBudgetIa(client, "u1", "pro", "site_builder", { ecriture: client });
    await assert.rejects(suivi.verifier(0.2), (err: unknown) => {
      assert.ok(err instanceof BudgetIaDepasse);
      assert.ok(Math.abs(err.restantEuros - 0.1) < 1e-6);
      return true;
    });
    await suivi.verifier(0.05); // tient dans les 0,10 € restants
  });

  it("message : « insuffisant » avec le reste, ou « épuisé » quand il ne reste rien", async () => {
    const insuffisant = await reponseBudgetDepasse(new BudgetIaDepasse(5.9, 6, 0.2)).json();
    assert.equal(insuffisant.code, "budget_ia_insuffisant");
    assert.equal(insuffisant.values.restant, 0.1);
    const epuise = await reponseBudgetDepasse(new BudgetIaDepasse(6, 6, 0.2)).json();
    assert.equal(epuise.code, "budget_ia_depasse");
    assert.equal(epuise.error, "Ton budget IA du mois est épuisé. Il sera remis à zéro le 1er du mois prochain.");
  });
});

describe("remboursement après échec", () => {
  it("abandonner() rend le coût : rien n'est enregistré ensuite", async () => {
    const { client, appels } = fauxSupabase();
    const suivi = new SuiviBudgetIa(client, "u1", "pro", "site_builder", { ecriture: client });
    suivi.ajouter("claude-sonnet-5-5", { input_tokens: 5000, output_tokens: 20000 });
    const rendu = suivi.abandonner();
    assert.ok(rendu > 0);
    assert.equal(suivi.coutEngageEuros, 0);
    await suivi.enregistrer();
    assert.deepEqual(appels, []);
  });

  it("en cas de succès, la consommation réelle est bien enregistrée", async () => {
    const { client, appels } = fauxSupabase();
    const suivi = new SuiviBudgetIa(client, "u1", "pro", "site_builder", { ecriture: client });
    suivi.ajouter("claude-sonnet-5-5", { input_tokens: 5000, output_tokens: 20000 });
    await suivi.enregistrer();
    assert.ok(appels.includes("insert:usage_ia_journal"));
    assert.ok(appels.includes("from:usage_mensuel"));
  });

  it("la route de génération abandonne le coût quand la génération échoue", () => {
    const route = readFileSync(new URL("../app/api/generate-site/route.ts", import.meta.url), "utf-8");
    assert.equal((route.match(/if \(!reussie\) suivi\.abandonner\(\);/g) ?? []).length, 2);
  });
});

describe("aucun blocage lié au nombre de sites", () => {
  it("ni la génération ni la sauvegarde ne vérifient un plafond de sites", () => {
    for (const fichier of ["../app/api/generate-site/route.ts", "../app/api/sites-generes/route.ts"]) {
      const source = readFileSync(new URL(fichier, import.meta.url), "utf-8");
      assert.ok(!source.includes("sitesParMoisMax"), fichier);
      assert.ok(!source.includes("sites_limit"), fichier);
    }
  });

  it("le nombre de sites est informatif (sans plafond) pour Pro et Agency", () => {
    const usage = readFileSync(new URL("../app/api/usage/route.ts", import.meta.url), "utf-8");
    assert.ok(usage.includes(`const maxSites = plan === "expert" ? await limiteSitesExpert(supabase, user.id) : null;`));
    assert.ok(usage.includes(`informatif: plan !== "expert"`));
  });
});

describe("budget images séparé du budget IA", () => {
  it("valeurs : 1,50 € (Pro) et 3,50 € (Agency) pour les images ; budget IA inchangé (6 € et 28 €)", () => {
    assert.equal(IMAGE_BUDGET_EUR_PAR_PLAN.pro, 1.5);
    assert.equal(IMAGE_BUDGET_EUR_PAR_PLAN.agency, 3.5);
    assert.equal(budgetImagesEur(null), 0);
    assert.equal(AI_BUDGET_EUR_PAR_PLAN.pro, 6);
    assert.equal(AI_BUDGET_EUR_PAR_PLAN.agency, 28);
  });

  it("les images ne sont jamais comptées dans le budget IA", async () => {
    const { client } = fauxSupabase([
      { feature: "images_ia", compteur: 12, tokens_entree: 0, tokens_sortie: 0 },
      { feature: "site_builder", compteur: 0, tokens_entree: 0, tokens_sortie: 100_000 },
    ]);
    const parFonction = await getBudgetParFonction(client, "u1");
    assert.equal(parFonction.images_ia, undefined);
    assert.ok(Math.abs((await getBudgetUsedEuros(client, "u1")) - coutEuros("claude-sonnet-5-5", 0, 100_000)) < 1e-12);
  });

  it("le budget images ne compte que les images, au prix de l'image", async () => {
    const { client } = fauxSupabase([
      { feature: "images_ia", compteur: 12, tokens_entree: 0, tokens_sortie: 0 },
      { feature: "site_builder", compteur: 0, tokens_entree: 500_000, tokens_sortie: 500_000 },
    ]);
    assert.ok(Math.abs((await getImagesUsedEuros(client, "u1")) - 12 * IMAGE_PRICE_EUR) < 1e-12);
    assert.equal(coutImagesEuros(-3), 0);
  });

  it("budget IA épuisé par les textes et sites : les images restent possibles (Pro)", async () => {
    // 9 € de génération de site (> 6 €) et 10 images (1,00 € sur 1,50 €).
    const tokens = (9 * 1_000_000) / PRIX_EUR_PAR_MILLION["claude-sonnet-5-5"].sortie;
    const { client } = fauxSupabase([
      { feature: "site_builder", compteur: 0, tokens_entree: 0, tokens_sortie: tokens },
      { feature: "images_ia", compteur: 10, tokens_entree: 0, tokens_sortie: 0 },
    ]);
    const suivi = new SuiviBudgetIa(client, "u1", "pro", "site_builder", { ecriture: client });
    await assert.rejects(suivi.verifier(0.01), BudgetIaDepasse);
    const quota = await lireQuotaImages(client, "u1", "pro");
    assert.equal(quota?.source, "budget");
    assert.equal(quota?.imagesRestantes, 5);
  });

  it("budget images épuisé : le budget IA reste entier pour les textes, sites et audits (Agency)", async () => {
    // 35 images à 0,10 € = 3,50 € : tout le budget images Agency.
    const { client } = fauxSupabase([{ feature: "images_ia", compteur: 35, tokens_entree: 0, tokens_sortie: 0 }]);
    assert.equal((await lireQuotaImages(client, "u1", "agency"))?.imagesRestantes, 0);
    const suivi = new SuiviBudgetIa(client, "u1", "agency", "site_builder", { ecriture: client });
    await suivi.verifier(27.99);
  });

  it("deux messages distincts selon le budget épuisé", async () => {
    const ia = await reponseBudgetDepasse(new BudgetIaDepasse(6, 6, 0.2)).json();
    assert.equal(ia.code, "budget_ia_depasse");
    assert.ok(ia.error.startsWith("Ton budget IA du mois est épuisé."));
    const route = readFileSync(new URL("../app/api/media/generer/route.ts", import.meta.url), "utf-8");
    assert.ok(route.includes(`apiError("images_quota_epuise"`));
    const messages = JSON.parse(readFileSync(new URL("../messages/fr.json", import.meta.url), "utf-8"));
    assert.ok(messages.apiErrors.images_quota_epuise.startsWith("Ton budget d'images du mois est épuisé."));
    assert.ok(messages.apiErrors.budget_ia_depasse.startsWith("Ton budget IA du mois est épuisé."));
  });

  it("une image ne s'écrit pas dans le journal des limites glissantes du budget IA", () => {
    const route = readFileSync(new URL("../app/api/media/generer/route.ts", import.meta.url), "utf-8");
    assert.ok(!route.includes("journaliserImageBudget"));
  });
});
