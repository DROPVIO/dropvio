import { NextRequest, NextResponse } from "next/server";
import { readShopifyWebhook } from "@/lib/shopify";

// Webhook GDPR obligatoire (customers/data_request) — un client demande les données que
// l'app détient sur lui. Dropvio ne stocke volontairement aucune donnée personnelle client
// (nom, email, adresse) dans shopify_incidents : uniquement des identifiants de commande et
// des montants/statuts financiers (voir 019_shopify_incidents.sql). Rien à fournir ; on
// accuse simplement réception, réponse 200 obligatoire quel que soit le contenu détenu.
export async function POST(request: NextRequest) {
  const result = await readShopifyWebhook(request);
  if (!result.ok) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  console.log("[gdpr/customers-data-request] Reçu, aucune donnée personnelle détenue.", result.payload);
  return NextResponse.json({ ok: true });
}
