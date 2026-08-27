import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel } from "@/lib/plan-limits";

const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir les produits." }, { status: 401 });
  }

  const categorieId = searchParams.get("categoryId");
  const search = searchParams.get("search");

  let query = supabase
    .from("boutique_produits")
    .select("*, boutique_categories(nom, slug)", { count: "exact" })
    .eq("boutique_id", params.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  if (categorieId) {
    query = query.eq("category_id", categorieId);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let products = data ?? [];
  if (search) {
    const normalized = search.toLowerCase();
    products = products.filter((product) =>
      product.nom.toLowerCase().includes(normalized) ||
      (product.description ?? "").toLowerCase().includes(normalized)
    );
  }

  const actualTotal = search ? products.length : count ?? 0;
  return NextResponse.json({ products, total: actualTotal, page, limit, totalPages: Math.max(1, Math.ceil(actualTotal / limit)) });

  return NextResponse.json({ products: data ?? [], total: count ?? 0, page, limit, totalPages: Math.max(1, Math.ceil((count ?? 0) / limit)) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user, plan } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour ajouter un produit." }, { status: 401 });
  }

  const payload = await request.json();
  const { nom, slug, description, image_urls, prix_vente, prix_original, stock, stock_status, category_id, source_produit_id, meta } = payload;

  if (!nom || !slug || typeof prix_vente !== "number") {
    return NextResponse.json({ error: "nom, slug et prix_vente sont requis." }, { status: 400 });
  }

  const { count, error: countError } = await supabase
    .from("boutique_produits")
    .select("id", { count: "exact", head: true })
    .eq("boutique_id", params.id);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const max = PLAN_LIMITS[plan].produitsBoutiqueMax;
  if (max !== null && (count ?? 0) >= max) {
    return NextResponse.json(
      {
        error: `Tu as atteint la limite de ${max} produits sur le plan ${planLabel(plan)}. Passe Pro ou Agency pour gérer jusqu'à 200 produits par boutique.`,
      },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("boutique_produits")
    .insert({
      boutique_id: params.id,
      category_id,
      source_produit_id,
      nom,
      slug,
      description,
      image_urls: image_urls ?? [],
      prix_vente,
      prix_original,
      stock: stock ?? 0,
      stock_status: stock_status ?? "in_stock",
      position: 0,
      meta: meta ?? {},
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
