import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir cette boutique." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("boutiques")
    .select("id, nom, slug, description, theme, settings, est_publique, created_at, updated_at")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  return NextResponse.json({ boutique: data });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier cette boutique." }, { status: 401 });
  }

  const payload = await request.json();
  const updates = {
    nom: payload.nom,
    slug: payload.slug,
    description: payload.description,
    theme: payload.theme,
    settings: payload.settings,
    est_publique: payload.est_publique,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("boutiques")
    .update(updates)
    .eq("id", params.id)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour supprimer cette boutique." }, { status: 401 });
  }

  const { error } = await supabase
    .from("boutiques")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
