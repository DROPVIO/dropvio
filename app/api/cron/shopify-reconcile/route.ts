import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { shopifyFetch, ShopifyApiError } from "@/lib/shopify";
import { decryptSecret } from "@/lib/crypto";

// Rattrapage périodique : repasse sur les commandes récentes de chaque boutique connectée
// pour combler un webhook manqué (les upserts sont idempotents via la contrainte unique
// (user_id, type, shopify_object_id) sur shopify_incidents — aucun risque de doublon avec
// ce que les webhooks ont déjà inséré).
//
// Même pattern d'auth que /api/cron/snapshot-produits : Vercel Cron appelle avec
// `Authorization: Bearer $CRON_SECRET` (voir vercel.json). CRON_SECRET est présent dans
// .env.local (dev) mais sa présence en production Vercel n'a PAS été vérifiée depuis cet
// environnement (pas d'accès à `vercel env ls` ici) — le garde-fou ci-dessous répond 500
// avec un message explicite plutôt que de planter silencieusement si elle manque.
const LOOKBACK_DAYS = 3;

function isAuthorized(request: NextRequest, secret: string): boolean {
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type Connection = {
  user_id: string;
  shop_domain: string;
  access_token_encrypted: string;
  disputes_scope_granted: boolean;
};

type OrderRow = { id: number; financial_status?: string; total_price?: string; currency?: string };
type RefundRow = {
  id: number;
  order_id: number;
  created_at?: string;
  transactions?: { amount?: string; currency?: string }[];
};
type DisputeRow = { id: number; order_id: number; amount?: string; currency?: string; status?: string };

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/shopify-reconcile] CRON_SECRET non configuré — requête refusée.");
    return NextResponse.json({ error: "CRON_SECRET non configuré" }, { status: 500 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data: connections, error } = await admin
    .from("shopify_connections")
    .select("user_id, shop_domain, access_token_encrypted, disputes_scope_granted")
    .not("access_token_encrypted", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();
  const nowIso = new Date().toISOString();
  let reconciled = 0;
  const failures: string[] = [];

  for (const conn of (connections ?? []) as Connection[]) {
    try {
      const accessToken = decryptSecret(conn.access_token_encrypted);

      const ordersRes = await shopifyFetch<{ orders: OrderRow[] }>(
        conn.shop_domain,
        accessToken,
        `/orders.json?status=any&updated_at_min=${encodeURIComponent(since)}&limit=100`
      );

      for (const order of ordersRes.orders ?? []) {
        if (order.financial_status !== "refunded" && order.financial_status !== "partially_refunded") {
          continue;
        }

        await admin.from("shopify_incidents").upsert(
          {
            user_id: conn.user_id,
            shopify_order_id: order.id,
            shopify_object_id: order.id,
            type: "return",
            statut: order.financial_status,
            montant: order.total_price ? parseFloat(order.total_price) : null,
            devise: order.currency ?? null,
            source: "shopify_sync",
            raw_payload: { order_id: order.id, statut: order.financial_status },
            updated_at: nowIso,
          },
          { onConflict: "user_id,type,shopify_object_id" }
        );

        const refundsRes = await shopifyFetch<{ refunds: RefundRow[] }>(
          conn.shop_domain,
          accessToken,
          `/orders/${order.id}/refunds.json`
        );

        for (const refund of refundsRes.refunds ?? []) {
          const montant = (refund.transactions ?? []).reduce((sum, t) => sum + (parseFloat(t.amount ?? "0") || 0), 0);
          const devise = refund.transactions?.[0]?.currency ?? null;

          await admin.from("shopify_incidents").upsert(
            {
              user_id: conn.user_id,
              shopify_order_id: refund.order_id,
              shopify_object_id: refund.id,
              type: "refund",
              statut: "completed",
              montant,
              devise,
              source: "shopify_sync",
              raw_payload: {
                order_id: refund.order_id,
                refund_id: refund.id,
                montant,
                devise,
                created_at: refund.created_at ?? null,
              },
              updated_at: nowIso,
            },
            { onConflict: "user_id,type,shopify_object_id" }
          );
        }
      }

      // Best-effort, première page uniquement : la Disputes REST API ne supporte pas de
      // filtre updated_at_min propre. L'idempotence de l'upsert rend ça sûr à répéter tous
      // les jours, mais un litige qui sortirait de la première page entre deux exécutions
      // ne serait rattrapé qu'au prochain webhook disputes/create ou disputes/update.
      if (conn.disputes_scope_granted) {
        const disputesRes = await shopifyFetch<{ disputes: DisputeRow[] }>(
          conn.shop_domain,
          accessToken,
          "/shopify_payments/disputes.json"
        );

        for (const dispute of disputesRes.disputes ?? []) {
          await admin.from("shopify_incidents").upsert(
            {
              user_id: conn.user_id,
              shopify_order_id: dispute.order_id,
              shopify_object_id: dispute.id,
              type: "dispute",
              statut: dispute.status ?? null,
              montant: dispute.amount ? parseFloat(dispute.amount) : null,
              devise: dispute.currency ?? null,
              source: "shopify_sync",
              raw_payload: { order_id: dispute.order_id, dispute_id: dispute.id, statut: dispute.status ?? null },
              updated_at: nowIso,
            },
            { onConflict: "user_id,type,shopify_object_id" }
          );
        }
      }

      reconciled++;
    } catch (err) {
      const msg = err instanceof ShopifyApiError ? err.message : "Erreur inconnue";
      console.error(`[cron/shopify-reconcile] Échec pour ${conn.shop_domain}:`, msg);
      failures.push(conn.shop_domain);
    }
  }

  return NextResponse.json({ ok: true, reconciled, failed: failures });
}
