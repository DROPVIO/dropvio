import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";

// Seuls les champs envoyés sont modifiés : meta porte aussi l'état de synchronisation Shopify
// (voir lib/shopify.ts, pousserProduitBoutique) et ne doit pas être écrasé par une édition.
const CHAMPS_MODIFIABLES = [
  "category_id",
  "nom",
  "slug",
  "description",
  "image_urls",
  "prix_vente",
  "prix_original",
  "position",
  "meta",
] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; produitId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier ce produit." }, { status: 401 });
  }

  const payload = await request.json();
  const updates: Record<string, unknown> = {};
  for (const champ of CHAMPS_MODIFIABLES) {
    if (payload[champ] !== undefined) updates[champ] = payload[champ];
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("boutique_produits")
    .update(updates)
    .eq("id", params.produitId)
    .eq("boutique_id", params.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; produitId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour supprimer ce produit." }, { status: 401 });
  }

  const { error } = await supabase
    .from("boutique_produits")
    .delete()
    .eq("id", params.produitId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
