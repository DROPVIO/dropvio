// Vérifie le budget IA mensuel (lib/ai-budget.ts) sans base ni appel Anthropic : un faux
// client Supabase renvoie une consommation du mois qui vaut 5,90 € pour un utilisateur Pro
// (budget 6 €). Un appel estimé à 0,20 € doit être refusé, un appel à 0,05 € accepté.
// Usage : npx tsx scripts/tester-budget-ia.ts (code de sortie 1 en cas d'échec).
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertBudgetDisponible, BudgetIaDepasse, getBudgetUsedEuros, SuiviBudgetIa } from "../lib/ai-budget";
import { coutEuros, PRIX_EUR_PAR_MILLION } from "../lib/ai-pricing";
import { AI_BUDGET_EUR_PAR_PLAN } from "../lib/plan-limits";

// 5,90 € répartis sur deux fonctions de modèles différents :
// - site_builder (claude-sonnet-5-5) : 1,90 € ;
// - audit_ia (claude-sonnet-4-6) : 4,00 €.
const tokensPour = (euros: number, prixParMillion: number) => (euros / prixParMillion) * 1_000_000;
const lignes = [
  { feature: "site_builder", tokens_entree: 0, tokens_sortie: tokensPour(1.9, PRIX_EUR_PAR_MILLION["claude-sonnet-5-5"].sortie) },
  { feature: "audit_ia", tokens_entree: tokensPour(4, PRIX_EUR_PAR_MILLION["claude-sonnet-4-6"].entree), tokens_sortie: 0 },
];

// Faux client : from(...).select(...).eq(...).eq(...) se résout en { data, error }.
function fauxSupabase(): SupabaseClient {
  const requete = {
    select: () => requete,
    eq: () => requete,
    then: (resoudre: (v: { data: typeof lignes; error: null }) => void) => resoudre({ data: lignes, error: null }),
  };
  return { from: () => requete } as unknown as SupabaseClient;
}

let echecs = 0;
function verifier(condition: boolean, message: string) {
  console.log(`${condition ? "OK " : "ÉCHEC"} ${message}`);
  if (!condition) echecs++;
}

async function accepte(cout: number): Promise<boolean> {
  try {
    await assertBudgetDisponible(fauxSupabase(), "utilisateur-test", "pro", cout);
    return true;
  } catch (err) {
    if (err instanceof BudgetIaDepasse) return false;
    throw err;
  }
}

async function main() {
  const utilise = await getBudgetUsedEuros(fauxSupabase(), "utilisateur-test");
  verifier(Math.abs(utilise - 5.9) < 1e-6, `consommation du mois = ${utilise.toFixed(4)} € (attendu 5,90 €)`);
  verifier(AI_BUDGET_EUR_PAR_PLAN.pro === 6, "budget Pro = 6 €");
  verifier(!(await accepte(0.2)), "appel estimé à 0,20 € refusé (5,90 + 0,20 > 6)");
  verifier(await accepte(0.05), "appel estimé à 0,05 € accepté (5,90 + 0,05 ≤ 6)");

  // Consommation déjà engagée dans la même requête (appels en plusieurs lots) : prise en compte.
  const suivi = new SuiviBudgetIa(fauxSupabase(), "utilisateur-test", "pro", "boutique_ia");
  suivi.ajouter("claude-opus-5-5", { input_tokens: 0, output_tokens: 2_000 }); // 0,036 €
  let refuse = false;
  try {
    await suivi.verifier(0.08);
  } catch (err) {
    refuse = err instanceof BudgetIaDepasse;
  }
  verifier(refuse, "0,08 € refusé après 0,036 € déjà consommé dans la requête (5,936 + 0,08 > 6)");

  // Relais vers un modèle plus cher : converti au même coût.
  const relais = new SuiviBudgetIa(fauxSupabase(), "utilisateur-test", "pro", "boutique_ia");
  relais.ajouter("claude-opus-4-8", { input_tokens: 1_000, output_tokens: 1_000 });
  const attendu = coutEuros("claude-opus-4-8", 1_000, 1_000);
  verifier(Math.abs(relais.coutEngageEuros - attendu) < 1e-4, `relais claude-opus-4-8 compté à ${relais.coutEngageEuros.toFixed(4)} € (attendu ${attendu.toFixed(4)} €)`);

  if (echecs > 0) {
    console.error(`${echecs} vérification(s) en échec.`);
    process.exit(1);
  }
  console.log("Budget IA : toutes les vérifications passent.");
}

main();
