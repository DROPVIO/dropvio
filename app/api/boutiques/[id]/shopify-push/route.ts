import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import {
  isShopifyConfigured,
  getShopifyConnection,
  shopifyFetch,
  produitToShopifyPayload,
  categoryToShopifyPayload,
  ShopifyApiError,
  shopifyErrorToHttpStatus,
  type BoutiqueProduitRow,
  type BoutiqueCategoryRow,
} from "@/lib/shopify";

type ItemResult = { id: string; nom: string; status: "created" | "updated" | "error"; error?: string };

function errMessage(err: unknown): string {
  if (err instanceof ShopifyApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Erreur inconnue";
}

// Pousse les catégories (-> custom collections) et produits (-> products) d'une
// boutique dropvio vers la boutique Shopify connectée. Idempotent : une catégorie/
// produit déjà poussé (shopify_collection_id / shopify_product_id renseigné) est mis à
// jour plutôt que recréé. Les erreurs par item n'interrompent pas le push global (un
// produit avec une image cassée ne doit pas bloquer les 50 autres) — seule une erreur
// d'authentification Shopify (token expiré/révoqué) arrête tout net, puisque toutes les
// requêtes suivantes échoueraient de toute façon.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, user, plan } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour publier cette boutique sur Shopify." }, { status: 401 });
  }

  // Restriction plan free — même règle que sites-generes/[id]/shopify-push : publier une
  // boutique entière sur Shopify est un export réel, réservé aux plans Pro/Agency. Vérifié
  // ici même si l'UI masque déjà l'action, pour ne jamais dépendre uniquement du frontend.
  if (plan === "free") {
    return NextResponse.json(
      { error: "La publication sur Shopify est réservée aux plans Pro et Agency. Passe au plan Pro pour publier cette boutique." },
      { status: 403 }
    );
  }

  if (!isShopifyConfigured()) {
    return NextResponse.json(
      { error: "L'intégration Shopify n'est pas encore configurée côté serveur." },
      { status: 500 }
    );
  }

  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id, nom")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message }, { status: 500 });
  }
  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  const connection = await getShopifyConnection(user.id);
  if (!connection) {
    return NextResponse.json(
      { error: "Connecte d'abord ta boutique Shopify dans les paramètres avant de pousser tes produits." },
      { status: 400 }
    );
  }

  const [{ data: categories, error: categoriesError }, { data: produits, error: produitsError }] = await Promise.all([
    supabase.from("boutique_categories").select("id, nom, shopify_collection_id").eq("boutique_id", id),
    supabase
      .from("boutique_produits")
      .select("id, nom, description, image_urls, prix_vente, prix_original, category_id, shopify_product_id")
      .eq("boutique_id", id),
  ]);
  if (categoriesError) return NextResponse.json({ error: categoriesError.message }, { status: 500 });
  if (produitsError) return NextResponse.json({ error: produitsError.message }, { status: 500 });

  async function markConnectionDead(err: ShopifyApiError) {
    await supabase
      .from("boutiques")
      .update({
        shopify_last_push_at: new Date().toISOString(),
        shopify_last_push_status: "error",
        shopify_last_push_error: err.message,
      })
      .eq("id", id);
    return NextResponse.json({ error: err.message, code: err.code }, { status: shopifyErrorToHttpStatus(err) });
  }

  const categoryResults: ItemResult[] = [];
  const collectionIdByCategoryId = new Map<string, number>();

  for (const cat of (categories ?? []) as BoutiqueCategoryRow[] & { id: string }[]) {
    try {
      let collectionId = cat.shopify_collection_id;
      const payload = categoryToShopifyPayload(cat);
      if (collectionId) {
        await shopifyFetch(connection.shop_domain, connection.access_token, `/custom_collections/${collectionId}.json`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        categoryResults.push({ id: cat.id, nom: cat.nom, status: "updated" });
      } else {
        const res = await shopifyFetch<{ custom_collection: { id: number } }>(
          connection.shop_domain,
          connection.access_token,
          "/custom_collections.json",
          { method: "POST", body: JSON.stringify(payload) }
        );
        collectionId = res.custom_collection.id;
        await supabase.from("boutique_categories").update({ shopify_collection_id: collectionId }).eq("id", cat.id);
        categoryResults.push({ id: cat.id, nom: cat.nom, status: "created" });
      }
      collectionIdByCategoryId.set(cat.id, collectionId);
    } catch (err) {
      if (err instanceof ShopifyApiError && err.code === "auth_expired") {
        return markConnectionDead(err);
      }
      categoryResults.push({ id: cat.id, nom: cat.nom, status: "error", error: errMessage(err) });
    }
  }

  const productResults: ItemResult[] = [];

  for (const p of (produits ?? []) as (BoutiqueProduitRow & { category_id: string | null })[]) {
    try {
      let productId = p.shopify_product_id;
      const payload = produitToShopifyPayload(p);
      let created = false;
      if (productId) {
        await shopifyFetch(connection.shop_domain, connection.access_token, `/products/${productId}.json`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        const res = await shopifyFetch<{ product: { id: number } }>(
          connection.shop_domain,
          connection.access_token,
          "/products.json",
          { method: "POST", body: JSON.stringify(payload) }
        );
        productId = res.product.id;
        created = true;
        await supabase.from("boutique_produits").update({ shopify_product_id: productId }).eq("id", p.id);
      }

      const collectionId = p.category_id ? collectionIdByCategoryId.get(p.category_id) : undefined;
      if (collectionId) {
        try {
          await shopifyFetch(connection.shop_domain, connection.access_token, "/collects.json", {
            method: "POST",
            body: JSON.stringify({ collect: { product_id: productId, collection_id: collectionId } }),
          });
        } catch (linkErr) {
          // 422 = déjà lié à cette collection, pas une vraie erreur.
          if (!(linkErr instanceof ShopifyApiError && linkErr.status === 422)) throw linkErr;
        }
      }

      productResults.push({ id: p.id, nom: p.nom, status: created ? "created" : "updated" });
    } catch (err) {
      if (err instanceof ShopifyApiError && err.code === "auth_expired") {
        return markConnectionDead(err);
      }
      productResults.push({ id: p.id, nom: p.nom, status: "error", error: errMessage(err) });
    }
  }

  const allResults = [...categoryResults, ...productResults];
  const failedCount = allResults.filter((r) => r.status === "error").length;
  const status = failedCount === 0 ? "success" : failedCount === allResults.length ? "error" : "partial";

  await supabase
    .from("boutiques")
    .update({
      shopify_last_push_at: new Date().toISOString(),
      shopify_last_push_status: status,
      shopify_last_push_error: failedCount > 0 ? `${failedCount} élément(s) en erreur sur ${allResults.length}.` : null,
    })
    .eq("id", id);

  return NextResponse.json({ status, categories: categoryResults, products: productResults });
}
