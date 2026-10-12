import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canViewBoutique } from "@/lib/boutique-access";

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string; produitId: string }> }) {
  const { slug, produitId } = await context.params;
  const supabase = createSupabaseAdminClient();

  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id, est_publique, user_id")
    .eq("slug", slug)
    .maybeSingle();

  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message, code: "server_error" }, { status: 500 });
  }

  if (!boutique || !(await canViewBoutique(boutique.est_publique, boutique.user_id))) {
    return NextResponse.json({ error: "Boutique introuvable.", code: "boutique_not_found" }, { status: 404 });
  }

  const { data: produit, error } = await supabase
    .from("boutique_produits")
    .select("*, boutique_categories(nom, slug)")
    .eq("id", produitId)
    .eq("boutique_id", boutique.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }

  if (!produit) {
    return NextResponse.json({ error: "Produit introuvable.", code: "product_not_found" }, { status: 404 });
  }

  return NextResponse.json({ produit });
}
