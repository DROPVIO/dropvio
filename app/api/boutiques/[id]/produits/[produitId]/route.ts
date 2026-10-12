import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { getShopifyConnection, isShopifyConfigured, lireMetaShopify, retirerDeCollection } from "@/lib/shopify";

// Seuls les champs envoyés sont modifiés : meta porte aussi l'état de synchronisation Shopify
// (voir lib/shopify.ts, pousserProduitBoutique) et ne doit pas être écrasé par une édition.
const CHAMPS_MODIFIABLES = [
  "category_id",
  "nom",
  "slug",
  "description",
  "image_urls",
  "prix_vente",
  "prix_original",
  "position",
  "meta",
] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; produitId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier ce produit." }, { status: 401 });
  }

  const payload = await request.json();
  const updates: Record<string, unknown> = {};
  for (const champ of CHAMPS_MODIFIABLES) {
    if (payload[champ] !== undefined) updates[champ] = payload[champ];
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("boutique_produits")
    .update(updates)
    .eq("id", params.produitId)
    .eq("boutique_id", params.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  }

  return NextResponse.json({ id: data.id });
}

// Le produit poussé sur Shopify est retiré de sa collection (best-effort : une erreur Shopify
// n'empêche jamais la suppression côté Dropvio). Il reste dans le catalogue Shopify, où il
// peut avoir des commandes : à archiver ou supprimer depuis l'admin Shopify si besoin.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string; produitId: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour supprimer ce produit." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("boutique_produits")
    .delete()
    .eq("id", params.produitId)
    .eq("boutique_id", params.id)
    .select("shopify_product_id, meta");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Produit introuvable." }, { status: 404 });
  }

  const { shopify_product_id: shopifyProductId, meta } = data[0];
  const collectionId = lireMetaShopify(meta).shopifyCollectionId;
  if (shopifyProductId && collectionId && isShopifyConfigured()) {
    try {
      const connection = await getShopifyConnection(user.id);
      if (connection) {
        await retirerDeCollection(connection.shop_domain, connection.access_token, shopifyProductId, collectionId);
      }
    } catch (err) {
      console.warn("[boutiques] Retrait de la collection Shopify échoué :", err);
    }
  }

  return NextResponse.json({ success: true });
}
