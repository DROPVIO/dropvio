import { getServerUserAndPlan } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isUrlAllowed, normalizeUrl } from "@/lib/ssrf-guard";

export async function GET(request: Request) {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour utiliser le spy tool.", code: "auth_required" }, { status: 401 });
  }

  if (!checkRateLimit(`spy:${user.id}`, { max: 10, windowMs: 60_000 })) {
    return Response.json(
      { error: "Trop de requêtes. Réessaie dans une minute.", code: "rate_limit" },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  let storeUrl = searchParams.get("url");

  if (!storeUrl) {
    return Response.json({ error: "URL manquante", code: "url_missing" }, { status: 400 });
  }

  storeUrl = normalizeUrl(storeUrl);

  if (!(await isUrlAllowed(storeUrl))) {
    return Response.json({ error: "URL non autorisée", code: "url_forbidden" }, { status: 400 });
  }

  let data: { products: Array<{ variants: Array<{ price: string }> }> };

  try {
    const res = await fetch(`${storeUrl}/products.json?limit=250`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      return Response.json(
        { error: `Impossible d'accéder à la boutique (HTTP ${res.status})`, code: "spy_store_unreachable" },
        { status: 502 }
      );
    }

    data = await res.json();
  } catch {
    return Response.json(
      { error: "Boutique inaccessible ou URL invalide", code: "spy_store_unreachable" },
      { status: 502 }
    );
  }

  if (!Array.isArray(data?.products)) {
    return Response.json(
      { error: "Ce site ne semble pas être une boutique Shopify", code: "spy_not_shopify" },
      { status: 422 }
    );
  }

  const prices: number[] = [];
  for (const product of data.products) {
    for (const variant of product.variants ?? []) {
      const p = parseFloat(variant.price);
      if (!isNaN(p) && p > 0) prices.push(p);
    }
  }

  const productCount = data.products.length;

  if (prices.length === 0) {
    return Response.json({
      productCount,
      avgPrice: 0,
      minPrice: 0,
      maxPrice: 0,
      estimatedRevenue: 0,
    });
  }

  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const estimatedRevenue = 5000 * 0.025 * avgPrice;

  return Response.json({
    productCount,
    avgPrice: Math.round(avgPrice * 100) / 100,
    minPrice: Math.round(minPrice * 100) / 100,
    maxPrice: Math.round(maxPrice * 100) / 100,
    estimatedRevenue: Math.round(estimatedRevenue),
  });
}
