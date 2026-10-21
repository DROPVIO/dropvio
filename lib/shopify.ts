import crypto from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "./supabase-admin";
import { encryptSecret, decryptSecret } from "./crypto";

// Client Admin API Shopify (REST) + helpers OAuth. Toute lecture/écriture de
// shopify_connections passe par le service role (jamais le client Supabase lié à la
// session utilisateur) : cette table n'a aucune policy RLS pour anon/authenticated,
// voir supabase/migrations/015_shopify_integration.sql.

export const SHOPIFY_API_VERSION = "2024-10";

// content = Pages API, themes = Assets API (réplication du design en section) ;
// read_orders/read_returns = remboursements/retours ; read_shopify_payments_disputes =
// chargebacks (voir 018_shopify_incidents_scopes.sql) — n'a d'effet que si le marchand
// utilise Shopify Payments, sinon simplement pas de données à lire sur ce scope ;
// write_fulfillments = pousser le numéro de suivi une fois la commande passée sur AliExpress
// (voir 033_commandes_aliexpress_suivi.sql), n'a d'effet que si le marchand a re-autorisé l'app
// après son ajout (voir fulfillment_scope_granted).
// Un changement de cette liste force la ré-authentification des marchands déjà connectés :
// Shopify n'octroie jamais un nouveau scope sur un token existant.
const SHOPIFY_SCOPES =
  "read_products,write_products,write_inventory,read_content,write_content,read_themes,write_themes,read_orders,read_returns,read_shopify_payments_disputes,write_fulfillments";

export function isShopifyConfigured(): boolean {
  return Boolean(process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET);
}

export function isValidShopDomain(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

export function buildAuthorizeUrl(params: { shop: string; state: string; redirectUri: string }): string {
  const url = new URL(`https://${params.shop}/admin/oauth/authorize`);
  url.searchParams.set("client_id", process.env.SHOPIFY_CLIENT_ID!);
  url.searchParams.set("scope", SHOPIFY_SCOPES);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

// Vérification de la signature HMAC du callback OAuth, selon l'algorithme documenté par
// Shopify : https://shopify.dev/docs/apps/auth/oauth/getting-started — retire hmac (et le
// paramètre legacy signature, hors du digest), trie le reste par clé, joint en "k=v&...",
// et compare en temps constant le HMAC-SHA256 hex avec le secret de l'app.
export function verifyShopifyHmac(searchParams: URLSearchParams): boolean {
  const hmac = searchParams.get("hmac");
  if (!hmac) return false;

  const params = new URLSearchParams(searchParams);
  params.delete("hmac");
  params.delete("signature");

  const message = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_CLIENT_SECRET!)
    .update(message)
    .digest("hex");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmac, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Vérification HMAC des WEBHOOKS Shopify — mécanisme différent de verifyShopifyHmac
// ci-dessus (qui vérifie le callback OAuth, sur des query params, en hex) : ici le digest
// est en BASE64, calculé sur le corps brut de la requête (JSON.stringify côté Shopify),
// comparé à l'en-tête X-Shopify-Hmac-Sha256. Toute reformatation du body avant ce calcul
// (ex: JSON.parse puis JSON.stringify) change les octets et casse la vérification — d'où
// readShopifyWebhook() ci-dessous, qui lit le texte brut AVANT tout parsing.
export function verifyShopifyWebhookHmac(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;

  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_CLIENT_SECRET!)
    .update(rawBody, "utf8")
    .digest("base64");

  const a = Buffer.from(digest, "utf8");
  const b = Buffer.from(hmacHeader, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export type ShopifyWebhookResult =
  | { ok: true; payload: unknown; topic: string | null; shopDomain: string | null }
  | { ok: false };

// Point d'entrée UNIQUE pour lire un webhook Shopify entrant : request.text() d'abord (le
// HMAC est calculé sur cette chaîne brute exacte), vérification, et seulement ensuite
// JSON.parse. Toutes les routes /api/webhooks/shopify/* doivent passer par cette fonction
// plutôt que d'appeler request.json() elles-mêmes, pour ne jamais pouvoir régresser sur
// l'ordre texte-brut-avant-parsing.
export async function readShopifyWebhook(request: Request): Promise<ShopifyWebhookResult> {
  const rawBody = await request.text();
  const hmacHeader = request.headers.get("x-shopify-hmac-sha256");

  if (!verifyShopifyWebhookHmac(rawBody, hmacHeader)) {
    return { ok: false };
  }

  let payload: unknown;
  try {
    payload = rawBody.length > 0 ? JSON.parse(rawBody) : {};
  } catch {
    return { ok: false };
  }

  return {
    ok: true,
    payload,
    topic: request.headers.get("x-shopify-topic"),
    shopDomain: request.headers.get("x-shopify-shop-domain"),
  };
}

const CORE_WEBHOOK_TOPICS = ["orders/create", "orders/updated", "refunds/create", "app/uninstalled"];
const DISPUTE_WEBHOOK_TOPICS = ["disputes/create", "disputes/update"];

// Enregistrement best-effort : une reconnexion (même boutique, token renouvelé) retente
// l'enregistrement des mêmes topics -> Shopify renvoie 422 "a déjà été pris", traité comme
// non fatal plutôt que remonté en erreur.
export async function registerShopifyWebhooks(
  shop: string,
  accessToken: string,
  address: string,
  disputesGranted: boolean
): Promise<void> {
  const topics = disputesGranted ? [...CORE_WEBHOOK_TOPICS, ...DISPUTE_WEBHOOK_TOPICS] : CORE_WEBHOOK_TOPICS;

  await Promise.all(
    topics.map(async (topic) => {
      try {
        await shopifyFetch(shop, accessToken, "/webhooks.json", {
          method: "POST",
          body: JSON.stringify({ webhook: { topic, address, format: "json" } }),
        });
      } catch (err) {
        if (err instanceof ShopifyApiError && err.status === 422) return; // déjà enregistré
        console.error(`[shopify] Échec enregistrement webhook ${topic} pour ${shop}:`, err);
      }
    })
  );
}

export async function exchangeCodeForToken(
  shop: string,
  code: string
): Promise<{ access_token: string; scope: string }> {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
      code,
    }),
  });
  if (!res.ok) {
    throw new ShopifyApiError("Échange du code d'autorisation Shopify échoué.", res.status, "unknown");
  }
  return res.json();
}

