"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ShopifyStatus = {
  connected: boolean;
  reconnectRequired: boolean;
  shop_domain: string | null;
  shop_name: string | null;
  disputesScopeGranted: boolean;
};

type Incident = {
  id: string;
  shopify_order_id: number;
  type: "refund" | "return" | "dispute";
  statut: string | null;
  montant: number | null;
  devise: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<Incident["type"], string> = {
  refund: "Remboursement",
  return: "Retour",
  dispute: "Litige (chargeback)",
};

// Valeurs retournées comme des var() CSS (pas des hex figés) : valide dans un style={{ color }}
// React sur un élément HTML classique, suit le thème clair/sombre automatiquement.
const TYPE_COLOR: Record<Incident["type"], string> = {
  refund: "var(--accent-secondary)",
  return: "var(--accent-secondary)",
  dispute: "var(--danger)",
};

export default function ShopifyDetailPage() {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [lookbackDays, setLookbackDays] = useState(90);

  useEffect(() => {
    fetch("/api/shopify/status").then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
    fetch("/api/shopify/incidents")
      .then((r) => r.json())
      .then((json) => {
        setIncidents(json.incidents ?? []);
        if (json.lookbackDays) setLookbackDays(json.lookbackDays);
      })
      .catch(() => setIncidents([]));
  }, []);

  const refunds = incidents?.filter((i) => i.type === "refund" || i.type === "return") ?? [];
  const disputes = incidents?.filter((i) => i.type === "dispute") ?? [];

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3">Shopify — Remboursements & litiges</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">Synchronisé automatiquement depuis ta boutique Shopify.</p>
          <Link
            href="/dashboard/shopify/commandes"
            className="inline-block mt-3 text-xs font-semibold text-[var(--accent)] hover:underline"
          >
            Commandes à préparer sur AliExpress →
          </Link>
        </div>

        {status && !status.connected ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-10 flex flex-col items-center gap-2 text-center">
            <p className="text-[var(--text-faint)] text-sm">
              {status.reconnectRequired
                ? "Reconnecte ta boutique Shopify pour reprendre le suivi."
                : "Connecte ta boutique Shopify pour voir tes remboursements et litiges ici."}
            </p>
            <a href="/dashboard?openIntegrations=1" className="text-[var(--accent)] text-xs hover:underline">
              {status.reconnectRequired ? "Reconnecter ma boutique →" : "Connecter ma boutique Shopify →"}
            </a>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">
                  Remboursements & retours ({lookbackDays}j)
                </p>
                <p className="text-2xl font-bold tabular-nums text-[var(--accent-secondary)] mt-2">{refunds.length}</p>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">
                  Litiges ({lookbackDays}j)
                </p>
                {status?.disputesScopeGranted ? (
                  <p className="text-2xl font-bold tabular-nums text-[var(--danger)] mt-2">{disputes.length}</p>
                ) : (
                  <p className="text-xs font-semibold text-[var(--text-faint)] mt-3">Non disponible</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
              {incidents === null ? (
                <p className="text-[var(--text-faint)] text-sm text-center py-12">Chargement…</p>
              ) : incidents.length === 0 ? (
                <p className="text-[var(--text-faint)] text-sm text-center py-12">
                  Aucun remboursement, retour ou litige sur les {lookbackDays} derniers jours.
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-[var(--border)]">
                  {incidents.map((i) => (
                    <div key={i.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--text-primary)]">
                          {TYPE_LABEL[i.type]} · Commande #{i.shopify_order_id}
                        </p>
                        <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                          {new Date(i.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          {i.statut ? ` · ${i.statut}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-semibold tabular-nums shrink-0 ml-4" style={{ color: TYPE_COLOR[i.type] }}>
                        {i.montant !== null ? `${i.montant.toFixed(2)} ${i.devise ?? ""}`.trim() : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
