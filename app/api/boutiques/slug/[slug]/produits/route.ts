import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { canViewBoutique } from "@/lib/boutique-access";

const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search")?.trim() ?? "";

  const supabase = createSupabaseAdminClient();
  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id, est_publique, user_id")
    .eq("slug", slug)
    .maybeSingle();

  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message }, { status: 500 });
  }

  if (!boutique || !(await canViewBoutique(boutique.est_publique, boutique.user_id))) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  // Bestsellers = triés par produits.commandes (nombre de commandes fournisseur, la seule
  // donnée de popularité disponible aujourd'hui), via boutique_produits.source_produit_id.
  // Tri fait en JS après coup plutôt qu'en SQL : PostgREST n'ordonne pas nativement sur une
  // colonne d'une table jointe via .order(). Si aucun produit n'a de commandes connues
  // (import manuel, jamais lié au catalogue), renvoie une liste vide plutôt que de désigner
  // arbitrairement des "bestsellers" sans donnée réelle derrière.
  if (searchParams.get("bestsellers") === "1") {
    const { data: withSource, error: bestsellersError } = await supabase
      .from("boutique_produits")
      .select("*, boutique_categories(nom, slug), produits(commandes)")
      .eq("boutique_id", boutique.id);

    if (bestsellersError) {
      return NextResponse.json({ error: bestsellersError.message }, { status: 500 });
    }

    const bestsellers = (withSource ?? [])
      .filter((p) => typeof p.produits?.commandes === "number")
      .sort((a, b) => b.produits.commandes - a.produits.commandes)
      .slice(0, 3);

    return NextResponse.json({ products: bestsellers, total: bestsellers.length, page: 1, limit: 3, totalPages: 1 });
  }

  let query = supabase
    .from("boutique_produits")
    .select("*, boutique_categories(nom, slug)", { count: "exact" })
    .eq("boutique_id", boutique.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (search) {
    query = query.or(`nom.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? (data?.length ?? 0);
  return NextResponse.json({ products: data ?? [], total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}
