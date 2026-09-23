"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { toIntlTag, type AppLocale } from "@/lib/locale";
import type { ChartPoint } from "@/components/dashboard/SitesChart";

// recharts (~390 KB) ne doit jamais faire partie du bundle initial de cette page — chargé
// à la demande. ssr: false : recharts mesure le DOM au montage (ResponsiveContainer), un
// rendu serveur n'apporterait rien et créerait un mismatch d'hydratation.
const SitesChart = dynamic(() => import("@/components/dashboard/SitesChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[220px] flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
    </div>
  ),
});

type SiteRow = { id: string; nom_produit: string; created_at: string };

function buildChartData(createdAts: string[], intlTag: string): ChartPoint[] {
  const now = new Date();
  const counts: Record<string, number> = {};
  for (const ts of createdAts) {
    const key = ts.slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  }
  return Array.from({ length: 30 }, (_, i) => {
    const dCur = new Date(now);
    dCur.setUTCDate(now.getUTCDate() - (29 - i));
    const kCur = dCur.toISOString().slice(0, 10);

    const dPrev = new Date(now);
    dPrev.setUTCDate(now.getUTCDate() - (59 - i));
    const kPrev = dPrev.toISOString().slice(0, 10);

    const label = dCur.toLocaleDateString(intlTag, { day: "numeric", month: "short" });
    return {
      date: label,
      current: counts[kCur] || 0,
      previous: counts[kPrev] || 0,
    };
  });
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

export default function SitesDetailPage() {
  const t = useTranslations("dashboard");
  const intlTag = toIntlTag(useLocale() as AppLocale);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteRow[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("sites_generes")
        .select("id, nom_produit, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      setSites((data as SiteRow[]) ?? []);
      setLoading(false);
    });
  }, []);

  const chartData = buildChartData(sites.map((s) => s.created_at), intlTag);
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const sitesMois = sites.filter((s) => s.created_at >= startOfMonth).length;

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
            {t("common.back")}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3">{t("sites.title")}</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">{t("sites.subtitle")}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("sites.statMonth")}</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--accent)] mt-2">{sitesMois}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("sites.statTotal")}</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--accent-secondary)] mt-2">{fmt(sites.length)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
          <div className="mb-6">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{t("sites.chartTitle")}</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("sites.chartCaption")}</p>
          </div>

          {!loading && sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-[var(--text-faint)] text-sm">{t("sites.empty")}</p>
              <a href="/site-builder" className="text-[var(--accent)] text-xs hover:underline">
                {t("sites.cta")}
              </a>
            </div>
          ) : (
            <SitesChart data={chartData} />
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
          {loading ? (
            <p className="text-[var(--text-faint)] text-sm text-center py-12">{t("common.loading")}</p>
          ) : sites.length === 0 ? null : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {sites.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">{s.nom_produit}</p>
                  <p className="text-[11px] text-[var(--text-faint)] shrink-0 ml-4">
                    {new Date(s.created_at).toLocaleDateString(intlTag, { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
