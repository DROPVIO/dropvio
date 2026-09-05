import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canViewBoutique } from "@/lib/boutique-access";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = createSupabaseAdminClient();

  const { data: boutiqueRow, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id, nom, slug, description, theme, settings, mentions_legales, est_publique, user_id")
    .eq("slug", slug)
    .maybeSingle();

  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message }, { status: 500 });
  }

  if (!boutiqueRow || !(await canViewBoutique(boutiqueRow.est_publique, boutiqueRow.user_id))) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  const { id, nom, slug: boutiqueSlug, description, theme, settings, mentions_legales } = boutiqueRow;
  const boutique = { id, nom, slug: boutiqueSlug, description, theme, settings, mentions_legales };

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
