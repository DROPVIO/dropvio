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
    <div className="min-h-screen bg-[#0d0d14] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white mt-3">Utilisation du plan</h1>
          <p className="text-zinc-500 text-sm mt-1.5">
            Ce que tu as consommé sur le plan {usage ? PLAN_LABEL[usage.plan] ?? usage.plan : "…"}.
          </p>
        </div>

        {loading ? (
          <p className="text-zinc-600 text-sm text-center py-12">Chargement…</p>
        ) : error ? (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm">{error}</div>
        ) : usage ? (
          <div className="flex flex-col gap-8">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Ce mois-ci</p>
              {usage.monthly.map((m) => (
                <UsageMeter key={m.key} label={m.label} used={m.used} max={m.max} />
              ))}
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Au total</p>
              {usage.total.map((m) => (
                <UsageMeter key={m.key} label={m.label} used={m.used} max={m.max} />
              ))}
            </div>

            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest">Catalogue & boutiques</p>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Produits gagnants accessibles</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">Nombre de produits consultables dans le catalogue.</p>
                </div>
                <p className="text-xs font-semibold shrink-0">
                  {usage.catalogue.max === null ? (
                    <span className="text-emerald-400">Catalogue complet</span>
                  ) : (
                    <span className="text-zinc-300">{usage.catalogue.max} premiers produits</span>
                  )}
                </p>
              </div>

              {usage.boutiques.length === 0 ? (
                <p className="text-[11px] text-zinc-600">
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