export type ShopifyErrorCode = "auth_expired" | "not_found" | "rate_limited" | "unknown";

export class ShopifyApiError extends Error {
  status: number;
  code: ShopifyErrorCode;
  constructor(message: string, status: number, code: ShopifyErrorCode = "unknown") {
    super(message);
    this.name = "ShopifyApiError";
    this.status = status;
    this.code = code;
  }
}

// Map une ShopifyApiError vers un status HTTP à renvoyer au client dropvio.
export function shopifyErrorToHttpStatus(err: ShopifyApiError): number {
  switch (err.code) {
    case "auth_expired": return 401;
    case "not_found": return 404;
    case "rate_limited": return 429;
    default: return 502;
  }
}

export type ShopifyConnection = {
  shop_domain: string;
  shop_name: string | null;
  access_token: string;
  scope: string | null;
  disputes_scope_granted: boolean;
  fulfillment_scope_granted: boolean;
  connected_at: string;
};

// Renvoie null aussi bien quand il n'y a aucune connexion QUE quand il en existe une mais
// sans token chiffré (connexion pré-migration 018, ou invalidée par le webhook
// app/uninstalled) — dans les deux cas, l'appelant doit traiter ça comme "reconnexion
// nécessaire", jamais utiliser un token en clair legacy. Pour distinguer ces deux cas côté
// UI (message différent), voir /api/shopify/status qui lit directement la table.
export async function getShopifyConnection(userId: string): Promise<ShopifyConnection | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("shopify_connections")
    .select(
      "shop_domain, shop_name, access_token_encrypted, scope, disputes_scope_granted, fulfillment_scope_granted, connected_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.access_token_encrypted) return null;

  return {
    shop_domain: data.shop_domain,
    shop_name: data.shop_name,
    access_token: decryptSecret(data.access_token_encrypted),
    scope: data.scope,
    disputes_scope_granted: data.disputes_scope_granted,
    fulfillment_scope_granted: data.fulfillment_scope_granted,
    connected_at: data.connected_at,
  };
}

