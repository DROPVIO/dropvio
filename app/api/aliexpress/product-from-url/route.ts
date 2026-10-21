import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getProductDetail } from "@/lib/aliexpress";
import { isUrlAllowed, normalizeUrl } from "@/lib/ssrf-guard";

// /item/1005….html ou /i/1005….html, sur tout sous-domaine (fr., m., www.) et tout domaine
// AliExpress (aliexpress.com, aliexpress.us…). Les paramètres (?sku_id, pdp_npi…) sont ignorés.
const PRODUCT_ID_REGEX = /\/(?:item|i)\/(\d{6,})/;
const MAX_REDIRECTS = 3;

// Liste fermée plutôt que « aliexpress.<n'importe quoi> » : un motif ouvert accepterait
// aussi aliexpress.com.domaine-pirate.com.
function isAliExpressHost(hostname: string): boolean {
  return /(^|\.)aliexpress\.(com|us|ru)$/i.test(hostname);
}

function extractProductId(url: string): string | null {
  const match = url.match(PRODUCT_ID_REGEX);
  return match ? match[1] : null;
}

// Liens courts (s.click.aliexpress.com/e/…, a.aliexpress.com/_…) : on suit les redirections
// une par une (redirect: "manual") pour vérifier chaque destination avant de la contacter —
// jamais hors d'un domaine *.aliexpress.*, jamais vers une IP privée (lib/ssrf-guard.ts).
async function resolveShortLink(rawUrl: string): Promise<string | null> {
  let current = rawUrl;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (!isAliExpressHost(parsed.hostname) || !(await isUrlAllowed(current))) return null;

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
  const productId = extractProductId(normalized) ?? (await resolveShortLink(normalized));
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
      prix_vente: typeof data.prixVente === "number" ? data.prixVente : null,
      prix_original: null,
      rating: data.note ?? null,
      orders: data.commandes ?? null,
      niche: data.niche ?? null,
      aliexpress_product_id: productId,
      lien_aliexpress: lienAliExpress,
    });
  }

  // 2. Hors catalogue : API Affiliate. target_sale_price / target_original_price sont les
  // seuls prix convertis en EUR (sale_price et original_price restent dans la devise d'origine).
  const detail = await getProductDetail(productId, {
    targetCurrency: "EUR",
    shipToCountry: "FR",
    targetLanguage: "FR",
    fields:
      "product_id,product_title,product_main_image_url,target_sale_price,target_sale_price_currency,target_original_price,target_original_price_currency,evaluate_rate,lastest_volume",
  });

  if (!detail) {
    return NextResponse.json(
      {
        error: "Ce produit n'est pas accessible via l'API AliExpress. Remplis les champs à la main.",
        code: "aliexpress_not_in_affiliate",
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    source: "api",
    id: null,
    nom: detail.product_title,
    description: detail.product_title,
    image: detail.product_main_image_url ?? null,
    prix_vente: toNumber(detail.target_sale_price),
    prix_original: toNumber(detail.target_original_price),
    rating: detail.evaluate_rate ?? null,
    orders: detail.lastest_volume ?? null,
    niche: null,
    aliexpress_product_id: productId,
    lien_aliexpress: lienAliExpress,
  });
}
