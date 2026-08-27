import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string; produitId: string }> }) {
  const { slug, produitId } = await context.params;
  const supabase = createSupabaseAdminClient();

  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id")
    .eq("slug", slug)
    .eq("est_publique", true)
    .maybeSingle();

  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message }, { status: 500 });
  }

  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  const { data: produit, error } = await supabase
    .from("boutique_produits")
    .select("*, boutique_categories(nom, slug)")
    .eq("id", produitId)
    .eq("boutique_id", boutique.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!produit) {
    return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  }

  return NextResponse.json({ produit });
}
