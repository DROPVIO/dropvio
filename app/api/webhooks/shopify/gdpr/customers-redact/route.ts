import { NextRequest, NextResponse } from "next/server";
import { readShopifyWebhook } from "@/lib/shopify";

// Webhook GDPR obligatoire (customers/redact) — demande de suppression des données d'un
// client précis. Même raisonnement que customers-data-request : shopify_incidents ne
// contient aucune donnée personnelle client, donc rien à supprimer par client. Accusé de
// réception obligatoire (200) même sans action.
export async function POST(request: NextRequest) {
  const result = await readShopifyWebhook(request);
  if (!result.ok) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  console.log("[gdpr/customers-redact] Reçu, aucune donnée personnelle détenue à supprimer.", result.payload);
  return NextResponse.json({ ok: true });
}
