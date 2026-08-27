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
    <div className="rounded-xl border border-white/10 bg-[#13131f] px-3 py-2.5 shadow-xl">
      <p className="text-[10px] text-zinc-500 mb-1.5">{label}</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((entry: any) => (
        <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
          {entry.name} : <span className="font-semibold">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export default function SitesDetailPage() {
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

  const chartData = buildChartData(sites.map((s) => s.created_at));
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const sitesMois = sites.filter((s) => s.created_at >= startOfMonth).length;

  return (
    <div className="min-h-screen bg-[#0d0d14] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white mt-3">Sites générés</h1>
          <p className="text-zinc-500 text-sm mt-1.5">Landing pages créées via le Site Builder.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Ce mois</p>
            <p className="text-2xl font-bold tabular-nums text-violet-400 mt-2">{sitesMois}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Au total</p>
            <p className="text-2xl font-bold tabular-nums text-blue-400 mt-2">{fmt(sites.length)}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div className="mb-6">
            <p className="text-sm font-semibold text-white">Sites générés — 30 derniers jours</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Comparaison avec les 30 jours précédents</p>
          </div>

          {!loading && sites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-zinc-600 text-sm">Aucun site généré pour l&apos;instant.</p>
              <a href="/site-builder" className="text-violet-400 text-xs hover:underline">
                Créer ta première landing page →
              </a>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
                <Tooltip content={ChartTooltip} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
                <Legend iconType="plainline" iconSize={16} wrapperStyle={{ fontSize: 11, color: "#71717a", paddingTop: 16 }} />
                <Line type="monotone" dataKey="30 derniers jours" stroke="#7c3aed" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#7c3aed", strokeWidth: 0 }} />
                <Line type="monotone" dataKey="Mois précédent" stroke="#3f3f46" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, fill: "#71717a", strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          {loading ? (
            <p className="text-zinc-600 text-sm text-center py-12">Chargement…</p>
          ) : sites.length === 0 ? null : (
            <div className="flex flex-col divide-y divide-white/[0.05]">
              {sites.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <p className="text-sm text-zinc-200 truncate">{s.nom_produit}</p>
                  <p className="text-[11px] text-zinc-600 shrink-0 ml-4">
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
