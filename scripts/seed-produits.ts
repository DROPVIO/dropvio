import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { queryProducts } from "../lib/aliexpress";

// Script d'admin exécuté manuellement (jamais côté client) : la clé service role est
// nécessaire depuis que la migration 010 a retiré les policies RLS INSERT/UPDATE sur
// "produits" pour anon/authenticated (fermeture du catalogue en écriture publique).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  // Mots-clés utilisés lors du sourcing manuel de la niche Halloween (voir migration des
  // 5256 produits initiaux) — présents ici pour permettre un futur re-seed via ce même
  // script plutôt que de garder cette niche comme un cas à part.
  halloween: [
    "halloween costume adult", "witch costume women", "vampire costume adult", "halloween costume kids",
    "pirate costume halloween", "dog halloween costume", "cat halloween costume",
    "halloween party decoration", "halloween pumpkin decoration", "halloween skeleton decoration",
    "animatronic halloween decoration", "halloween animated prop", "halloween led lights",
    "halloween makeup kit", "fake blood halloween", "halloween witch hat", "halloween mask",
    "halloween wig", "halloween treat bag", "halloween banner", "halloween foil balloons",
    "halloween advent calendar", "gothic home decor", "halloween pillow cover",
  ],
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

// Bug corrigé (voir investigation) : sale_price reste dans la devise d'origine de chaque
// fiche (CNY la plupart du temps, non homogène entre produits) même avec target_currency
// demandé — c'est target_sale_price qui est le seul champ réellement converti. Vérifié
// empiriquement sur 4 produits : sale_price (CNY) valait ~7.6x target_sale_price (EUR), un
// facteur constant (le taux de change CNY→EUR du moment), pas une erreur aléatoire. Même
// approche que "Alternatives fiables" (app/api/finder/alternatives/route.ts), qui utilisait
// déjà correctement target_sale_price + target_currency=EUR.
const SEED_FIELDS =
  "product_id,product_title,product_main_image_url,target_sale_price,target_sale_price_currency,original_price,commission_rate,evaluate_rate,product_detail_url,lastest_volume";

const PSYCHOLOGICAL_TIERS = [
  9.99, 14.99, 19.99, 24.99, 29.99, 39.99, 49.99, 59.99, 79.99,
  99.99, 129.99, 149.99, 199.99, 249.99, 299.99, 399.99, 499.99,
];

// DÉSACTIVÉ pour ce run (voir investigation prix CNY/EUR) : ces seuils avaient été calibrés
// sur prixFournisseur lu depuis sale_price (devise d'origine, CNY la plupart du temps) traité
// à tort comme de l'EUR — un facteur ~7.6x d'inflation constaté empiriquement. Maintenant que
// prixFournisseur vient de target_sale_price (vraie conversion EUR), ces bornes filtreraient
// quasiment tout le catalogue (ex. échantillon réel observé : 0.02€–0.27€ pour ce type
// d'articles, contre un plancher à 2€ ici). Conservées commentées pour mémoire — à
// recalibrer sur les vrais prix EUR une fois ce run terminé et les données réelles observées,
// pas en divisant à l'aveugle par 7.6.
// const MIN_PRIX_FOURNISSEUR = 2;
// const MAX_PRIX_FOURNISSEUR = 30;
// const MAX_PRIX_FOURNISSEUR_PAR_NICHE: Partial<Record<string, number>> = {
//   yoga: 15,
//   beaute: 15,
//   selfcare: 15,
//   mode: 15,
// };

function calculatePrixVente(prixFournisseur: number): number {
  const minPrice = prixFournisseur * 2;
  const tier = PSYCHOLOGICAL_TIERS.find((t) => t >= minPrice);
  if (tier !== undefined) return tier;
  return Math.ceil(minPrice / 10) * 10 - 0.01;
}

async function fetchPage(keywords: string, niche: string, pageNo: number): Promise<Product[]> {
  const list = await queryProducts(keywords, {
    pageNo,
    pageSize: 20,
    sort: "SALE_PRICE_ASC",
    fields: SEED_FIELDS,
    targetCurrency: "EUR",
  });

  return list.map((p) => {
    // target_sale_price est le seul champ réellement converti dans targetCurrency — voir le
    // commentaire sur SEED_FIELDS ci-dessus.
    const prixFournisseur = parseFloat(p.target_sale_price ?? "");
    const prixVente       = calculatePrixVente(prixFournisseur);
    const marge           = Math.round(((prixVente - prixFournisseur) / prixVente) * 100);
    return {
      id:             String(p.product_id),
      nom:            p.product_title,
      image:          p.product_main_image_url,
      prixFournisseur,
      prixVente,
      marge,
      commandes:      p.lastest_volume ?? 0,
      note:           parseFloat(p.evaluate_rate ?? "") / 20 || 4.5,
      commission:     p.commission_rate ?? "",
      lienAliExpress: p.product_detail_url ?? "",
      niche,
    };
  });
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
    const rawFlat = results.flat();

    // Arrêt basé sur les résultats bruts de l'API (plus de pages disponibles), pas sur le
    // filtre prix ci-dessous — sinon une page dont tous les produits sont hors budget
    // couperait la pagination à tort avant d'avoir vu les pages suivantes.
    if (rawFlat.length === 0) {
      console.log(`  [${niche}] "${keywords}" page ${startPage}: aucun produit, arrêt.`);
      break;
    }

    const seen = new Map<string, Product>();
    for (const p of rawFlat) seen.set(p.id, p);

    // Filtre prix désactivé pour ce run (voir commentaire sur MIN/MAX_PRIX_FOURNISSEUR
    // plus haut) — tous les produits reçus sont importés tels quels, pour observer la vraie
    // distribution de prix EUR avant de redéfinir des seuils pertinents.
    const products = Array.from(seen.values());

    if (products.length === 0) {
      console.log(`  [${niche}] "${keywords}" pages ${startPage}–${endPage}: 0 produit reçu.`);
    } else {
      const { error } = await supabase
        .from("produits")
        .upsert(products, { onConflict: "id" });

      if (error) {
        console.error(`  [${niche}] Erreur Supabase: ${error.message}`);
      } else {
        total += products.length;
        console.log(`  [${niche}] "${keywords}" pages ${startPage}–${endPage}: +${products.length} (cumul kw: ${total})`);
      }
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
