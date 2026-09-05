import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; produitId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier ce produit." }, { status: 401 });
  }

  const payload = await request.json();
  const updates = {
    category_id: payload.category_id,
    nom: payload.nom,
    slug: payload.slug,
    description: payload.description,
    image_urls: payload.image_urls,
    prix_vente: payload.prix_vente,
    prix_original: payload.prix_original,
    position: payload.position,
    meta: payload.meta,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("boutique_produits")
    .update(updates)
    .eq("id", params.produitId)
    .select("id")
    .single();

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
