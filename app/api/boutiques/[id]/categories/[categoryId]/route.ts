import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; categoryId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier cette catégorie." }, { status: 401 });
  }

  const { nom, slug, position } = await request.json();
  const updates: Record<string, unknown> = {};
  if (nom) updates.nom = nom;
  if (slug) updates.slug = slug;
  if (typeof position === "number") updates.position = position;
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("boutique_categories")
    .update(updates)
    .eq("id", params.categoryId)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Catégorie introuvable." }, { status: 404 });
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; categoryId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour supprimer cette catégorie." }, { status: 401 });
  }

  const { error } = await supabase
    .from("boutique_categories")
    .delete()
    .eq("id", params.categoryId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
