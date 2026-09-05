import crypto from "crypto";
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
// utilise Shopify Payments, sinon simplement pas de données à lire sur ce scope.
// Un changement de cette liste force la ré-authentification des marchands déjà connectés :
// Shopify n'octroie jamais un nouveau scope sur un token existant.
const SHOPIFY_SCOPES =
  "read_products,write_products,write_inventory,read_content,write_content,read_themes,write_themes,read_orders,read_returns,read_shopify_payments_disputes";

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

const CORE_WEBHOOK_TOPICS = ["orders/updated", "refunds/create", "app/uninstalled"];
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
    .select("shop_domain, shop_name, access_token_encrypted, scope, disputes_scope_granted, connected_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.access_token_encrypted) return null;

  return {
    shop_domain: data.shop_domain,
    shop_name: data.shop_name,
    access_token: decryptSecret(data.access_token_encrypted),
    scope: data.scope,
    disputes_scope_granted: data.disputes_scope_granted,
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
}): Promise<{ ok: true; disputesGranted: boolean } | { ok: false; error: string }> {
  const disputesGranted = params.scope
    .split(",")
    .map((s) => s.trim())
    .includes("read_shopify_payments_disputes");

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shopify_connections").upsert(
    {
      user_id: params.userId,
      shop_domain: params.shop,
      shop_name: params.shopName,
      access_token_encrypted: encryptSecret(params.accessToken),
      scope: params.scope,
      disputes_scope_granted: disputesGranted,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) return { ok: false, error: error.message };
  return { ok: true, disputesGranted };
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
      images: (p.image_urls ?? []).filter(Boolean).map((src) => ({ src })),
      variants: [
        {
          price: p.prix_vente.toFixed(2),
          compare_at_price: p.prix_original ? p.prix_original.toFixed(2) : null,
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
