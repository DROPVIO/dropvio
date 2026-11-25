import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { limitesDuPlan } from "@/lib/plan-limits";
import { COMMANDES_MIN_DEFAUT } from "@/lib/catalogue-commandes";
import { apiError, reponseAbonnementRequis, erreurServeur } from "@/lib/api-errors";

// Nombre de produits du catalogue accessibles au compte connecté (carte du dashboard). Lu par le
// serveur avec la session de l'utilisateur : le RLS de produits_dedup (migration 057) limite un
// catalogue aux comptes abonnés. Même périmètre que la liste : produits d'au moins
// COMMANDES_MIN_DEFAUT commandes (les seuls affichés), total plafonné à produitsMax (Pro).
export async function GET() {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connectez-vous pour voir le catalogue.");
  }
  if (plan === null) return reponseAbonnementRequis();

  const { count, error } = await supabase.from("produits_dedup").select("id", { count: "exact", head: true })
    .gte("commandes", COMMANDES_MIN_DEFAUT);
  if (error) {
    return erreurServeur("api/catalogue/compte", error);
  }

  const max = limitesDuPlan(plan).produitsMax;
  const total = count ?? 0;
  return NextResponse.json({ count: max !== null ? Math.min(total, max) : total });
}
