import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { apiError } from "@/lib/api-errors";

// Nombre de produits du catalogue accessibles au compte connecté (carte du dashboard). Lu par le
// serveur avec la session de l'utilisateur : le RLS de produits_dedup (migration 057) limite un
// compte Free à sa sélection, et le total est plafonné à produitsMax par cohérence avec la liste.
export async function GET() {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour voir le catalogue.");
  }

  const { count, error } = await supabase.from("produits_dedup").select("id", { count: "exact", head: true });
  if (error) {
    return apiError("server_error", 500, error.message);
  }

  const max = PLAN_LIMITS[plan].produitsMax;
  const total = count ?? 0;
  return NextResponse.json({ count: max !== null ? Math.min(total, max) : total });
}
