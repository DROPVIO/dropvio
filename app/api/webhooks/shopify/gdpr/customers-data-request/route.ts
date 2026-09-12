import { NextRequest, NextResponse } from "next/server";
import { readShopifyWebhook } from "@/lib/shopify";

// Webhook GDPR obligatoire (customers/data_request) — un client demande les données que
// l'app détient sur lui. shopify_incidents ne contient volontairement aucune PII (voir
// 019_shopify_incidents.sql), mais depuis l'ajout de commandes_a_preparer
// (030_commandes_aliexpress.sql) Dropvio détient bien nom/adresse/téléphone pour les
// commandes passées par des boutiques utilisant la préparation d'achat AliExpress.
// TODO(conformité) : ce endpoint accuse toujours réception sans constituer ni transmettre
// l'export réel de ces données — à traiter avant d'ouvrir cette fonctionnalité à grande
// échelle (voir shopify-dropvio-orders-aliexpress, point PII). Réponse 200 obligatoire dans
// tous les cas.
export async function POST(request: NextRequest) {
  const result = await readShopifyWebhook(request);
  if (!result.ok) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  console.log("[gdpr/customers-data-request] Reçu — export manuel requis si des commandes_a_preparer existent.", result.payload);
  return NextResponse.json({ ok: true });
}
