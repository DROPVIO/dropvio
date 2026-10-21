import crypto from "crypto";
import { getValidAccessToken } from "./aliexpress-oauth";

const API_URL = "https://api-sg.aliexpress.com/sync";

// Lues à l'appel plutôt qu'au chargement du module : un script standalone (ex.
// scripts/seed-produits.ts, exécuté hors Next.js) appelle dotenv.config() dans son propre
// corps, qui ne s'exécute qu'après la résolution des imports — figer ALIEXPRESS_APP_KEY/SECRET
// au niveau module au chargement de ce fichier les capturerait avant que .env.local soit lu.
function getCredentials(): { appKey: string; appSecret: string } {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET manquants dans l'environnement");
  }
  return { appKey, appSecret };
}

export function generateSign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let signStr = secret;
  for (const key of sortedKeys) signStr += key + params[key];
  signStr += secret;
  return crypto.createHash("md5").update(signStr).digest("hex").toUpperCase();
}

// accessToken : requis par les API Dropshipping (aliexpress.ds.*), obtenu par l'OAuth de
// l'utilisateur (lib/aliexpress-oauth.ts). Les API Affiliate s'en passent.
async function callApi(
  method: string,
  params: Record<string, string>,
  accessToken?: string
): Promise<Record<string, unknown>> {
  const { appKey, appSecret } = getCredentials();
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  const allParams: Record<string, string> = {
    app_key: appKey,
    method,
    timestamp,
    sign_method: "md5",
    v: "2.0",
    format: "json",
    ...params,
  };
  if (accessToken) allParams.access_token = accessToken;
  allParams.sign = generateSign(allParams, appSecret);

  const qs = Object.entries(allParams)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const res = await fetch(`${API_URL}?${qs}`);
  return res.json();
}

// Reflète les champs réellement observés dans les réponses product.query / productdetail.get
// (tous optionnels ici : dépend du champ "fields" demandé par l'appelant).
export type AliExpressProduct = {
  product_id: number;
  product_title: string;
  product_main_image_url: string;
  // Prix dans la devise d'origine de la fiche (USD, CNY, ... — variable selon le produit,
  // voir sale_price_currency). NE PAS utiliser pour comparer des prix entre produits.
  sale_price?: string;
  sale_price_currency?: string;
  // Seul champ de prix réellement converti dans target_currency (vérifié empiriquement :
  // sale_price reste dans la devise d'origine même avec target_currency=EUR demandé).
  // C'est le seul champ comparable entre produits.
  target_sale_price?: string;
  target_sale_price_currency?: string;
  original_price?: string;
  // Comme target_sale_price : prix barré converti dans target_currency.
  target_original_price?: string;
  target_original_price_currency?: string;
  commission_rate?: string;
  evaluate_rate?: string;
  lastest_volume?: number;
  product_detail_url?: string;
  promotion_link?: string;
  // SKU par défaut de la fiche (productdetail.get) — jamais la liste des variantes.
  sku_id?: number | string;
  shop_id?: number;
  shop_url?: string;
  shop_name?: string;
  first_level_category_id?: number;
  first_level_category_name?: string;
  second_level_category_id?: number;
  second_level_category_name?: string;
};

type CommonOpts = {
  fields?: string;
  shipToCountry?: string;
  targetCurrency?: string;
  targetLanguage?: string;
};

const DEFAULT_QUERY_FIELDS =
  "product_id,product_title,product_main_image_url,sale_price,original_price,commission_rate,evaluate_rate,product_detail_url,lastest_volume";

export async function queryProducts(
  keywords: string,
  opts: CommonOpts & { pageNo?: number; pageSize?: number; sort?: string } = {}
): Promise<AliExpressProduct[]> {
  const params: Record<string, string> = {
    keywords,
    tracking_id: "default",
    page_no: String(opts.pageNo ?? 1),
    page_size: String(opts.pageSize ?? 20),
    sort: opts.sort ?? "SALE_PRICE_ASC",
    fields: opts.fields ?? DEFAULT_QUERY_FIELDS,
  };
  if (opts.shipToCountry) params.ship_to_country = opts.shipToCountry;
  if (opts.targetCurrency) params.target_currency = opts.targetCurrency;
  if (opts.targetLanguage) params.target_language = opts.targetLanguage;

  try {
    const data = await callApi("aliexpress.affiliate.product.query", params);
    const resp = (data?.aliexpress_affiliate_product_query_response as Record<string, unknown>)
      ?.resp_result as Record<string, unknown>;
    if ((resp?.resp_code as number) !== 200) return [];
    const list =
      ((resp?.result as Record<string, unknown>)?.products as Record<string, unknown>)
        ?.product as AliExpressProduct[] ?? [];
    return list;
  } catch {
    return [];
  }
}

