import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-errors";

// Au plus une page de Produits gagnants à la fois.
const IDS_MAX = 100;

// Croissance des commandes (en %) entre le premier et le dernier relevé quotidien de chaque
// produit (snapshots_produits). Lu par le serveur avec la session de l'utilisateur : le RLS
// (migration 057) ne renvoie que l'historique des produits accessibles à son plan.
export async function GET(request: NextRequest) {
  const { supabase, user } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour voir le catalogue.");
  }

  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && id.length <= 64)
    .slice(0, IDS_MAX);
  if (ids.length === 0) {
    return NextResponse.json({ croissance: {} });
  }

  const { data, error } = await supabase
    .from("snapshots_produits")
    .select("product_id, volume_commandes, date")
    .in("product_id", ids)
    .order("date", { ascending: true });
  if (error) {
    return apiError("server_error", 500, error.message);
  }

  const parProduit: Record<string, number[]> = {};
  for (const ligne of data ?? []) {
    (parProduit[ligne.product_id as string] ??= []).push(Number(ligne.volume_commandes));
  }

  const croissance: Record<string, number> = {};
  for (const [id, volumes] of Object.entries(parProduit)) {
    if (volumes.length < 2) continue;
    const premier = volumes[0];
    const dernier = volumes[volumes.length - 1];
    if (!premier) continue;
    croissance[id] = ((dernier - premier) / premier) * 100;
  }
  return NextResponse.json({ croissance });
}
