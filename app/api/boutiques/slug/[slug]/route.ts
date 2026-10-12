import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canViewBoutique } from "@/lib/boutique-access";
import { avecRepliLangue, langueBoutique } from "@/lib/boutique-langue";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const supabase = createSupabaseAdminClient();

  const colonnes = "id, nom, slug, description, theme, settings, mentions_legales, est_publique, user_id";
  const { data: ligne, error: boutiqueError } = await avecRepliLangue((avecLangue) =>
    supabase
      .from("boutiques")
      .select(avecLangue ? `${colonnes}, langue` : colonnes)
      .eq("slug", slug)
      .maybeSingle()
  );
  const boutiqueRow = ligne as unknown as {
    id: string;
    nom: string;
    slug: string;
    description: string | null;
    theme: string | null;
    settings: Record<string, unknown> | null;
    mentions_legales: string | null;
    est_publique: boolean;
    user_id: string;
    langue?: unknown;
  } | null;

  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message, code: "server_error" }, { status: 500 });
  }

  if (!boutiqueRow || !(await canViewBoutique(boutiqueRow.est_publique, boutiqueRow.user_id))) {
    return NextResponse.json({ error: "Boutique introuvable.", code: "boutique_not_found" }, { status: 404 });
  }

  const { id, nom, slug: boutiqueSlug, description, theme, settings, mentions_legales } = boutiqueRow;
  const boutique = {
    id,
    nom,
    slug: boutiqueSlug,
    description,
    theme,
    settings,
    mentions_legales,
    est_publique: boutiqueRow.est_publique,
    langue: langueBoutique(boutiqueRow),
  };

  const { data: categories, error: categoriesError } = await supabase
    .from("boutique_categories")
    .select("id, nom, slug, position")
    .eq("boutique_id", boutique.id)
    .order("position", { ascending: true });

  if (categoriesError) {
    return NextResponse.json({ error: categoriesError.message, code: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ boutique, categories: categories ?? [] });
}