// Chiffre et enregistre le token — point d'entrée unique pour écrire dans
// shopify_connections, pour ne jamais avoir un chemin d'écriture qui oublie de chiffrer.
export async function saveShopifyConnection(params: {
  userId: string;
  shop: string;
  shopName: string | null;
  accessToken: string;
  scope: string;
}): Promise<
  { ok: true; disputesGranted: boolean; fulfillmentGranted: boolean } | { ok: false; error: string }
> {
  const grantedScopes = params.scope.split(",").map((s) => s.trim());
  const disputesGranted = grantedScopes.includes("read_shopify_payments_disputes");
  const fulfillmentGranted = grantedScopes.includes("write_fulfillments");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shopify_connections").upsert(
    {
      user_id: params.userId,
      shop_domain: params.shop,
      shop_name: params.shopName,
      access_token_encrypted: encryptSecret(params.accessToken),
      scope: params.scope,
      disputes_scope_granted: disputesGranted,
      fulfillment_scope_granted: fulfillmentGranted,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, disputesGranted, fulfillmentGranted };
}

// Wrapper fetch Admin API : ajoute le token, gère le rate limit (429 + Retry-After, avec
// un backoff court) et normalise les erreurs HTTP en ShopifyApiError avec un message
// utilisateur clair plutôt que de laisser fuir un statut Shopify brut.
export async function shopifyFetch<T = unknown>(
  shop: string,
  accessToken: string,
  path: string,
  init: RequestInit = {},
  attempt = 1
): Promise<T> {
  const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 429 && attempt <= 3) {
    const retryAfterSec = Number(res.headers.get("Retry-After")) || 1;
    await new Promise((resolve) => setTimeout(resolve, retryAfterSec * 1000));
    return shopifyFetch<T>(shop, accessToken, path, init, attempt + 1);
  }

  if (res.status === 401 || res.status === 403) {
    throw new ShopifyApiError(
      "Le token d'accès Shopify est invalide ou a expiré. Reconnecte ta boutique Shopify dans les paramètres.",
      res.status,
      "auth_expired"
    );
  }
  if (res.status === 404) {
    throw new ShopifyApiError(
      "Ressource Shopify introuvable — la boutique a peut-être désinstallé l'app ou changé de domaine.",
      res.status,
      "not_found"
    );
  }
  if (res.status === 429) {
    throw new ShopifyApiError(
      "Limite de requêtes Shopify atteinte. Réessaie dans quelques instants.",
      res.status,
      "rate_limited"
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = typeof body?.errors === "string" ? body.errors : JSON.stringify(body?.errors ?? body);
    } catch {
      // corps non-JSON ou vide, on garde detail vide
    }
    throw new ShopifyApiError(`Erreur Shopify (${res.status})${detail ? ` : ${detail}` : ""}`, res.status, "unknown");
  }

  if (res.status === 204) return null as T;
  return res.json();
}

type ShopifyFulfillmentOrder = { id: number; status: string };

// Page de la boutique en ligne (Admin REST /pages) — champs utilisés par la publication des
// sites générés (app/api/sites-generes/[id]/shopify-push).
export type ShopifyPage = { id: number; handle: string; title?: string };

export async function createPage(
  shop: string,
  accessToken: string,
  page: { handle: string; title: string; body_html: string }
): Promise<ShopifyPage> {
  const res = await shopifyFetch<{ page: ShopifyPage }>(shop, accessToken, "/pages.json", {
    method: "POST",
    body: JSON.stringify({ page: { ...page, published: true } }),
  });
  return res.page;
}

export async function updatePage(
  shop: string,
  accessToken: string,
  pageId: number,
  page: { title: string; body_html: string }
): Promise<ShopifyPage> {
  const res = await shopifyFetch<{ page: ShopifyPage }>(shop, accessToken, `/pages/${pageId}.json`, {
    method: "PUT",
    body: JSON.stringify({ page }),
  });
  return res.page;
}

