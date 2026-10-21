import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, planSuperieurProduitsBoutique } from "@/lib/plan-limits";
import { apiError } from "@/lib/api-errors";
import { motifRecherche } from "@/lib/recherche";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
  );
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { supabase, user } = await getServerUserPlanOnly();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir les produits.", code: "auth_required" }, { status: 401 });
  }

  const categorieId = searchParams.get("categoryId");
  const search = searchParams.get("search")?.trim();

  // Filtres appliqués dans la requête, avant range() : total et pages portent sur les
  // résultats filtrés, pas sur la seule page courante.
  let query = supabase
    .from("boutique_produits")
    .select("*, boutique_categories(nom, slug)", { count: "exact" })
    .eq("boutique_id", params.id);

  if (categorieId) {
    query = query.eq("category_id", categorieId);
  }
  if (search) {
    const motif = motifRecherche(search);
    query = query.or(`nom.ilike.${motif},description.ilike.${motif}`);
  }

  const { data, error, count } = await query
    .order("position", { ascending: true })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }

  const total = count ?? 0;
  return NextResponse.json({
    products: data ?? [],
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour ajouter un produit.", code: "auth_required" }, { status: 401 });
  }

  const payload = await request.json();
  const { nom, slug, description, image_urls, prix_vente, prix_original, category_id, source_produit_id, meta } = payload;
  // Présents seulement après un import AliExpress (colonnes de la migration 036) : jamais
  // envoyés pour une fiche créée à la main.
  const aliexpress =
    typeof payload.aliexpress_product_id === "string" && /^\d{6,}$/.test(payload.aliexpress_product_id)
      ? {
          aliexpress_product_id: payload.aliexpress_product_id,
          lien_aliexpress: `https://www.aliexpress.com/item/${payload.aliexpress_product_id}.html`,
          prix_achat:
            typeof payload.prix_achat === "number" && Number.isFinite(payload.prix_achat) && payload.prix_achat >= 0
              ? payload.prix_achat
              : null,
        }
      : {};

  if (!nom || !slug || typeof prix_vente !== "number") {
    return NextResponse.json({ error: "nom, slug et prix_vente sont requis.", code: "product_fields_required" }, { status: 400 });
  }

  const { count, error: countError } = await supabase
    .from("boutique_produits")
    .select("id", { count: "exact", head: true })
    .eq("boutique_id", params.id);

  if (countError) {
    return NextResponse.json({ error: countError.message, code: "server_error" }, { status: 500 });
  }

  const max = PLAN_LIMITS[plan].produitsBoutiqueMax;
  if (max !== null && (count ?? 0) >= max) {
    const superieur = planSuperieurProduitsBoutique(plan);
    if (superieur) {
      const maxSuperieur = PLAN_LIMITS[superieur].produitsBoutiqueMax;
      return apiError(
        "boutique_product_limit_upgrade",
        403,
        `Tu as atteint la limite de ${max} produits du plan ${planLabel(plan)}. Passe au plan ${planLabel(superieur)} pour aller jusqu'à ${maxSuperieur ?? "∞"} produits par boutique.`,
        { values: { max, plan: planLabel(plan), planSuperieur: planLabel(superieur), maxSuperieur: maxSuperieur ?? "∞" } }
      );
    }
    return apiError(
      "boutique_product_limit_max",
      403,
      `Tu as atteint la limite maximale de ${max} produits par boutique.`,
      { values: { max } }
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
      position: 0,
      meta: meta ?? {},
      ...aliexpress,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
