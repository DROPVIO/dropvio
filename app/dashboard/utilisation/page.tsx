"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UsageMeter } from "@/components/UsageMeter";

type UsageMetric = { key: string; label: string; used: number; max: number | null };
type BoutiqueUsage = { id: string; nom: string; used: number; max: number | null };
type UsageData = {
  plan: string;
  monthly: UsageMetric[];
  total: UsageMetric[];
  catalogue: { max: number | null };
  boutiques: BoutiqueUsage[];
};

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", agency: "Agency" };

export default function UtilisationDetailPage() {
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Impossible de charger ton utilisation.");
          return;
        }
        setUsage(json);
      })
      .catch(() => setError("Impossible de contacter le serveur."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3">Utilisation du plan</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">
            Ce que tu as consommé sur le plan {usage ? PLAN_LABEL[usage.plan] ?? usage.plan : "…"}.
          </p>
        </div>

        {loading ? (
          <p className="text-[var(--text-faint)] text-sm text-center py-12">Chargement…</p>
        ) : error ? (
          <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">{error}</div>
        ) : usage ? (
          <div className="flex flex-col gap-8">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">Ce mois-ci</p>
              {usage.monthly.map((m) => (
                <UsageMeter key={m.key} label={m.label} used={m.used} max={m.max} />
              ))}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">Au total</p>
              {usage.total.map((m) => (
                <UsageMeter key={m.key} label={m.label} used={m.used} max={m.max} />
              ))}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">Catalogue & boutiques</p>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Produits gagnants accessibles</p>
                  <p className="text-[11px] text-[var(--text-faint)] mt-0.5">Nombre de produits consultables dans le catalogue.</p>
                </div>
                <p className="text-xs font-semibold shrink-0">
                  {usage.catalogue.max === null ? (
                    <span className="text-[var(--success)]">Catalogue complet</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">{usage.catalogue.max} premiers produits</span>
                  )}
                </p>
              </div>

              {usage.boutiques.length === 0 ? (
                <p className="text-[11px] text-[var(--text-faint)]">
                  Tu n&apos;as pas encore de boutique — crée-en une depuis « Mode boutique ».
                </p>
              ) : (
                usage.boutiques.map((b) => (
                  <UsageMeter key={b.id} label={`Produits de « ${b.nom} »`} used={b.used} max={b.max} />
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
