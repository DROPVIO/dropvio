import { NextRequest, NextResponse } from "next/server";
import { readShopifyWebhook } from "@/lib/shopify";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type CustomersRedactPayload = { shop_domain?: string; orders_to_redact?: number[] };

// Webhook GDPR obligatoire (customers/redact) — demande de suppression des données d'un
// client précis. Depuis l'ajout de commandes_a_preparer (voir 030_commandes_aliexpress.sql),
// Dropvio détient réellement de la PII (adresse, nom, téléphone) pour les commandes listées
// dans orders_to_redact — on efface ces champs (sans supprimer la ligne elle-même : les
// infos produit/lien AliExpress restent utiles au marchand). shopify_incidents, lui, ne
// contient toujours aucune PII, rien à faire de ce côté.
export async function POST(request: NextRequest) {
  const result = await readShopifyWebhook(request);
  if (!result.ok) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const { shop_domain, orders_to_redact } = result.payload as CustomersRedactPayload;
  const shopDomain = shop_domain ?? result.shopDomain;

  if (shopDomain && orders_to_redact && orders_to_redact.length > 0) {
    const admin = createSupabaseAdminClient();
    const { data: connection } = await admin
      .from("shopify_connections")
      .select("user_id")
      .eq("shop_domain", shopDomain)
      .maybeSingle();

    if (connection) {
      await admin
        .from("commandes_a_preparer")
        .update({ adresse_livraison: null, client_nom: null, client_telephone: null, updated_at: new Date().toISOString() })
        .eq("user_id", connection.user_id)
        .in("shopify_order_id", orders_to_redact);
    }
  }

  return NextResponse.json({ ok: true });
}