const DEFAULT_DETAIL_FIELDS =
  "product_id,product_title,product_main_image_url,sale_price,sale_price_currency,target_sale_price,target_sale_price_currency,evaluate_rate,lastest_volume,shop_id,shop_url,shop_name,first_level_category_id,first_level_category_name,second_level_category_id,second_level_category_name,product_detail_url,promotion_link";

// Échec d'appel à l'API (réseau, quota, resp_code ≠ 200…) : temporaire, à distinguer d'un
// produit réellement introuvable. code fixe pour que les appelants puissent le tester.
export class AliExpressApiError extends Error {
  readonly code = "erreur_api" as const;
  constructor(message: string) {
    super(message);
    this.name = "AliExpressApiError";
  }
}

// null UNIQUEMENT si AliExpress répond normalement (resp_code 200) sans aucun produit :
// produit retiré, identifiant invalide ou non disponible en affiliation (vérifié : c'est la
// réponse obtenue pour un id inexistant). Tout autre échec lève AliExpressApiError.
export async function getProductDetail(
  productId: string,
  opts: CommonOpts = {}
): Promise<AliExpressProduct | null> {
  const params: Record<string, string> = {
    product_ids: productId,
    tracking_id: "default",
    fields: opts.fields ?? DEFAULT_DETAIL_FIELDS,
  };
  if (opts.shipToCountry) params.ship_to_country = opts.shipToCountry;
  if (opts.targetCurrency) params.target_currency = opts.targetCurrency;
  if (opts.targetLanguage) params.target_language = opts.targetLanguage;

  let data: Record<string, unknown>;
  try {
    data = await callApi("aliexpress.affiliate.productdetail.get", params);
  } catch (err) {
    throw new AliExpressApiError(`productdetail.get : appel impossible (${String(err)})`);
  }

  const resp = (data?.aliexpress_affiliate_productdetail_get_response as Record<string, unknown>)
    ?.resp_result as Record<string, unknown> | undefined;
  if (Number(resp?.resp_code) !== 200) {
    const erreur = data?.error_response ?? resp ?? data;
    throw new AliExpressApiError(`productdetail.get : réponse en échec ${JSON.stringify(erreur).slice(0, 300)}`);
  }
  const list =
    ((resp?.result as Record<string, unknown>)?.products as Record<string, unknown>)
      ?.product as AliExpressProduct[] ?? [];
  return list[0] ?? null;
}

// ---- Variantes (API Dropshipping, token OAuth de l'utilisateur) ----

export type AliExpressVariant = {
  sku_id: string;
  // EUR uniquement : null si AliExpress n'a pas pu convertir (devise de la réponse ≠ EUR).
  prix: number | null;
  prix_original: number | null;
  // Ex. { Couleur: "Noir", Taille: "M" } — noms tels que renvoyés pour target_language=FR.
  attributs: Record<string, string>;
  image: string | null;
  stock: number | null;
};

export type AliExpressVariantsResult =
  | { ok: true; titre: string; images: string[]; variantes: AliExpressVariant[] }
  // non_connecte : pas de token, refresh refusé ou token rejeté -> reconnexion dans les
  // paramètres. permission_refusee : l'app AliExpress n'a pas accès aux API Dropshipping.
  | { ok: false; error: "non_connecte" | "permission_refusee" | "introuvable" | "api_error" };

const TOKEN_ERROR_CODES = new Set(["IllegalAccessToken", "MissingParameter", "InvalidSession", "SessionExpired"]);

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return value ? [value as T] : [];
}

