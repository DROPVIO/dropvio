// Crée (ou retrouve) en MODE TEST les produits et prix Stripe de Dropvio, puis affiche les
// identifiants à copier dans .env.local :
//   npx tsx scripts/stripe-creer-prix-test.ts
// Refuse de tourner avec une clé live. Sans effet si les prix existent déjà : chaque prix porte
// une lookup_key stable, retrouvée avant toute création.
// Expert n'a pas de prix fixe (montant calculé selon la configuration, lib/expert-billing.ts).
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import Stripe from "stripe";
import { STRIPE_API_VERSION } from "../lib/stripe";
import { AGENCY_PRICE_EUR, PRO_PRICE_EUR } from "../lib/plan-limits";
import { FORMATION_PRIX } from "../lib/formation";

type Prix = {
  variable: string;
  lookupKey: string;
  produit: string;
  montantEur: number;
  recurrent: boolean;
};

const PRIX: Prix[] = [
  { variable: "STRIPE_PRICE_PRO", lookupKey: "dropvio_test_pro_mensuel", produit: "Dropvio Pro", montantEur: PRO_PRICE_EUR, recurrent: true },
  { variable: "STRIPE_PRICE_AGENCY", lookupKey: "dropvio_test_agency_mensuel", produit: "Dropvio Agency", montantEur: AGENCY_PRICE_EUR, recurrent: true },
  { variable: "STRIPE_PRICE_FORMATION_COURTE", lookupKey: "dropvio_test_formation_courte", produit: "Formation dropshipping — version courte", montantEur: FORMATION_PRIX.courte, recurrent: false },
  { variable: "STRIPE_PRICE_FORMATION_LONGUE", lookupKey: "dropvio_test_formation_longue", produit: "Formation dropshipping — version longue", montantEur: FORMATION_PRIX.longue, recurrent: false },
  { variable: "STRIPE_PRICE_FORMATION_BUNDLE", lookupKey: "dropvio_test_formation_bundle", produit: "Formation dropshipping — bundle", montantEur: FORMATION_PRIX.bundle, recurrent: false },
];

async function main() {
  const cle = process.env.STRIPE_SECRET_KEY ?? "";
  if (!cle.startsWith("sk_test_") && !cle.startsWith("rk_test_")) {
    console.error("STRIPE_SECRET_KEY doit être une clé de TEST (sk_test_…) : rien n'a été créé.");
    process.exit(1);
  }
  const stripe = new Stripe(cle, { apiVersion: STRIPE_API_VERSION });

  const lignes: string[] = [];
  for (const p of PRIX) {
    const existants = await stripe.prices.list({ lookup_keys: [p.lookupKey], limit: 1 });
    let prix = existants.data[0];
    if (!prix) {
      const produit = await stripe.products.create({ name: p.produit, metadata: { dropvio: "test" } });
      prix = await stripe.prices.create({
        product: produit.id,
        currency: "eur",
        unit_amount: Math.round(p.montantEur * 100),
        lookup_key: p.lookupKey,
        ...(p.recurrent ? { recurring: { interval: "month" as const } } : {}),
      });
      console.log(`Créé : ${p.produit} — ${p.montantEur} €${p.recurrent ? "/mois" : ""}`);
    } else {
      console.log(`Déjà présent : ${p.produit} — ${(prix.unit_amount ?? 0) / 100} €`);
    }
    lignes.push(`${p.variable}=${prix.id}`);
  }

  console.log("\nÀ copier dans .env.local :\n" + lignes.join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
