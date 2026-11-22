import { estPlan, type PlanOuAucun } from "./plan-limits";

// Plan qui donne réellement des droits. « expert » sans période payée en cours ne vaut rien ;
// null, undefined ou une valeur inconnue non plus : le compte n'a alors aucun abonnement. Même
// règle que resolvePlan (lib/supabase-server.ts) et que la fonction SQL a_un_plan_payant
// (migration 058). Sans dépendance serveur : utilisable dans le proxy.
export function planEffectif(plan: string | null | undefined, periodeExpertEnCours: boolean): PlanOuAucun {
  if (!estPlan(plan)) return null;
  if (plan === "expert" && !periodeExpertEnCours) return null;
  return plan;
}
