import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, getMonthlyUsage, incrementMonthlyUsage } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { AliExpressApiError, getProductDetail, queryProducts, type AliExpressProduct } from "@/lib/aliexpress";

const CANDIDATE_FIELDS =
  "product_id,product_title,product_main_image_url,target_sale_price,target_sale_price_currency,evaluate_rate,lastest_volume,shop_id,shop_url,shop_name,first_level_category_id,second_level_category_id,product_detail_url,promotion_link";

const PRICE_BAND = 0.3; // ±30% autour du prix d'origine (target_sale_price, EUR)
const MAX_RESULTS = 5;
const CANDIDATES_PER_KEYWORD = 50;
const SIMILARITY_THRESHOLD = 0.2;

const STOPWORDS = new Set([
  "the", "a", "an", "for", "with", "and", "of", "in", "to", "on", "by",
  "set", "kit", "new", "pcs", "pc", "or", "from", "your", "this", "that",
]);

function significantWords(title: string): string[] {
  return Array.from(
    new Set(
      title
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
    )
  );
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Deux variantes de largeur différente sur le même titre — pas un seul mot-clé exact —
// pour couvrir un maximum de vendeurs plutôt que de rester collé à notre propre libellé produit.
function buildKeywordVariants(title: string): string[] {
  const words = significantWords(title);
  const broad = words.slice(0, 6).join(" ");
  const narrow = words.slice(0, 3).join(" ");
  return Array.from(new Set([broad, narrow].filter((k) => k.length > 0)));
}

// evaluate_rate est une note produit (pas boutique — non exposée par cette API, voir la
// discussion de conception) : proxy de fiabilité le plus proche disponible, pondéré par le
// volume de commandes (log-scale, plafonné à 1000 pour ne pas laisser un best-seller écraser
// tout le reste du score).
function reliabilityScore(p: AliExpressProduct): number {
  const rate = parseFloat((p.evaluate_rate ?? "0").replace("%", "")) / 100;
  const volume = p.lastest_volume ?? 0;
  const volumeScore = Math.min(1, Math.log10(volume + 1) / Math.log10(1000));
  return 0.7 * (isNaN(rate) ? 0 : rate) + 0.3 * volumeScore;
}

export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserAndPlan();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir des alternatives.", code: "auth_required" }, { status: 401 });
  }

  // Garde-fou technique indépendant du quota métier mensuel : chaque appel déclenche 2
  // requêtes AliExpress (quota API affilié partagé par tout Dropvio) — évite qu'un compte
  // enchaîne des dizaines de recherches d'affilée même sous le plafond mensuel.
  if (!checkRateLimit(`finder-alternatives:${user.id}`, { max: 10, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de recherches en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
      { status: 429 }
    );
  }

  const maxParMois = PLAN_LIMITS[plan].alternativesParMoisMax;

  if (maxParMois === 0) {
    return NextResponse.json(
      { error: "Les alternatives fiables ne sont pas disponibles sur le plan Free.", code: "alternatives_plan" },
      { status: 403 }
    );
  }

  if (maxParMois !== null) {
    const used = await getMonthlyUsage(supabase, user.id, "finder_alternatives");
    if (used >= maxParMois) {
      return NextResponse.json(
        {
          error: `Tu as atteint la limite de ${maxParMois} recherches d'alternatives ce mois-ci sur le plan ${planLabel(plan)}. Passe Pro pour un accès illimité.`, code: "alternatives_limit", values: { max: maxParMois, plan: planLabel(plan) },
        },
        { status: 403 }
      );
    }
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  const nom = body?.nom;

  if (!id || typeof id !== "string" || !nom || typeof nom !== "string") {
    return NextResponse.json({ error: "id et nom sont requis.", code: "invalid_request" }, { status: 400 });
  }

  // Prix et catégorie du produit d'origine dérivés en direct (target_sale_price, EUR) plutôt
  // que de faire confiance à un prixFournisseur passé par le client : notre table "produits"
  // ne garantit pas une devise homogène (le seed n'a jamais fixé target_currency), donc c'est
  // la seule source fiable pour une comparaison de prix en EUR entre produits.
  let origin: AliExpressProduct | null;
  try {
    origin = await getProductDetail(id, { shipToCountry: "FR", targetCurrency: "EUR" });
  } catch (err) {
    if (!(err instanceof AliExpressApiError)) throw err;
    console.warn("[finder/alternatives]", err.message);
    return NextResponse.json(
      { error: "AliExpress n'a pas répondu. Réessaie dans un instant.", code: "aliexpress_api_error" },
      { status: 502 }
    );
  }

  if (!origin) {
    return NextResponse.json(
      { error: "Produit introuvable sur AliExpress (retiré ou identifiant invalide).", code: "aliexpress_product_not_found" },
      { status: 404 }
    );
  }

  const originTitle = origin.product_title ?? nom;
  const originWords = significantWords(originTitle);
  const originPrice = origin.target_sale_price ? parseFloat(origin.target_sale_price) : null;

  const keywordVariants = buildKeywordVariants(originTitle);

  const resultsByKeyword = await Promise.all(
    keywordVariants.map((kw) =>
      queryProducts(kw, {
        pageSize: CANDIDATES_PER_KEYWORD,
        sort: "SALE_PRICE_ASC",
        fields: CANDIDATE_FIELDS,
        shipToCountry: "FR",
        targetCurrency: "EUR",
      })
    )
  );

  const candidates = new Map<number, AliExpressProduct>();
  for (const list of resultsByKeyword) {
    for (const p of list) {
      if (p.product_id === origin.product_id) continue;
      if (!candidates.has(p.product_id)) candidates.set(p.product_id, p);
    }
  }

  type Scored = { product: AliExpressProduct; similarity: number; reliability: number; priceEUR: number };
  const scored: Scored[] = [];

  for (const p of candidates.values()) {
    // Catégorie identique obligatoire : seul signal "même type de produit" disponible via
    // cette API (pas de comparaison sémantique). Sans catégorie connue côté origine, on ne
    // peut pas garantir la pertinence des candidats — on exclut plutôt que de tout accepter.
    if (!origin.first_level_category_id || p.first_level_category_id !== origin.first_level_category_id) {
      continue;
    }

    const priceEUR = p.target_sale_price ? parseFloat(p.target_sale_price) : NaN;
    if (originPrice !== null) {
      if (isNaN(priceEUR)) continue;
      if (Math.abs(priceEUR - originPrice) / originPrice > PRICE_BAND) continue;
    }

    const titleScore = jaccard(originWords, significantWords(p.product_title ?? ""));
    const categoryBonus = p.second_level_category_id === origin.second_level_category_id ? 1 : 0.7;
    const similarity = 0.6 * titleScore + 0.4 * categoryBonus;

    if (similarity < SIMILARITY_THRESHOLD) continue;

    scored.push({ product: p, similarity, reliability: reliabilityScore(p), priceEUR: isNaN(priceEUR) ? 0 : priceEUR });
  }

  // Un seul résultat par boutique (le mieux classé) — évite qu'un même vendeur monopolise le
  // top 5 avec plusieurs variantes du même produit.
  const compositeOf = (s: Scored) => 0.5 * s.reliability + 0.5 * s.similarity;
  const bestPerShop = new Map<number, Scored>();
  for (const s of scored) {
    const shopId = s.product.shop_id ?? -1;
    const existing = bestPerShop.get(shopId);
    if (!existing || compositeOf(s) > compositeOf(existing)) bestPerShop.set(shopId, s);
  }

  const alternatives = Array.from(bestPerShop.values())
    .sort((a, b) => compositeOf(b) - compositeOf(a))
    .slice(0, MAX_RESULTS)
    .map((s) => ({
      productId: String(s.product.product_id),
      title: s.product.product_title,
      image: s.product.product_main_image_url,
      shopId: s.product.shop_id ?? null,
      shopUrl: s.product.shop_url ?? null,
      shopName: s.product.shop_name ?? null,
      evaluateRate: s.product.evaluate_rate ?? null,
      orders: s.product.lastest_volume ?? 0,
      priceEUR: s.priceEUR,
      similarityScore: Math.round(s.similarity * 100) / 100,
      reliabilityScore: Math.round(s.reliability * 100) / 100,
      link: s.product.promotion_link || s.product.product_detail_url || null,
    }));

  await incrementMonthlyUsage(supabase, user.id, "finder_alternatives");

  return NextResponse.json({ alternatives });
}
