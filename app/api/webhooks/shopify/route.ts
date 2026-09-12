import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { readShopifyWebhook, buildCommandeAPreparerRow, ShopifyOrderForPreparation } from "@/lib/shopify";

// Confirmation explicite (voir échange précédent) : la vérification HMAC lit le corps de
// la requête en texte brut AVANT tout parsing JSON — c'est readShopifyWebhook() dans
// lib/shopify.ts qui le garantit (request.text() -> HMAC sur cette chaîne exacte -> puis
// seulement JSON.parse). Cette route n'appelle jamais request.json() elle-même.

type RefundPayload = {
  id: number;
  order_id: number;
  created_at?: string;
  transactions?: { amount?: string; currency?: string }[];
};

type DisputePayload = {
  id: number;
  order_id: number;
  amount?: string;
  currency?: string;
  status?: string;
  type?: string;
};

type OrderPayload = {
  id: number;
  financial_status?: string;
  total_price?: string;
  currency?: string;
};

export async function POST(request: NextRequest) {
  const result = await readShopifyWebhook(request);
  if (!result.ok) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  const { payload, topic, shopDomain } = result;
  if (!shopDomain) {
    return NextResponse.json({ ok: true }); // rien à rattacher, pas une erreur
  }

  const admin = createSupabaseAdminClient();

  // Le token n'est plus valide dès la désinstallation — on invalide notre copie plutôt que
  // de continuer à l'utiliser. Repasse par le même état "reconnexion nécessaire" que les
  // connexions pré-migration 018 (voir /api/shopify/status).
  if (topic === "app/uninstalled") {
    await admin
      .from("shopify_connections")
      .update({ access_token_encrypted: null, disputes_scope_granted: false, updated_at: new Date().toISOString() })
      .eq("shop_domain", shopDomain);
    return NextResponse.json({ ok: true });
  }

  const { data: connection } = await admin
    .from("shopify_connections")
    .select("user_id")
    .eq("shop_domain", shopDomain)
    .maybeSingle();

  if (!connection) {
    return NextResponse.json({ ok: true }); // boutique inconnue ou déjà déconnectée, no-op
  }

  const nowIso = new Date().toISOString();

  switch (topic) {
    case "orders/create": {
      const row = await buildCommandeAPreparerRow(admin, connection.user_id, payload as ShopifyOrderForPreparation);
      await admin.from("commandes_a_preparer").upsert(row, { onConflict: "user_id,shopify_order_id" });
      break;
    }

    case "refunds/create": {
      const p = payload as RefundPayload;
      const montant = (p.transactions ?? []).reduce((sum, t) => sum + (parseFloat(t.amount ?? "0") || 0), 0);
      const devise = p.transactions?.[0]?.currency ?? null;

      await admin.from("shopify_incidents").upsert(
        {
          user_id: connection.user_id,
          shopify_order_id: p.order_id,
          shopify_object_id: p.id,
          type: "refund",
          statut: "completed",
          montant,
          devise,
          source: "shopify_sync",
          raw_payload: { order_id: p.order_id, refund_id: p.id, montant, devise, created_at: p.created_at ?? null },
          updated_at: nowIso,
        },
        { onConflict: "user_id,type,shopify_object_id" }
      );
      break;
    }

    case "disputes/create":
    case "disputes/update": {
      const p = payload as DisputePayload;

      await admin.from("shopify_incidents").upsert(
        {
          user_id: connection.user_id,
          shopify_order_id: p.order_id,
          shopify_object_id: p.id,
          type: "dispute",
          statut: p.status ?? null,
          montant: p.amount ? parseFloat(p.amount) : null,
          devise: p.currency ?? null,
          source: "shopify_sync",
          raw_payload: { order_id: p.order_id, dispute_id: p.id, statut: p.status ?? null, type: p.type ?? null },
          updated_at: nowIso,
        },
        { onConflict: "user_id,type,shopify_object_id" }
      );
      break;
    }

    // Signal de fallback, moins précis que refunds/create (pas de détail par transaction) :
    // capte les cas où le statut financier de la commande change sans qu'on ait forcément
    // reçu le refunds/create correspondant. Type "return" distinct de "refund" pour ne
    // jamais entrer en collision sur la contrainte unique(user_id, type, shopify_object_id).
    case "orders/updated": {
      const p = payload as OrderPayload;
      if (p.financial_status === "refunded" || p.financial_status === "partially_refunded") {
        await admin.from("shopify_incidents").upsert(
          {
            user_id: connection.user_id,
            shopify_order_id: p.id,
            shopify_object_id: p.id,
            type: "return",
            statut: p.financial_status,
            montant: p.total_price ? parseFloat(p.total_price) : null,
            devise: p.currency ?? null,
            source: "shopify_sync",
            raw_payload: { order_id: p.id, statut: p.financial_status },
            updated_at: nowIso,
          },
          { onConflict: "user_id,type,shopify_object_id" }
        );
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}
