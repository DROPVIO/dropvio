import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-errors";
import {
  isShopifyConfigured,
  getShopifyConnection,
  shopifyFetch,
  categoryToShopifyPayload,
  pousserProduitBoutique,
  ShopifyApiError,
  shopifyErrorToHttpStatus,
  type BoutiqueProduitRow,
  type BoutiqueCategoryRow,
} from "@/lib/shopify";

// Un lot s'arrête après BUDGET_MS (ou MAX_PAR_LOT éléments) pour rester sous maxDuration : à
// ~2 requêtes/s (limite REST Shopify), 200 produits ne tiennent pas dans un seul appel.
export const maxDuration = 60;
const BUDGET_MS = 45_000;
const MAX_PAR_LOT = 25;

type Etape = "categories" | "produits";
type Curseur = { etape: Etape; apres: string | null };
type ItemResult = {
  id: string;
  nom: string;
  status: "created" | "updated" | "reset" | "error";
  error?: string;
  // Code traduit côté client (namespace apiErrors) ; error reste le détail pour les logs.
  code?: string;
};

function codeErreur(err: unknown): string {
  return err instanceof ShopifyApiError ? `shopify_${err.code}` : "shopify_unknown";
}

function errMessage(err: unknown): string {
  if (err instanceof ShopifyApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Erreur inconnue";
}

function lireCurseur(valeur: unknown): Curseur {
  if (typeof valeur === "object" && valeur !== null) {
    const c = valeur as { etape?: unknown; apres?: unknown };
    if ((c.etape === "categories" || c.etape === "produits") && (c.apres === null || typeof c.apres === "string")) {
      return { etape: c.etape, apres: c.apres };
    }
  }
  return { etape: "categories", apres: null };
}

// Pousse les catégories (-> custom collections) puis les produits (-> products) d'une
// boutique dropvio vers la boutique Shopify connectée, par lots. Chaque réponse renvoie le
// curseur du lot suivant (keyset sur l'id, stable si des produits sont ajoutés ou supprimés
// entre deux lots) : le client enchaîne les appels et peut reprendre là où un lot s'est
// arrêté. Idempotent : un élément déjà poussé est mis à jour plutôt que recréé. Les erreurs
// par élément n'interrompent pas le push ; seule une erreur d'authentification Shopify
// arrête tout. Un élément supprimé côté Shopify (404) perd son id Shopify et sera recréé au
// push suivant (status "reset").
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const debut = Date.now();
  const { id } = await context.params;
  const { supabase, user, plan } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour publier cette boutique sur Shopify.", code: "auth_required" }, { status: 401 });
  }

  // Restriction plan free — même règle que sites-generes/[id]/shopify-push : publier une
  // boutique entière sur Shopify est un export réel, réservé aux plans Pro/Agency. Vérifié
  // ici même si l'UI masque déjà l'action, pour ne jamais dépendre uniquement du frontend.
  if (plan === "free") {
    return apiError(
      "shopify_push_plan",
      403,
      "La publication sur Shopify est réservée aux plans Pro et Agency. Passe au plan Pro pour publier cette boutique."
    );
  }

  if (!isShopifyConfigured()) {
    return apiError("shopify_not_configured", 500, "L'intégration Shopify n'est pas encore configurée côté serveur.");
  }

  const body = await request.json().catch(() => ({}));
  const curseur = lireCurseur(body?.curseur);
  const bilanPrecedent = {
    total: Number(body?.bilan?.total) || 0,
    erreurs: Number(body?.bilan?.erreurs) || 0,
  };

  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id, nom")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message, code: "server_error" }, { status: 500 });
  }
  if (!boutique) {
    return apiError("boutique_not_found", 404, "Boutique introuvable.");
  }

  const connection = await getShopifyConnection(user.id);
  if (!connection) {
    return apiError(
      "shopify_not_connected",
      400,
      "Connecte d'abord ta boutique Shopify dans les paramètres avant de pousser tes produits."
    );
  }

  const [{ count: nbCategories }, { count: nbProduits }] = await Promise.all([
    supabase.from("boutique_categories").select("id", { count: "exact", head: true }).eq("boutique_id", id),
    supabase.from("boutique_produits").select("id", { count: "exact", head: true }).eq("boutique_id", id),
  ]);
  const totalElements = (nbCategories ?? 0) + (nbProduits ?? 0);

  async function enregistrerStatut(status: string, erreur: string | null) {
    await supabase
      .from("boutiques")
      .update({
        shopify_last_push_at: new Date().toISOString(),
        shopify_last_push_status: status,
        shopify_last_push_error: erreur,
      })
      .eq("id", id);
  }

  async function connexionMorte(err: ShopifyApiError) {
    await enregistrerStatut("error", err.message);
    return NextResponse.json({ error: err.message, code: "shopify_auth_expired" }, { status: shopifyErrorToHttpStatus(err) });
  }

  const tempsEcoule = () => Date.now() - debut > BUDGET_MS;
  const categoryResults: ItemResult[] = [];
  const productResults: ItemResult[] = [];
  let suivant: Curseur | null = curseur;

  if (suivant.etape === "categories") {
    let query = supabase
      .from("boutique_categories")
      .select("id, nom, shopify_collection_id")
      .eq("boutique_id", id)
      .order("id", { ascending: true })
      .limit(MAX_PAR_LOT);
    if (suivant.apres) query = query.gt("id", suivant.apres);
    const { data: categories, error } = await query;
    if (error) return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });

    let dernier = suivant.apres;
    let interrompu = false;
    for (const cat of (categories ?? []) as BoutiqueCategoryRow[]) {
      if (tempsEcoule()) {
        interrompu = true;
        break;
      }
      try {
        const payload = categoryToShopifyPayload(cat);
        if (cat.shopify_collection_id) {
          try {
            await shopifyFetch(connection.shop_domain, connection.access_token, `/custom_collections/${cat.shopify_collection_id}.json`, {
              method: "PUT",
              body: JSON.stringify(payload),
            });
            categoryResults.push({ id: cat.id, nom: cat.nom, status: "updated" });
          } catch (err) {
            if (!(err instanceof ShopifyApiError && err.code === "not_found")) throw err;
            await supabase.from("boutique_categories").update({ shopify_collection_id: null }).eq("id", cat.id);
            categoryResults.push({ id: cat.id, nom: cat.nom, status: "reset" });
          }
        } else {
          const res = await shopifyFetch<{ custom_collection: { id: number } }>(
            connection.shop_domain,
            connection.access_token,
            "/custom_collections.json",
            { method: "POST", body: JSON.stringify(payload) }
          );
          await supabase.from("boutique_categories").update({ shopify_collection_id: res.custom_collection.id }).eq("id", cat.id);
          categoryResults.push({ id: cat.id, nom: cat.nom, status: "created" });
        }
      } catch (err) {
        if (err instanceof ShopifyApiError && err.code === "auth_expired") return connexionMorte(err);
        categoryResults.push({ id: cat.id, nom: cat.nom, status: "error", error: errMessage(err), code: codeErreur(err) });
      }
      dernier = cat.id;
    }

    const lotComplet = (categories ?? []).length === MAX_PAR_LOT;
    suivant = interrompu || lotComplet ? { etape: "categories", apres: dernier } : { etape: "produits", apres: null };
  }

  if (suivant.etape === "produits" && !tempsEcoule()) {
    // Collections connues de chaque catégorie (relues à chaque lot : les ids créés par les lots
    // précédents sont déjà enregistrés).
    const { data: categories, error: catErr } = await supabase
      .from("boutique_categories")
      .select("id, shopify_collection_id")
      .eq("boutique_id", id);
    if (catErr) return NextResponse.json({ error: catErr.message, code: "server_error" }, { status: 500 });
    const collectionParCategorie = new Map<string, number>();
    for (const c of categories ?? []) {
      if (c.shopify_collection_id) collectionParCategorie.set(c.id, c.shopify_collection_id);
    }

    let query = supabase
      .from("boutique_produits")
      .select("id, nom, description, image_urls, prix_vente, prix_original, category_id, shopify_product_id, meta")
      .eq("boutique_id", id)
      .order("id", { ascending: true })
      .limit(MAX_PAR_LOT);
    if (suivant.apres) query = query.gt("id", suivant.apres);
    const { data: produits, error } = await query;
    if (error) return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });

    let dernier = suivant.apres;
    let interrompu = false;
    for (const p of (produits ?? []) as (BoutiqueProduitRow & { category_id: string | null; meta: unknown })[]) {
      if (tempsEcoule()) {
        interrompu = true;
        break;
      }
      try {
        const collection = p.category_id ? collectionParCategorie.get(p.category_id) ?? null : null;
        const res = await pousserProduitBoutique(connection.shop_domain, connection.access_token, p, p.meta, collection);
        const metaExistante = typeof p.meta === "object" && p.meta !== null ? (p.meta as Record<string, unknown>) : {};
        if (res.status === "reset") {
          const resteMeta = { ...metaExistante };
          delete resteMeta.shopifyVariantId;
          delete resteMeta.shopifyImages;
          delete resteMeta.shopifyCollectionId;
          await supabase.from("boutique_produits").update({ shopify_product_id: null, meta: resteMeta }).eq("id", p.id);
          productResults.push({ id: p.id, nom: p.nom, status: "reset" });
        } else {
          await supabase
            .from("boutique_produits")
            .update({ shopify_product_id: res.productId, meta: { ...metaExistante, ...res.meta } })
            .eq("id", p.id);
          productResults.push({ id: p.id, nom: p.nom, status: res.status });
        }
      } catch (err) {
        if (err instanceof ShopifyApiError && err.code === "auth_expired") return connexionMorte(err);
        productResults.push({ id: p.id, nom: p.nom, status: "error", error: errMessage(err), code: codeErreur(err) });
      }
      dernier = p.id;
    }

    const lotComplet = (produits ?? []).length === MAX_PAR_LOT;
    suivant = interrompu || lotComplet ? { etape: "produits", apres: dernier } : null;
  }

  const resultatsLot = [...categoryResults, ...productResults];
  const bilan = {
    total: bilanPrecedent.total + resultatsLot.length,
    erreurs: bilanPrecedent.erreurs + resultatsLot.filter((r) => r.status === "error").length,
  };

  if (suivant) {
    return NextResponse.json({
      termine: false,
      curseur: suivant,
      bilan,
      totalElements,
      categories: categoryResults,
      products: productResults,
    });
  }

  const status = bilan.erreurs === 0 ? "success" : bilan.erreurs === bilan.total ? "error" : "partial";
  await enregistrerStatut(status, bilan.erreurs > 0 ? `${bilan.erreurs} élément(s) en erreur sur ${bilan.total}.` : null);

  return NextResponse.json({
    termine: true,
    status,
    bilan,
    totalElements,
    categories: categoryResults,
    products: productResults,
  });
}
