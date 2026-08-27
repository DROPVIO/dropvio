import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOOKBACK_DAYS = 90;

// Liste détaillée des remboursements/retours/litiges — /api/shopify/status ne renvoie que
// des compteurs 30j pour la carte résumé du dashboard, cette route alimente la vue
// détaillée (/dashboard/shopify). Même garde-fou que status : shopify_incidents n'a aucune
// policy RLS pour authenticated (voir 019_shopify_incidents.sql), accès service role
// uniquement, toujours filtré explicitement par user_id.
export async function GET() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

  const { data, error } = await admin
    .from("shopify_incidents")
    .select("id, shopify_order_id, type, statut, montant, devise, created_at")
    .eq("user_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ incidents: data ?? [], lookbackDays: LOOKBACK_DAYS });
}
