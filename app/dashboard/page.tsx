"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";
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

type Profile = { nom_complet: string | null; plan: string };

const PLAN_META: Record<string, { label: string; badge: string; border: string }> = {
  free:   { label: "Free",   badge: "text-zinc-300 bg-zinc-700/50",    border: "border-white/10" },
  pro:    { label: "Pro",    badge: "text-violet-300 bg-violet-600/20", border: "border-violet-500/30" },
  agency: { label: "Agency", badge: "text-amber-300 bg-amber-500/15",  border: "border-amber-500/30" },
};

type ChartPoint = {
  date: string;
  "30 derniers jours": number;
  "Mois précédent": number;
};

function buildChartData(createdAts: string[]): ChartPoint[] {
  const now = new Date();
  const counts: Record<string, number> = {};
  for (const ts of createdAts) {
    const key = ts.slice(0, 10); // YYYY-MM-DD (UTC from Supabase)
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

function greeting() {
  const h = new Date().getHours();
  if (h < 6)  return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
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

export default function DashboardPage() {
  const [user,          setUser]          = useState<User | null>(null);
  const [profile,       setProfile]       = useState<Profile | null>(null);
  const [sitesTotal,    setSitesTotal]    = useState<number | null>(null);
  const [sitesMois,     setSitesMois]     = useState<number | null>(null);
  const [produitsTotal, setProduitsTotal] = useState<number | null>(null);
  const [chartData,     setChartData]     = useState<ChartPoint[]>([]);
  const [loading,       setLoading]       = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const now = new Date();
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

        const [{ data: p }, { data: sites }, { count: prodCount }] = await Promise.all([
          supabase.from("profils").select("nom_complet, plan").eq("id", user.id).maybeSingle(),
          supabase.from("sites_generes").select("created_at").order("created_at", { ascending: true }),
          supabase.from("produits").select("*", { count: "exact", head: true }),
        ]);

        if (p) setProfile(p as Profile);

        const allSites = sites ?? [];
        setSitesTotal(allSites.length);
        setSitesMois(allSites.filter((s) => (s.created_at as string) >= startOfMonth).length);
        setProduitsTotal(prodCount ?? 0);
        setChartData(buildChartData(allSites.map((s) => s.created_at as string)));
      }

      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d14] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const planKey  = profile?.plan ?? "free";
  const planMeta = PLAN_META[planKey] ?? PLAN_META.free;
  const prenom   = profile?.nom_complet?.split(" ")[0]
    || user?.email?.split("@")[0]
    || "là";

  const METRICS = [
    {
      id: "mois",
      label: "Sites ce mois",
      value: sitesMois !== null ? String(sitesMois) : "—",
      sub: "landing pages créées",
      accent: "text-violet-400",
    },
    {
      id: "total",
      label: "Sites au total",
      value: sitesTotal !== null ? fmt(sitesTotal) : "—",
      sub: "toutes périodes",
      accent: "text-blue-400",
    },
    {
      id: "produits",
      label: "Produits disponibles",
      value: produitsTotal !== null ? fmt(produitsTotal) : "—",
      sub: "dans le catalogue",
      accent: "text-emerald-400",
    },
    {
      id: "plan",
      label: "Plan actuel",
      value: planMeta.label,
      sub: null,
      badge: planMeta.badge,
      accent: null,
    },
  ] as const;

  return (
    <div className="min-h-screen bg-[#0d0d14] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">

        {/* ── Welcome ─────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting()}, {prenom} 👋
          </h1>
          <p className="text-zinc-500 text-sm mt-1.5">
            Voici un aperçu de ton activité sur Dropvio.
          </p>
        </div>

        {/* ── 4 metric cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {METRICS.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {m.label}
              </p>
              {"badge" in m && m.badge ? (
                <span className={`self-start text-[11px] font-bold px-2.5 py-1 rounded-full ${m.badge}`}>
                  {m.value.toUpperCase()}
                </span>
              ) : (
                <span className={`text-2xl font-bold tabular-nums ${"accent" in m ? m.accent : ""}`}>
                  {m.value}
                </span>
              )}
              {m.sub && (
                <p className="text-[11px] text-zinc-600 leading-relaxed">{m.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Activity chart ──────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          <div className="mb-6">
            <p className="text-sm font-semibold text-white">Sites générés — 30 derniers jours</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Comparaison avec les 30 jours précédents</p>
          </div>

          {sitesTotal === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-zinc-600 text-sm">Aucun site généré pour l'instant.</p>
              <a href="/site-builder" className="text-violet-400 text-xs hover:underline">
                Créer ta première landing page →
              </a>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#52525b", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={4}
                />
                <YAxis
                  tick={{ fill: "#52525b", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={32}
                />
                <Tooltip content={ChartTooltip} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
                <Legend
                  iconType="plainline"
                  iconSize={16}
                  wrapperStyle={{ fontSize: 11, color: "#71717a", paddingTop: 16 }}
                />
                <Line
                  type="monotone"
                  dataKey="30 derniers jours"
                  stroke="#7c3aed"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#7c3aed", strokeWidth: 0 }}
                />
                <Line
                  type="monotone"
                  dataKey="Mois précédent"
                  stroke="#3f3f46"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  activeDot={{ r: 3, fill: "#71717a", strokeWidth: 0 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ── Footer hint ─────────────────────────────────────────────── */}
        <p className="text-center text-[11px] text-zinc-700">
          Accède aux paramètres de ton compte via la sidebar à gauche.
        </p>

      </div>
    </div>
  );
}
