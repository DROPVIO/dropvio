import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { apiError, UNIQUE_VIOLATION } from "@/lib/api-errors";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir les catégories." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("boutique_categories")
    .select("id, nom, slug, position, created_at, updated_at")
    .eq("boutique_id", params.id)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ categories: data ?? [] });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour ajouter une catégorie." }, { status: 401 });
  }

  const { nom, slug, position } = await request.json();
  if (!nom || !slug) {
    return NextResponse.json({ error: "nom et slug sont requis." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("boutique_categories")
    .insert({ boutique_id: params.id, nom, slug, position: position ?? 0 })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return apiError("category_slug_taken", 409, "Une autre catégorie de cette boutique utilise déjà ce slug.");
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
