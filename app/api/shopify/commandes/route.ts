import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const LOOKBACK_DAYS = 30;

// Liste les commandes à préparer côté AliExpress (v1 "assist manuel", voir
// commandes_a_preparer). Même garde-fou que /api/shopify/incidents : la table n'a aucune
// policy RLS pour authenticated (elle porte de la PII client), accès service role
// uniquement, toujours filtré explicitement par user_id.
export async function GET() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

  const { data, error } = await admin
    .from("commandes_a_preparer")
    .select(
      "id, shopify_order_id, shopify_order_name, statut, adresse_livraison, client_nom, client_telephone, lignes, created_at"
    )
    .eq("user_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ commandes: data ?? [], lookbackDays: LOOKBACK_DAYS });
}

// Le marchand confirme avoir traité la commande côté AliExpress (ou l'écarte). Aucun achat
// n'est déclenché depuis dropvio — ce PATCH ne fait que déplacer le statut de suivi.
export async function PATCH(request: NextRequest) {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const statut = body?.statut;
  if (typeof id !== "string" || (statut !== "commandee" && statut !== "ignoree")) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("commandes_a_preparer")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
