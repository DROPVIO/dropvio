"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

type ChartPoint = {
  date: string;
  "30 derniers jours": number;
  "Mois précédent": number;
};

type SiteRow = { id: string; nom_produit: string; created_at: string };

function buildChartData(createdAts: string[]): ChartPoint[] {
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

    const label = dCur.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return {
      date: label,
      "30 derniers jours": counts[kCur] || 0,
      "Mois précédent": counts[kPrev] || 0,
    };
  });
}

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 shadow-xl">
      <p className="text-[10px] text-[var(--text-faint)] mb-1.5">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
          {entry.name} : <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

// Couleurs recharts non-Tailwind (props SVG littérales — pas de résolution de var() CSS
// possible ici, contrairement aux className régulières du reste du composant) —
// recalculées selon le thème, même pattern que DashboardActiviteChart.tsx.
function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const read = () => setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return isLight;
}

export default function SitesDetailPage() {
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteRow[]>([]);
  const isLight = useIsLightTheme();

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

  const chartData = buildChartData(sites.map((s) => s.created_at));
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const sitesMois = sites.filter((s) => s.created_at >= startOfMonth).length;

  const gridStroke = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
  const cursorStroke = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
  const axisTickFill = isLight ? "#a1a1aa" : "#52525b";
  const legendColor = isLight ? "#52525b" : "#a1a1aa";
  const mutedLineStroke = isLight ? "#d4d4d8" : "#3f3f46";

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3">Sites générés</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">Landing pages créées via le Site Builder.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Ce mois</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--accent)] mt-2">{sitesMois}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Au total</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--accent-secondary)] mt-2">{fmt(sites.length)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
          <div className="mb-6">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Sites générés — 30 derniers jours</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">Comparaison avec les 30 jours précédents</p>
          </div>

          {!loading && sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-[var(--text-faint)] text-sm">Aucun site généré pour l&apos;instant.</p>
              <a href="/site-builder" className="text-[var(--accent)] text-xs hover:underline">
                Créer ta première landing page →
              </a>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: axisTickFill, fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: axisTickFill, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip content={ChartTooltip} cursor={{ stroke: cursorStroke, strokeWidth: 1 }} />
                <Legend iconType="plainline" iconSize={16} wrapperStyle={{ fontSize: 11, color: legendColor, paddingTop: 16 }} />
                <Line type="monotone" dataKey="30 derniers jours" stroke="#7c3aed" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#7c3aed", strokeWidth: 0 }} />
                <Line type="monotone" dataKey="Mois précédent" stroke={mutedLineStroke} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, fill: axisTickFill, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
          {loading ? (
            <p className="text-[var(--text-faint)] text-sm text-center py-12">Chargement…</p>
          ) : sites.length === 0 ? null : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {sites.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-[var(--text-primary)] truncate">{s.nom_produit}</p>
                  <p className="text-[11px] text-[var(--text-faint)] shrink-0 ml-4">
                    {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
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
