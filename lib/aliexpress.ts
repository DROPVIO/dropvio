import crypto from "crypto";

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

async function callApi(method: string, params: Record<string, string>): Promise<Record<string, unknown>> {
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
  commission_rate?: string;
  evaluate_rate?: string;
  lastest_volume?: number;
  product_detail_url?: string;
  promotion_link?: string;
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

  try {
    const data = await callApi("aliexpress.affiliate.productdetail.get", params);
    const resp = (data?.aliexpress_affiliate_productdetail_get_response as Record<string, unknown>)
      ?.resp_result as Record<string, unknown>;
    if ((resp?.resp_code as number) !== 200) return null;
    const list =
      ((resp?.result as Record<string, unknown>)?.products as Record<string, unknown>)
        ?.product as AliExpressProduct[] ?? [];
    return list[0] ?? null;
  } catch {
    return null;
  }
}