// Pousse le numéro de suivi saisi par le marchand vers Shopify une fois qu'il a commandé sur
// AliExpress. Passe par le modèle FulfillmentOrder (obligatoire depuis la dépréciation de la
// création directe de fulfillment sur /orders/{id}/fulfillments.json) : il faut d'abord
// retrouver le ou les fulfillment orders "open" de la commande avant de pouvoir créer le
// fulfillment. Laisse ShopifyApiError remonter tel quel — c'est l'appelant (route API) qui
// décide de stocker l'erreur sans faire échouer la sauvegarde du numéro de suivi.
export async function createShopifyFulfillment(
  shop: string,
  accessToken: string,
  shopifyOrderId: number,
  tracking: { number: string; company?: string | null }
): Promise<number> {
  const { fulfillment_orders } = await shopifyFetch<{ fulfillment_orders: ShopifyFulfillmentOrder[] }>(
    shop,
    accessToken,
    `/orders/${shopifyOrderId}/fulfillment_orders.json`
  );

  const openOrders = (fulfillment_orders ?? []).filter((fo) => fo.status === "open");
  if (openOrders.length === 0) {
    throw new ShopifyApiError(
      "Aucun fulfillment order ouvert pour cette commande côté Shopify (déjà expédiée, annulée, ou non éligible).",
      409,
      "unknown"
    );
  }

  const { fulfillment } = await shopifyFetch<{ fulfillment: { id: number } }>(
    shop,
    accessToken,
    "/fulfillments.json",
    {
      method: "POST",
      body: JSON.stringify({
        fulfillment: {
          notify_customer: true,
          tracking_info: { number: tracking.number, company: tracking.company ?? null },
          line_items_by_fulfillment_order: openOrders.map((fo) => ({ fulfillment_order_id: fo.id })),
        },
      }),
    }
  );

  return fulfillment.id;
}

// ---- Mapping produits/collections dropvio -> payloads Admin API ----

export type BoutiqueProduitRow = {
  id: string;
  nom: string;
  description: string | null;
  image_urls: string[] | null;
  prix_vente: number;
  prix_original: number | null;
  shopify_product_id: number | null;
};

export type BoutiqueCategoryRow = {
  id: string;
  nom: string;
  shopify_collection_id: number | null;
};

// État de la dernière synchronisation Shopify d'un produit, rangé dans boutique_produits.meta
// (jsonb existant) : il évite de réimporter les images et de recréer le variant à chaque push,
// et permet de retirer le produit de l'ancienne collection quand sa catégorie change.
export type ShopifySyncMeta = {
  shopifyVariantId?: number;
  shopifyImages?: string[];
  shopifyCollectionId?: number | null;
};

export function lireMetaShopify(meta: unknown): ShopifySyncMeta {
  if (typeof meta !== "object" || meta === null) return {};
  const m = meta as Record<string, unknown>;
  return {
    shopifyVariantId: typeof m.shopifyVariantId === "number" ? m.shopifyVariantId : undefined,
    shopifyImages: Array.isArray(m.shopifyImages) ? m.shopifyImages.filter((x): x is string => typeof x === "string") : undefined,
    // undefined = jamais mémorisé (produit poussé avant ce suivi), null = aucune collection.
    shopifyCollectionId:
      "shopifyCollectionId" in m ? (typeof m.shopifyCollectionId === "number" ? m.shopifyCollectionId : null) : undefined,
  };
}

function prix(valeur: number | string | null | undefined): string | null {
  const n = Number(valeur);
  return valeur == null || !Number.isFinite(n) ? null : n.toFixed(2);
}

function imagesDuProduit(p: BoutiqueProduitRow): string[] {
  return (p.image_urls ?? []).filter(Boolean);
}

// stock/stock_status ne sont plus lus ici (voir historique : l'UI Dropvio qui les
// pilotait a été retirée, ces colonnes ne sont donc plus jamais tenues à jour côté
// dropvio). status reste toujours "active" plutôt que dépendre d'un stock_status
// figé, et inventory_management n'est pas déclaré : Shopify traite les produits
// comme disponibles par défaut et gère son propre inventaire, cohérent avec le fait
// que Shopify est désormais la vraie vitrine.
export function produitToShopifyPayload(p: BoutiqueProduitRow) {
  return {
    product: {
      title: p.nom,
      body_html: p.description ?? "",
      status: "active",
      images: imagesDuProduit(p).map((src) => ({ src })),
      variants: [
        {
          price: prix(p.prix_vente) ?? "0.00",
          compare_at_price: p.prix_original ? prix(p.prix_original) : null,
          sku: p.id,
        },
      ],
    },
  };
}

export function categoryToShopifyPayload(c: BoutiqueCategoryRow) {
  return {
    custom_collection: {
      title: c.nom,
      published: true,
    },
  };
}

