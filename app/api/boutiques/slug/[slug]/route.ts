import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = createSupabaseAdminClient();

  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id, nom, slug, description, theme, settings")
    .eq("slug", slug)
    .eq("est_publique", true)
    .maybeSingle();

  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message }, { status: 500 });
  }

  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  const { data: categories, error: categoriesError } = await supabase
    .from("boutique_categories")
    .select("id, nom, slug, position")
    .eq("boutique_id", boutique.id)
    .order("position", { ascending: true });

  if (categoriesError) {
    return NextResponse.json({ error: categoriesError.message }, { status: 500 });
  }

  return NextResponse.json({ boutique, categories: categories ?? [] });
}
