import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";

const BLOCKED_HOSTNAMES = new Set(["localhost", "0.0.0.0", "::1", "::"]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
  if (a === 192 && b === 168) return true;           // 192.168.0.0/16
  if (a === 127) return true;                        // 127.0.0.0/8 (loopback)
  if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (incl. métadonnées cloud 169.254.169.254)
  if (a === 0) return true;                          // 0.0.0.0/8
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;               // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7 (unique local)
  if (lower.startsWith("fe80")) return true;                        // fe80::/10 (link-local)
  if (lower.startsWith("::ffff:")) {
    // Adresse IPv4-mappée en IPv6 — on revérifie la partie IPv4.
    return isPrivateIPv4(lower.replace("::ffff:", ""));
  }
  return false;
}

// Valide le protocole puis résout le hostname pour bloquer tout ce qui pointe
// vers une IP privée/interne — empêche le serveur d'être utilisé comme proxy
// SSRF vers le réseau local ou les métadonnées cloud (AWS/GCP).
async function isUrlAllowed(rawUrl: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }

  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return false;
  }

  const literalFamily = isIP(hostname);
  if (literalFamily === 4) {
    return !isPrivateIPv4(hostname);
  }
  if (literalFamily === 6) {
    return !isPrivateIPv6(hostname);
  }

  try {
    const results = await lookup(hostname, { all: true });
    for (const { address, family } of results) {
      if (family === 4 && isPrivateIPv4(address)) return false;
      if (family === 6 && isPrivateIPv6(address)) return false;
    }
  } catch {
    return false;
  }

  return true;
}

export async function GET(request: Request) {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return Response.json({ error: "Connecte-toi pour utiliser le spy tool." }, { status: 401 });
  }

  if (!checkRateLimit(`spy:${user.id}`, { max: 10, windowMs: 60_000 })) {
    return Response.json(
      { error: "Trop de requêtes. Réessaie dans une minute." },
      { status: 429 }
    );
  }

  const { searchParams } = new URL(request.url);
  let storeUrl = searchParams.get("url");

  if (!storeUrl) {
    return Response.json({ error: "URL manquante" }, { status: 400 });
  }

  storeUrl = storeUrl.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(storeUrl)) {
    storeUrl = "https://" + storeUrl;
  }

  if (!(await isUrlAllowed(storeUrl))) {
    return Response.json({ error: "URL non autorisée" }, { status: 400 });
  }

  let data: { products: Array<{ variants: Array<{ price: string }> }> };

  try {
    const res = await fetch(`${storeUrl}/products.json?limit=250`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) {
      return Response.json(
        { error: `Impossible d'accéder à la boutique (HTTP ${res.status})` },
        { status: 502 }
      );
    }

    data = await res.json();
  } catch {
    return Response.json(
      { error: "Boutique inaccessible ou URL invalide" },
      { status: 502 }
    );
  }

  if (!Array.isArray(data?.products)) {
    return Response.json(
      { error: "Ce site ne semble pas être une boutique Shopify" },
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
