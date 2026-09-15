import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isShopifyConfigured } from "@/lib/shopify";

const INCIDENTS_LOOKBACK_DAYS = 30;

// Statut de connexion pour l'UI — ne renvoie jamais l'access_token (même chiffré).
export async function GET() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("shopify_connections")
    .select("shop_domain, shop_name, access_token_encrypted, disputes_scope_granted, fulfillment_scope_granted, connected_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // connected = token chiffré présent et utilisable. reconnectRequired = une ligne existe
  // (boutique déjà liée à ce compte à un moment) mais sans token exploitable — soit une
  // connexion antérieure à la migration 018 (token en clair, jamais rechiffré), soit une
  // désinstallation détectée par le webhook app/uninstalled (voir /api/webhooks/shopify).
  const connected = Boolean(data?.access_token_encrypted);
  const reconnectRequired = Boolean(data) && !data!.access_token_encrypted;

  let incidentsSummary: { refunds30d: number; disputes30d: number | null } | null = null;

  if (connected) {
    const since = new Date(Date.now() - INCIDENTS_LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
    const { data: incidents } = await admin
      .from("shopify_incidents")
      .select("type")
      .eq("user_id", user.id)
      .gte("created_at", since);

    const rows = incidents ?? [];
    const refunds30d = rows.filter((i) => i.type === "refund" || i.type === "return").length;
    // null (pas 0) tant que le scope disputes n'est pas accordé — "non disponible" côté UI,
    // jamais confondu avec "zéro litige".
    const disputes30d = data!.disputes_scope_granted ? rows.filter((i) => i.type === "dispute").length : null;

    incidentsSummary = { refunds30d, disputes30d };
  }

  return NextResponse.json({
    configured: isShopifyConfigured(),
    connected,
    reconnectRequired,
    shop_domain: data?.shop_domain ?? null,
    shop_name: data?.shop_name ?? null,
    connected_at: data?.connected_at ?? null,
    disputesScopeGranted: data?.disputes_scope_granted ?? false,
    fulfillmentScopeGranted: data?.fulfillment_scope_granted ?? false,
    incidentsSummary,
  });
}
