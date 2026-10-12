import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { apiError, UNIQUE_VIOLATION } from "@/lib/api-errors";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; categoryId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier cette catégorie.", code: "auth_required" }, { status: 401 });
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
    .eq("boutique_id", params.id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return apiError("category_slug_taken", 409, "Une autre catégorie de cette boutique utilise déjà ce slug.");
    }
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  if (!data) {
    return apiError("category_not_found", 404, "Catégorie introuvable.");
  }

  return NextResponse.json({ id: data.id });
}

// Les produits de la catégorie restent dans la boutique, sans catégorie. Détachés ici
// explicitement, sans attendre la clé on delete set null de la migration 041.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; categoryId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour supprimer cette catégorie.", code: "auth_required" }, { status: 401 });
  }

  const { error: detachErr } = await supabase
    .from("boutique_produits")
    .update({ category_id: null, updated_at: new Date().toISOString() })
    .eq("boutique_id", params.id)
    .eq("category_id", params.categoryId);
  if (detachErr) {
    return NextResponse.json({ error: detachErr.message, code: "server_error" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("boutique_categories")
    .delete()
    .eq("id", params.categoryId)
    .eq("boutique_id", params.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return apiError("category_not_found", 404, "Catégorie introuvable.");
  }

  return NextResponse.json({ success: true });
}
