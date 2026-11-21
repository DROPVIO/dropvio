// Plan qui donne réellement des droits. « expert » sans période payée en cours ne vaut rien : le
// compte est traité comme Free. Même règle que resolvePlan (lib/supabase-server.ts) et que la
// fonction SQL a_un_plan_payant (migration 058). Sans dépendance : utilisable dans le middleware.
export function planEffectif(plan: string | null | undefined, periodeExpertEnCours: boolean): string {
  const p = plan ?? "free";
  if (p === "expert" && !periodeExpertEnCours) return "free";
  return p;
}
