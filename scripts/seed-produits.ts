import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const APP_KEY = process.env.ALIEXPRESS_APP_KEY!;
const APP_SECRET = process.env.ALIEXPRESS_APP_SECRET!;

const NICHE_KEYWORDS: Record<string, string[]> = {
  fitness:  ["resistance bands fitness gym", "gym equipment", "workout accessories", "sport bands"],
  beaute:   ["skincare serum", "face mask beauty", "makeup brush set", "nail art kit"],
  animaux:  ["cat toys", "dog collar", "pet bed", "aquarium accessories"],
  gaming:   ["gaming accessories rgb"],
  bureau:   ["home office desk accessories"],
  cuisine:  ["kitchen gadgets cooking tools"],
  bebe:     ["baby toys", "baby monitor", "stroller accessories", "baby clothing"],
  voiture:  ["car accessories auto", "car gadgets", "auto accessories", "car interior"],
  jardin:   ["garden tools plants"],
  yoga:     ["yoga mat meditation wellness", "yoga equipment", "meditation accessories", "pilates gear"],
  tech:     ["gadgets electronics smart", "smart gadgets", "usb accessories", "electronic gadgets"],
  led:      ["led lights rgb decoration", "rgb lights", "led strip", "neon lights"],
  outdoor:  ["camping outdoor hiking", "camping gear", "hiking accessories", "outdoor tools"],
  mode:     ["fashion accessories jewelry", "fashion jewelry", "clothing accessories", "women accessories"],
  maison:   ["home decor interior"],
  voyage:   ["travel accessories luggage"],
  sport:    ["sport equipment fitness"],
  ecologie: ["eco friendly sustainable"],
  photo:    ["camera accessories photography", "camera accessories", "phone camera", "photography gear"],
  selfcare: ["self care wellness beauty", "skincare tools", "beauty accessories", "personal care"],
};

const PAGES_PER_NICHE = 50;
const BATCH_SIZE = 3;   // pages fetched in parallel per batch
const DELAY_MS = 1000;  // ms between batches (rate-limit safety)

type Product = {
  id: string;
  nom: string;
  image: string;
  prixFournisseur: number;
  prixVente: number;
  marge: number;
  commandes: number;
  note: number;
  commission: string;
  lienAliExpress: string;
  niche: string;
};

function generateSign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let signStr = secret;
  for (const key of sortedKeys) signStr += key + params[key];
  signStr += secret;
  return crypto.createHash("md5").update(signStr).digest("hex").toUpperCase();
}

function buildQS(keywords: string, pageNo: number): string {
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);

  const params: Record<string, string> = {
    app_key:      APP_KEY,
    method:       "aliexpress.affiliate.product.query",
    timestamp,
    sign_method:  "md5",
    v:            "2.0",
    format:       "json",
    keywords,
    tracking_id:  "default",
    page_no:      String(pageNo),
    page_size:    "20",
    sort:         "SALE_PRICE_ASC",
    fields:
      "product_id,product_title,product_main_image_url,sale_price,original_price,commission_rate,evaluate_rate,product_detail_url,lastest_volume",
  };

  params["sign"] = generateSign(params, APP_SECRET);

  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

const PSYCHOLOGICAL_TIERS = [
  9.99, 14.99, 19.99, 24.99, 29.99, 39.99, 49.99, 59.99, 79.99,
  99.99, 129.99, 149.99, 199.99, 249.99, 299.99, 399.99, 499.99,
];

function calculatePrixVente(prixFournisseur: number): number {
  const minPrice = prixFournisseur * 2;
  const tier = PSYCHOLOGICAL_TIERS.find((t) => t >= minPrice);
  if (tier !== undefined) return tier;
  return Math.ceil(minPrice / 10) * 10 - 0.01;
}

async function fetchPage(keywords: string, niche: string, pageNo: number): Promise<Product[]> {
  try {
    const res = await fetch(`https://api-sg.aliexpress.com/sync?${buildQS(keywords, pageNo)}`);
    const data = await res.json() as Record<string, unknown>;

    const resp = (data?.aliexpress_affiliate_product_query_response as Record<string, unknown>)
      ?.resp_result as Record<string, unknown>;

    if ((resp?.resp_code as number) !== 200) return [];

    const list =
      ((resp?.result as Record<string, unknown>)?.products as Record<string, unknown>)
        ?.product as Record<string, string>[] ?? [];

    return list.map((p) => {
      const prixFournisseur = parseFloat(p.sale_price);
      const prixVente       = calculatePrixVente(prixFournisseur);
      const marge           = Math.round(((prixVente - prixFournisseur) / prixVente) * 100);
      return {
        id:             p.product_id,
        nom:            p.product_title,
        image:          p.product_main_image_url,
        prixFournisseur,
        prixVente,
        marge,
        commandes:      parseInt(p.lastest_volume) || 0,
        note:           parseFloat(p.evaluate_rate) / 20 || 4.5,
        commission:     p.commission_rate,
        lienAliExpress: p.product_detail_url,
        niche,
      };
    });
  } catch {
    return [];
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function seedKeyword(niche: string, keywords: string): Promise<number> {
  let total = 0;
  const numBatches = Math.ceil(PAGES_PER_NICHE / BATCH_SIZE);

  for (let b = 0; b < numBatches; b++) {
    const startPage = b * BATCH_SIZE + 1;
    const endPage = Math.min(startPage + BATCH_SIZE - 1, PAGES_PER_NICHE);
    const pageNums = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

    const results = await Promise.all(pageNums.map((p) => fetchPage(keywords, niche, p)));
    const products = results.flat();

    if (products.length === 0) {
      console.log(`  [${niche}] "${keywords}" page ${startPage}: aucun produit, arrêt.`);
      break;
    }

    const { error } = await supabase
      .from("produits")
      .upsert(products, { onConflict: "id" });

    if (error) {
      console.error(`  [${niche}] Erreur Supabase: ${error.message}`);
    } else {
      total += products.length;
      console.log(`  [${niche}] "${keywords}" pages ${startPage}–${endPage}: +${products.length} (cumul kw: ${total})`);
    }

    if (b < numBatches - 1) await sleep(DELAY_MS);
  }

  return total;
}

async function seedNiche(niche: string, keywordList: string[]): Promise<number> {
  let total = 0;
  for (const kw of keywordList) {
    console.log(`  → keyword: "${kw}"`);
    const count = await seedKeyword(niche, kw);
    total += count;
    console.log(`  [${niche}] "${kw}": ${count} produits insérés (niche total: ${total})`);
    await sleep(DELAY_MS);
  }
  return total;
}

async function main() {
  console.log("=== Seed AliExpress → Supabase ===\n");
  let grandTotal = 0;

  for (const [niche, keywordList] of Object.entries(NICHE_KEYWORDS)) {
    console.log(`\n▶ Niche : ${niche} (${keywordList.length} keywords)`);
    const count = await seedNiche(niche, keywordList);
    grandTotal += count;
    console.log(`  ✓ ${niche} : ${count} produits insérés`);
  }

  console.log(`\n✅ Terminé ! Total : ${grandTotal} produits dans Supabase.`);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
