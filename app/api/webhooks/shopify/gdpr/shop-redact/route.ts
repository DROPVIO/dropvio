import { NextRequest, NextResponse } from "next/server";
import { readShopifyWebhook } from "@/lib/shopify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type ShopRedactPayload = { shop_domain?: string };

// Webhook GDPR obligatoire (shop/redact) — envoyé ~48h après désinstallation : contrairement
// aux deux autres webhooks de conformité, il y a ici de vraies données à supprimer
// (shopify_connections + shopify_incidents + commandes_a_preparer de cette boutique).
// app/uninstalled avait déjà invalidé le token (voir /api/webhooks/shopify) ; ce webhook va
// plus loin et efface les lignes elles-mêmes.
export async function POST(request: NextRequest) {
  const result = await readShopifyWebhook(request);
  if (!result.ok) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const shopDomain = (result.payload as ShopRedactPayload).shop_domain ?? result.shopDomain;
  if (!shopDomain) {
    return NextResponse.json({ ok: true });
  }

  const admin = createSupabaseAdminClient();
  const { data: connection } = await admin
    .from("shopify_connections")
    .select("user_id")
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (connection) {
    await admin.from("shopify_incidents").delete().eq("user_id", connection.user_id);
    await admin.from("commandes_a_preparer").delete().eq("user_id", connection.user_id);
    await admin.from("shopify_connections").delete().eq("shop_domain", shopDomain);
  }

  return NextResponse.json({ ok: true });
}
