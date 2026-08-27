"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Brush,
  ResponsiveContainer,
} from "recharts";

const PERIOD_DAYS = 30;

// Les 5 sources ci-dessous sont déjà chargées par app/dashboard/page.tsx (mêmes lignes
// réutilisées pour ses propres stats) — ce composant ne les refetch plus lui-même. Ça
// éliminait 2 appels auth.getUser() redondants et une deuxième requête sur chacune de ces
// 5 tables à chaque chargement du dashboard (voir diagnostic de perf : ce doublon, gaté
// derrière le "loading" du parent, créait une vraie cascade de ~800ms). Seuls les incidents
// Shopify (donnée non chargée par le parent) restent fetchés ici, indépendamment.
export type DashboardChartData = {
  simulations: { resultats: unknown; created_at: string }[];
  audits: { score_total: number; created_at: string }[];
  sites: { created_at: string }[];
  boutiqueProduits: { created_at: string }[];
};

type DayPoint = {
  dateKey: string;
  dateLabel: string;
  margeEur: number;
  margeHasData: boolean;
  margePct: number;
  auditScore: number;
  auditHasData: boolean;
  auditPct: number;
  shopifyIncidents: number;
  shopifyPct: number;
  sites: number;
  sitesPct: number;
  boutiqueProduits: number;
  boutiquesPct: number;
  utilisation: number;
  utilisationPct: number;
};

type SerieKey = "margePct" | "auditPct" | "shopifyPct" | "sitesPct" | "boutiquesPct" | "utilisationPct";
type SerieConfig = { key: SerieKey; name: string; color: string };

const SERIES: SerieConfig[] = [
  { key: "margePct",       name: "Marges",       color: "#a78bfa" },
  { key: "auditPct",       name: "Audits",       color: "#60a5fa" },
  { key: "shopifyPct",     name: "Shopify",      color: "#fb7185" },
  { key: "sitesPct",       name: "Sites",        color: "#34d399" },
  { key: "boutiquesPct",   name: "Boutiques",    color: "#fbbf24" },
  { key: "utilisationPct", name: "Utilisation",  color: "#22d3ee" },
];

function dateKeyOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 30 jours vides (clé + libellé), du plus ancien au plus récent — le squelette sur lequel
// on vient agréger chaque source, pour que les jours sans activité restent des points à 0
// plutôt que des trous dans la courbe.
function buildEmptyDays(): { dateKey: string; dateLabel: string }[] {
  const now = new Date();
  return Array.from({ length: PERIOD_DAYS }, (_, i) => {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - (PERIOD_DAYS - 1 - i));
    return { dateKey: dateKeyOf(d), dateLabel: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ActiviteTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point: DayPoint = payload[0].payload;

  const rows: { key: SerieKey; raw: string }[] = [
    { key: "margePct", raw: point.margeHasData ? `${point.margeEur.toFixed(2)}€` : "aucune simulation" },
    { key: "auditPct", raw: point.auditHasData ? `${Math.round(point.auditScore)}/100` : "aucun audit" },
    { key: "shopifyPct", raw: `${point.shopifyIncidents} incident${point.shopifyIncidents > 1 ? "s" : ""}` },
    { key: "sitesPct", raw: `${point.sites} site${point.sites > 1 ? "s" : ""}` },
    { key: "boutiquesPct", raw: `${point.boutiqueProduits} produit${point.boutiqueProduits > 1 ? "s" : ""}` },
    { key: "utilisationPct", raw: `${point.utilisation} action${point.utilisation > 1 ? "s" : ""}` },
  ];

  return (
    <div className="rounded-xl border border-white/10 bg-[#13131f] px-3 py-2.5 shadow-xl flex flex-col gap-1.5 min-w-[220px]">
      <p className="text-[10px] text-zinc-500 mb-0.5">{label}</p>
      {rows.map(({ key, raw }) => {
        const serie = SERIES.find((s) => s.key === key)!;
        return (
          <p key={key} className="text-xs flex items-center justify-between gap-4" style={{ color: serie.color }}>
            <span>{serie.name}</span>
            <span className="font-semibold text-right">
              {raw} <span className="text-zinc-500">({Math.round(point[key])}%)</span>
            </span>
          </p>
        );
      })}
    </div>
  );
}

export default function DashboardActiviteChart({ chartData }: { chartData: DashboardChartData | null }) {
  // Seule requête restante ici : les incidents Shopify, non chargés par le parent. Démarre
  // dès le montage — pas besoin d'attendre chartData ni un auth.getUser() local, la route
  // gère déjà l'auth côté serveur et renvoie [] si non connecté (voir le .catch ci-dessous).
  const [incidents, setIncidents] = useState<{ created_at: string }[] | null>(null);

  useEffect(() => {
    fetch("/api/shopify/incidents")
      .then((r) => (r.ok ? r.json() : { incidents: [] }))
      .then((json) => setIncidents(json.incidents ?? []))
      .catch(() => setIncidents([]));
  }, []);

  const loading = chartData === null || incidents === null;

  const { data, hasActivity } = useMemo<{ data: DayPoint[]; hasActivity: boolean }>(() => {
    if (chartData === null || incidents === null) return { data: [], hasActivity: false };

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setUTCDate(now.getUTCDate() - (PERIOD_DAYS - 1));
    cutoff.setUTCHours(0, 0, 0, 0);
    const cutoffIso = cutoff.toISOString();

    // chartData vient du parent sans filtre de date (réutilisé tel quel pour ses propres
    // stats all-time) — on restreint aux 30 derniers jours ici, en mémoire, sans requête.
    const sims = chartData.simulations.filter((s) => s.created_at >= cutoffIso);
    const auds = chartData.audits.filter((a) => a.created_at >= cutoffIso);
    const sites = chartData.sites.filter((s) => s.created_at >= cutoffIso);
    const boutiqueProduits = chartData.boutiqueProduits.filter((p) => p.created_at >= cutoffIso);
    const incidentsRecents = incidents.filter((i) => i.created_at >= cutoffIso);

    const margeSum = new Map<string, number>();
    const margeCount = new Map<string, number>();
    const auditSum = new Map<string, number>();
    const auditCount = new Map<string, number>();
    const shopifyCount = new Map<string, number>();
    const sitesCount = new Map<string, number>();
    const boutiquesCount = new Map<string, number>();

    for (const s of sims) {
      const key = s.created_at.slice(0, 10);
      const eur = (s.resultats as { margeNette?: number } | null)?.margeNette;
      if (typeof eur === "number") {
        margeSum.set(key, (margeSum.get(key) ?? 0) + eur);
        margeCount.set(key, (margeCount.get(key) ?? 0) + 1);
      }
    }
    for (const a of auds) {
      const key = a.created_at.slice(0, 10);
      auditSum.set(key, (auditSum.get(key) ?? 0) + a.score_total);
      auditCount.set(key, (auditCount.get(key) ?? 0) + 1);
    }
    for (const i of incidentsRecents) {
      const key = i.created_at.slice(0, 10);
      shopifyCount.set(key, (shopifyCount.get(key) ?? 0) + 1);
    }
    for (const s of sites) {
      const key = s.created_at.slice(0, 10);
      sitesCount.set(key, (sitesCount.get(key) ?? 0) + 1);
    }
    for (const p of boutiqueProduits) {
      const key = p.created_at.slice(0, 10);
      boutiquesCount.set(key, (boutiquesCount.get(key) ?? 0) + 1);
    }

    const points: DayPoint[] = buildEmptyDays().map((d) => {
      const margeN = margeCount.get(d.dateKey) ?? 0;
      const auditN = auditCount.get(d.dateKey) ?? 0;
      const sitesN = sitesCount.get(d.dateKey) ?? 0;
      return {
        dateKey: d.dateKey,
        dateLabel: d.dateLabel,
        margeEur: margeN > 0 ? (margeSum.get(d.dateKey) ?? 0) / margeN : 0,
        margeHasData: margeN > 0,
        margePct: 0,
        auditScore: auditN > 0 ? (auditSum.get(d.dateKey) ?? 0) / auditN : 0,
        auditHasData: auditN > 0,
        auditPct: 0,
        shopifyIncidents: shopifyCount.get(d.dateKey) ?? 0,
        shopifyPct: 0,
        sites: sitesN,
        sitesPct: 0,
        boutiqueProduits: boutiquesCount.get(d.dateKey) ?? 0,
        boutiquesPct: 0,
        utilisation: auditN + sitesN,
        utilisationPct: 0,
      };
    });

    // Normalisation en % du max propre de chaque série sur la période affichée — Math.max
    // avec 0 en plancher pour ne jamais diviser par une valeur négative (marge nette
    // moyenne qui serait une perte tous les jours actifs, par exemple).
    const maxOf = (sel: (p: DayPoint) => number) => Math.max(0, ...points.map(sel));
    const margeMax = maxOf((p) => p.margeEur);
    const auditMax = maxOf((p) => p.auditScore);
    const shopifyMax = maxOf((p) => p.shopifyIncidents);
    const sitesMax = maxOf((p) => p.sites);
    const boutiquesMax = maxOf((p) => p.boutiqueProduits);
    const utilisationMax = maxOf((p) => p.utilisation);

    for (const p of points) {
      p.margePct = margeMax > 0 ? (p.margeEur / margeMax) * 100 : 0;
      p.auditPct = auditMax > 0 ? (p.auditScore / auditMax) * 100 : 0;
      p.shopifyPct = shopifyMax > 0 ? (p.shopifyIncidents / shopifyMax) * 100 : 0;
      p.sitesPct = sitesMax > 0 ? (p.sites / sitesMax) * 100 : 0;
      p.boutiquesPct = boutiquesMax > 0 ? (p.boutiqueProduits / boutiquesMax) * 100 : 0;
      p.utilisationPct = utilisationMax > 0 ? (p.utilisation / utilisationMax) * 100 : 0;
    }

    return {
      data: points,
      hasActivity: points.some((p) => p.margeHasData || p.auditHasData || p.shopifyIncidents > 0 || p.sites > 0 || p.boutiqueProduits > 0),
    };
  }, [chartData, incidents]);

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
      <div className="mb-6">
        <p className="text-sm font-semibold text-white">Activité — 30 derniers jours</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">
          Chaque courbe est normalisée en % de son propre maximum sur la période — survole un point pour voir la vraie valeur. Fais glisser les bornes sous le graphique pour zoomer.
        </p>
      </div>

      {loading ? (
        <div className="h-[320px] flex items-center justify-center">
          <div className="w-5 h-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
      ) : !hasActivity ? (
        <div className="h-[220px] flex items-center justify-center">
          <p className="text-zinc-600 text-sm">Pas encore d&apos;activité sur les 30 derniers jours.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis dataKey="dateLabel" tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fill: "#52525b", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={ActiviteTooltip} cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }} />
            <Legend iconType="plainline" iconSize={16} wrapperStyle={{ fontSize: 11, color: "#a1a1aa", paddingTop: 12 }} />
            {SERIES.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
            <Brush dataKey="dateLabel" height={24} stroke="#7c3aed" fill="#13131f" travellerWidth={8} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
