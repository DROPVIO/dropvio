import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { AliExpressApiError, getProductDetail } from "@/lib/aliexpress";
import { isUrlAllowed, normalizeUrl } from "@/lib/ssrf-guard";
import { prixVenteSuggere } from "@/lib/calcul-marge";

// /item/1005….html ou /i/1005….html, sur tout sous-domaine (fr., m., www.) et tout domaine
// AliExpress (aliexpress.com, aliexpress.us…). Les paramètres (?sku_id, pdp_npi…) sont ignorés.
const PRODUCT_ID_REGEX = /\/(?:item|i)\/(\d{6,})/;
const MAX_REDIRECTS = 3;

// Domaines AliExpress acceptés, en test de suffixe exact : le domaine lui-même ou un
// sous-domaine (www., fr., m., s.click., a.). Jamais un motif ouvert, qui accepterait aussi
// aliexpress.com.domaine-pirate.com. aliexpress.ru exclu : entité séparée (AliExpress Russia).
const ALIEXPRESS_DOMAINS = ["aliexpress.com", "aliexpress.us"];

function isAliExpressHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return ALIEXPRESS_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function extractProductId(url: string): string | null {
  const match = url.match(PRODUCT_ID_REGEX);
  return match ? match[1] : null;
}

// Liens courts (s.click.aliexpress.com/e/…, a.aliexpress.com/_…) : on suit les redirections
// une par une (redirect: "manual"). Chaque URL — la saisie, chaque Location intermédiaire ET
// l'URL finale — passe deux contrôles avant tout usage : domaine AliExpress (allowlist
// ci-dessus) puis isUrlAllowed (lib/ssrf-guard.ts), qui résout le DNS et refuse toute IP
// privée/interne, y compris un domaine autorisé dont le DNS pointerait vers le réseau interne.
async function resolveShortLink(rawUrl: string): Promise<string | null> {
  let current = rawUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!isAliExpressHost(parsed.hostname)) return null;
    if (!(await isUrlAllowed(current))) return null;

    const id = extractProductId(parsed.pathname);
    if (id) return id;
    if (i === MAX_REDIRECTS) return null;

    let location: string | null;
    try {
      const res = await fetch(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(5000) });
      location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    } catch {
      return null;
    }
    if (!location) return null;
    current = new URL(location, current).toString();
  }
  return null;
}

function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  const { url } = await request.json();

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "URL manquante", code: "url_missing" }, { status: 400 });
  }

  const normalized = normalizeUrl(url);
  // URL directe : même allowlist de domaine que les liens courts (aucun appel réseau ici,
  // mais un lien d'un autre domaine, aliexpress.ru compris, n'est pas un produit accepté).
  let hostname = "";
  try {
    hostname = new URL(normalized).hostname;
  } catch {
    // URL illisible : rejetée ci-dessous comme invalide.
  }
  const productId = !isAliExpressHost(hostname)
    ? null
    : extractProductId(new URL(normalized).pathname) ?? (await resolveShortLink(normalized));
  if (!productId) {
    return NextResponse.json(
      { error: "URL AliExpress invalide. Format attendu : aliexpress.com/item/XXXXXXXXXX.html", code: "aliexpress_url_invalid" },
      { status: 400 }
    );
  }
  const lienAliExpress = `https://www.aliexpress.com/item/${productId}.html`;

  // 1. Catalogue Dropvio d'abord : rapide et ne consomme pas de quota API.
  const { data } = await supabase
    .from("produits")
    .select("id, nom, image, note, commandes, niche, prixVente")
    .ilike("lienAliExpress", `%${productId}%`)
    .limit(1)
    .maybeSingle();

  if (data) {
    return NextResponse.json({
      source: "catalogue",
      id: data.id,
      nom: data.nom,
      description: data.nom,
      image: data.image ?? null,
      // Catalogue : prixVente y est déjà un prix de vente suggéré (marge comprise). Pas de
      // prix_achat : prixFournisseur n'y a pas de devise garantie (seed sans target_currency).
      prix_vente: typeof data.prixVente === "number" ? data.prixVente : null,
      prix_original: null,
      prix_achat: null,
      rating: data.note ?? null,
      orders: data.commandes ?? null,
      niche: data.niche ?? null,
      aliexpress_product_id: productId,
      lien_aliexpress: lienAliExpress,
    });
  }

  // 2. Hors catalogue : API Affiliate. target_sale_price est le seul prix converti en EUR
  // (sale_price reste dans la devise d'origine).
  let detail: Awaited<ReturnType<typeof getProductDetail>>;
  try {
    detail = await getProductDetail(productId, {
      targetCurrency: "EUR",
      shipToCountry: "FR",
      targetLanguage: "FR",
      fields:
        "product_id,product_title,product_main_image_url,target_sale_price,target_sale_price_currency,evaluate_rate,lastest_volume",
    });
  } catch (err) {
    // Échec temporaire (réseau, quota, resp_code ≠ 200) : ne jamais le présenter comme un
    // produit inaccessible, l'utilisateur doit simplement réessayer.
    if (!(err instanceof AliExpressApiError)) throw err;
    console.warn("[aliexpress/product-from-url]", err.message);
    return NextResponse.json(
      { error: "AliExpress n'a pas répondu. Réessaie dans un instant.", code: "aliexpress_api_error" },
      { status: 502 }
    );
  }

  if (!detail) {
    return NextResponse.json(
      {
        error: "Ce produit n'est pas accessible via l'API AliExpress. Remplis les champs à la main.",
        code: "aliexpress_not_in_affiliate",
      },
      { status: 404 }
    );
  }

  // target_sale_price = coût AliExpress (prix_achat, privé) ; prix_vente proposé avec la marge
  // par défaut. prix_original (prix barré public) laissé vide : au marchand de le fixer.
  const prixAchat = toNumber(detail.target_sale_price);
  return NextResponse.json({
    source: "api",
    id: null,
    nom: detail.product_title,
    description: detail.product_title,
    image: detail.product_main_image_url ?? null,
    prix_vente: prixAchat !== null ? prixVenteSuggere(prixAchat) : null,
    prix_original: null,
    prix_achat: prixAchat,
    rating: detail.evaluate_rate ?? null,
    orders: detail.lastest_volume ?? null,
    niche: null,
    aliexpress_product_id: productId,
    lien_aliexpress: lienAliExpress,
  });
}