function toPrice(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

type DsSkuProperty = {
  sku_property_name?: string;
  sku_property_value?: string;
  property_value_definition_name?: string;
  sku_image?: string;
};

type DsSku = {
  sku_id?: string | number;
  offer_sale_price?: string;
  sku_price?: string;
  currency_code?: string;
  sku_available_stock?: number;
  ae_sku_property_dtos?: { ae_sku_property_d_t_o?: DsSkuProperty | DsSkuProperty[] };
};

// Une entrée par SKU via aliexpress.ds.product.get. Sans SKU dans la réponse : une seule
// entrée, le SKU par défaut de l'API Affiliate (ou "default"), pour que l'import crée quand
// même une fiche et que l'index unique (036) la protège des doublons.
export async function getProductVariants(productId: string, userId: string): Promise<AliExpressVariantsResult> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return { ok: false, error: "non_connecte" };

  let data: Record<string, unknown>;
  try {
    data = await callApi(
      "aliexpress.ds.product.get",
      { product_id: productId, ship_to_country: "FR", target_currency: "EUR", target_language: "FR" },
      accessToken
    );
  } catch {
    return { ok: false, error: "api_error" };
  }

  const errorResponse = data?.error_response as { code?: string } | undefined;
  if (errorResponse) {
    if (errorResponse.code && TOKEN_ERROR_CODES.has(errorResponse.code)) return { ok: false, error: "non_connecte" };
    if (errorResponse.code === "InsufficientPermission") return { ok: false, error: "permission_refusee" };
    console.warn("[aliexpress] ds.product.get :", errorResponse);
    return { ok: false, error: "api_error" };
  }

  const response = data?.aliexpress_ds_product_get_response as Record<string, unknown> | undefined;
  const result = response?.result as Record<string, unknown> | undefined;
  if (!result || Number(response?.rsp_code ?? 200) !== 200) return { ok: false, error: "introuvable" };

  const base = (result.ae_item_base_info_dto ?? {}) as { subject?: string };
  const multimedia = (result.ae_multimedia_info_dto ?? {}) as { image_urls?: string };
  const images = (multimedia.image_urls ?? "").split(";").map((u) => u.trim()).filter(Boolean);
  const titre = base.subject ?? "";

  const skus = asArray<DsSku>(
    (result.ae_item_sku_info_dtos as { ae_item_sku_info_d_t_o?: unknown } | undefined)?.ae_item_sku_info_d_t_o
  );

  const variantes: AliExpressVariant[] = skus
    .filter((sku) => sku.sku_id !== undefined && sku.sku_id !== null && String(sku.sku_id) !== "")
    .map((sku) => {
      const enEuros = !sku.currency_code || sku.currency_code.toUpperCase() === "EUR";
      const prixRemise = toPrice(sku.offer_sale_price);
      const prixPlein = toPrice(sku.sku_price);
      const attributs: Record<string, string> = {};
      let image: string | null = null;
      for (const prop of asArray<DsSkuProperty>(sku.ae_sku_property_dtos?.ae_sku_property_d_t_o)) {
        const nom = prop.sku_property_name?.trim();
        const valeur = (prop.property_value_definition_name || prop.sku_property_value)?.trim();
        if (nom && valeur) attributs[nom] = valeur;
        if (!image && prop.sku_image) image = prop.sku_image;
      }
      const prix = enEuros ? prixRemise ?? prixPlein : null;
      return {
        sku_id: String(sku.sku_id),
        prix,
        prix_original: enEuros && prixPlein !== null && prix !== null && prixPlein > prix ? prixPlein : null,
        attributs,
        image,
        stock: typeof sku.sku_available_stock === "number" ? sku.sku_available_stock : null,
      };
    });

  if (variantes.length > 0) return { ok: true, titre, images, variantes };

  let detail: AliExpressProduct | null;
  try {
    detail = await getProductDetail(productId, {
      targetCurrency: "EUR",
      shipToCountry: "FR",
      targetLanguage: "FR",
      fields: "product_id,product_title,product_main_image_url,target_sale_price,target_original_price,sku_id",
    });
  } catch {
    return { ok: false, error: "api_error" };
  }
  const prix = toPrice(detail?.target_sale_price);
  const prixOriginal = toPrice(detail?.target_original_price);
  return {
    ok: true,
    titre: titre || detail?.product_title || "",
    images: images.length > 0 ? images : detail?.product_main_image_url ? [detail.product_main_image_url] : [],
    variantes: [
      {
        sku_id: detail?.sku_id ? String(detail.sku_id) : "default",
        prix,
        prix_original: prixOriginal !== null && prix !== null && prixOriginal > prix ? prixOriginal : null,
        attributs: {},
        image: null,
        stock: null,
      },
    ],
  };
}