// Retire un produit d'une collection (supprime le « collect » qui les relie), s'il existe.
// Une collection ou un produit déjà supprimé côté Shopify n'est pas une erreur.
export async function retirerDeCollection(
  shop: string,
  accessToken: string,
  productId: number,
  collectionId: number
): Promise<void> {
  try {
    const { collects } = await shopifyFetch<{ collects: { id: number }[] }>(
      shop,
      accessToken,
      `/collects.json?product_id=${productId}&collection_id=${collectionId}`
    );
    for (const collect of collects ?? []) {
      await shopifyFetch(shop, accessToken, `/collects/${collect.id}.json`, { method: "DELETE" });
    }
  } catch (err) {
    if (err instanceof ShopifyApiError && err.code === "not_found") return;
    throw err;
  }
}

export type ResultatPushProduit =
  | { status: "created" | "updated"; productId: number; meta: ShopifySyncMeta }
  // Le produit n'existe plus côté Shopify (404) : l'appelant remet shopify_product_id à null,
  // le produit sera recréé au push suivant.
  | { status: "reset" };

// Crée ou met à jour un produit boutique sur Shopify, puis aligne sa collection.
// Mise à jour : le variant existant est modifié par son id (jamais recréé), et les images ne
// sont renvoyées que si la liste d'URLs a changé depuis le dernier push (sinon Shopify les
// réimporterait toutes). collectionCible : collection de la catégorie actuelle, ou null.
export async function pousserProduitBoutique(
  shop: string,
  accessToken: string,
  p: BoutiqueProduitRow,
  metaBrute: unknown,
  collectionCible: number | null
): Promise<ResultatPushProduit> {
  const meta = lireMetaShopify(metaBrute);
  const images = imagesDuProduit(p);
  let productId = p.shopify_product_id;
  let variantId = meta.shopifyVariantId;
  let cree = false;

  try {
    if (productId) {
      if (!variantId) {
        const { product } = await shopifyFetch<{ product: { variants: { id: number }[] } }>(
          shop,
          accessToken,
          `/products/${productId}.json?fields=id,variants`
        );
        variantId = product.variants[0]?.id;
      }
      const imagesInchangees =
        meta.shopifyImages !== undefined &&
        meta.shopifyImages.length === images.length &&
        meta.shopifyImages.every((src, i) => src === images[i]);
      await shopifyFetch(shop, accessToken, `/products/${productId}.json`, {
        method: "PUT",
        body: JSON.stringify({
          product: {
            id: productId,
            title: p.nom,
            body_html: p.description ?? "",
            status: "active",
            ...(imagesInchangees ? {} : { images: images.map((src) => ({ src })) }),
            ...(variantId && {
              variants: [
                {
                  id: variantId,
                  price: prix(p.prix_vente) ?? "0.00",
                  compare_at_price: p.prix_original ? prix(p.prix_original) : null,
                },
              ],
            }),
          },
        }),
      });
    } else {
      const { product } = await shopifyFetch<{ product: { id: number; variants: { id: number }[] } }>(
        shop,
        accessToken,
        "/products.json",
        { method: "POST", body: JSON.stringify(produitToShopifyPayload(p)) }
      );
      productId = product.id;
      variantId = product.variants[0]?.id;
      cree = true;
    }
  } catch (err) {
    if (err instanceof ShopifyApiError && err.code === "not_found" && p.shopify_product_id) {
      return { status: "reset" };
    }
    throw err;
  }

  const collectionPrecedente = cree ? null : meta.shopifyCollectionId ?? null;
  if (collectionPrecedente && collectionPrecedente !== collectionCible) {
    await retirerDeCollection(shop, accessToken, productId, collectionPrecedente);
  }
  // Lien créé à la création, au changement de catégorie, ou quand rien n'a encore été mémorisé
  // (produits poussés avant ce suivi) ; 422 = déjà lié.
  if (collectionCible && (cree || meta.shopifyCollectionId !== collectionCible)) {
    try {
      await shopifyFetch(shop, accessToken, "/collects.json", {
        method: "POST",
        body: JSON.stringify({ collect: { product_id: productId, collection_id: collectionCible } }),
      });
    } catch (err) {
      if (!(err instanceof ShopifyApiError && err.status === 422)) throw err;
    }
  }

  return {
    status: cree ? "created" : "updated",
    productId,
    meta: { shopifyVariantId: variantId, shopifyImages: images, shopifyCollectionId: collectionCible },
  };
}

