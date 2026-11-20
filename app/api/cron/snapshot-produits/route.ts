import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { CATALOGUE_FREE } from "@/lib/plan-limits";

const PAGE_SIZE = 1000;

// Vercel Cron appelle cette route avec `Authorization: Bearer $CRON_SECRET` (voir vercel.json).
function isAuthorized(request: NextRequest, secret: string): boolean {
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/snapshot-produits] CRON_SECRET non configuré — requête refusée.");
    return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 500 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const supabase = createSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  let from = 0;
  let total = 0;

  try {
    while (true) {
      const { data: produits, error } = await supabase
        .from("produits")
        .select("id, prixVente, commandes")
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error("Erreur lecture produits:", error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      if (!produits || produits.length === 0) break;

      const snapshots = produits.map((p) => ({
        product_id: p.id,
        prix: p.prixVente,
        volume_commandes: p.commandes,
        date: today,
      }));

      const { error: upsertError } = await supabase
        .from("snapshots_produits")
        .upsert(snapshots, { onConflict: "product_id,date" });

      if (upsertError) {
        console.error("Erreur upsert snapshots:", upsertError.message);
        return NextResponse.json({ error: upsertError.message }, { status: 500 });
      }

      total += produits.length;
      if (produits.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Sélection du catalogue Free (migration 057) recalculée sur le catalogue du jour, avec les
    // réglages de lib/plan-limits.ts. Best-effort : un échec n'annule pas les relevés.
    const { data: catalogueFree, error: freeError } = await supabase.rpc("catalogue_free_rafraichir", {
      p_niches: CATALOGUE_FREE.niches,
      p_par_niche: CATALOGUE_FREE.produitsParNiche,
    });
    if (freeError) console.error("Erreur sélection catalogue Free (migration 057 appliquée ?) :", freeError.message);

    return NextResponse.json({ ok: true, date: today, snapshots: total, catalogueFree: freeError ? null : catalogueFree });
  } catch (err) {
    console.error("Erreur cron snapshot-produits:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