// ---- Préparation d'achat AliExpress à la commande (v1 "assist manuel", voir commandes_a_preparer) ----

export type ShopifyOrderLineItem = {
  product_id: number | null;
  variant_title?: string | null;
  quantity: number;
  title: string;
};

export type ShopifyOrderAddress = {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
};

export type ShopifyOrderForPreparation = {
  id: number;
  name?: string | null;
  line_items?: ShopifyOrderLineItem[];
  shipping_address?: ShopifyOrderAddress | null;
  customer?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
};

// Résout chaque ligne de commande vers son produit AliExpress source et construit la ligne à
// upsert dans commandes_a_preparer. Lien fournisseur, par priorité :
// 1. boutique_produits.lien_aliexpress, posé par l'import AliExpress (migration 036) — seul
//    lien disponible pour un produit importé hors catalogue (source_produit_id null) ;
// 2. sinon le catalogue : boutique_produits.source_produit_id -> produits.lienAliExpress.
// variante_attributs (ex. {Couleur: "Noir"}) dit quelle variante commander sur AliExpress.
// Partagé entre le webhook orders/create et le cron de réconciliation pour ne jamais avoir
// deux implémentations de cette résolution qui divergent.
export async function buildCommandeAPreparerRow(
  admin: SupabaseClient,
  userId: string,
  order: ShopifyOrderForPreparation
): Promise<Record<string, unknown>> {
  const lineItems = order.line_items ?? [];
  const productIds = [...new Set(lineItems.map((li) => li.product_id).filter((id): id is number => Boolean(id)))];

  type ProduitBoutique = {
    source_produit_id: string | null;
    lien_aliexpress: string | null;
    variante_attributs: Record<string, string> | null;
  };
  const produitByShopifyId = new Map<number, ProduitBoutique>();
  if (productIds.length > 0) {
    const { data } = await admin
      .from("boutique_produits")
      .select("shopify_product_id, source_produit_id, lien_aliexpress, variante_attributs")
      .in("shopify_product_id", productIds);
    for (const row of data ?? []) {
      if (row.shopify_product_id) {
        produitByShopifyId.set(row.shopify_product_id, {
          source_produit_id: row.source_produit_id ?? null,
          lien_aliexpress: row.lien_aliexpress ?? null,
          variante_attributs: row.variante_attributs ?? null,
        });
      }
    }
  }

  // Catalogue interrogé seulement pour les produits sans lien direct.
  const sourceProduitIds = [
    ...new Set(
      [...produitByShopifyId.values()]
        .filter((p) => !p.lien_aliexpress)
        .map((p) => p.source_produit_id)
        .filter((v): v is string => Boolean(v))
    ),
  ];
  const lienByProduitId = new Map<string, string | null>();
  if (sourceProduitIds.length > 0) {
    const { data } = await admin.from("produits").select("id, lienAliExpress").in("id", sourceProduitIds);
    for (const row of data ?? []) lienByProduitId.set(row.id, row.lienAliExpress ?? null);
  }

  const lignes = lineItems.map((li) => {
    const produit = li.product_id ? produitByShopifyId.get(li.product_id) ?? null : null;
    const sourceProduitId = produit?.source_produit_id ?? null;
    const attributs = produit?.variante_attributs ?? {};
    return {
      shopify_product_id: li.product_id,
      source_produit_id: sourceProduitId,
      nom: li.title,
      quantite: li.quantity,
      variant_title: li.variant_title ?? null,
      lien_aliexpress:
        produit?.lien_aliexpress ?? (sourceProduitId ? lienByProduitId.get(sourceProduitId) ?? null : null),
      variante_attributs: Object.keys(attributs).length > 0 ? attributs : null,
    };
  });

  const addr = order.shipping_address ?? null;
  const nomComplet = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(" ").trim();
  const clientNom = addr?.name ?? (nomComplet || null);

  return {
    user_id: userId,
    shopify_order_id: order.id,
    shopify_order_name: order.name ?? null,
    adresse_livraison: addr,
    client_nom: clientNom,
    client_telephone: addr?.phone ?? order.customer?.phone ?? null,
    lignes,
    raw_payload: order,
    updated_at: new Date().toISOString(),
  };
}
