"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toIntlTag, type AppLocale } from "@/lib/locale";
import { useIsLightTheme } from "@/components/dashboard/useIsLightTheme";
import { LegendeTendance, LigneTooltip, VariationCourte, couleursTendance, formatPlage } from "@/components/dashboard/Tendance";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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

// Activité façon analytics Shopify : un onglet par indicateur (valeur de la période +
// variation vs période précédente), un seul graphique pour l'indicateur choisi, période
// précédente en pointillés. Vue « cumulée » par défaut : l'activité étant ponctuelle (quelques
// jours actifs sur 30), une courbe journalière ne ferait que des pics isolés ; le cumul montre
// la progression. Vue « par jour » en barres pour le détail.

const PERIODES = [7, 30, 90] as const;
type Periode = (typeof PERIODES)[number];
type Mode = "cumul" | "jour";
const JOUR_MS = 24 * 60 * 60 * 1000;

// "somme" : compte d'événements par jour. "moyenne" : moyenne des valeurs du jour (marge nette
// en €, score d'audit /100) — cumul = moyenne glissante depuis le début de la période.
type MetricKey = "sites" | "produits" | "audits" | "marges" | "shopify" | "utilisation";
type Metric = { key: MetricKey; labelKey: string; type: "somme" | "moyenne"; inverse?: boolean };
const METRICS: Metric[] = [
  { key: "sites", labelKey: "metricSites", type: "somme" },
  { key: "produits", labelKey: "metricProduits", type: "somme" },
  { key: "audits", labelKey: "metricAudits", type: "moyenne" },
  { key: "marges", labelKey: "metricMarges", type: "moyenne" },
  // Hausse des incidents = mauvaise nouvelle : couleurs de variation inversées.
  { key: "shopify", labelKey: "metricShopify", type: "somme", inverse: true },
  { key: "utilisation", labelKey: "metricUtilisation", type: "somme" },
];

type Agregat = { somme: number; nb: number };
type Point = {
  t: number;
  tPrecedent: number;
  actuel: number | null;
  precedent: number | null;
  jourActuel: Agregat;
  jourPrecedent: Agregat;
};

function dateKeyOf(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

function variation(actuel: number | null, precedent: number | null): number | null {
  if (actuel === null || precedent === null) return null;
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return ((actuel - precedent) / precedent) * 100;
}

export default function DashboardActiviteChart({ chartData }: { chartData: DashboardChartData | null }) {
  const t = useTranslations("dashboard.chart");
  const tVentes = useTranslations("dashboard.ventes");
  const intlTag = toIntlTag(useLocale() as AppLocale);
  const couleurs = couleursTendance(useIsLightTheme());

  const [periode, setPeriode] = useState<Periode>(30);
  const [metricKey, setMetricKey] = useState<MetricKey>("sites");
  const [mode, setMode] = useState<Mode>("cumul");
  const [maintenant] = useState(() => Date.now());

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

  // Agrégats journaliers de tout l'historique, par indicateur (clé = AAAA-MM-JJ).
  const parJour = useMemo(() => {
    const maps = Object.fromEntries(METRICS.map((m) => [m.key, new Map<string, Agregat>()])) as Record<MetricKey, Map<string, Agregat>>;
    if (chartData === null || incidents === null) return maps;
    const ajouter = (k: MetricKey, createdAt: string, valeur: number) => {
      const key = createdAt.slice(0, 10);
      const a = maps[k].get(key) ?? { somme: 0, nb: 0 };
      a.somme += valeur;
      a.nb += 1;
      maps[k].set(key, a);
    };
    for (const s of chartData.simulations) {
      const eur = (s.resultats as { margeNette?: number } | null)?.margeNette;
      if (typeof eur === "number") ajouter("marges", s.created_at, eur);
    }
    for (const a of chartData.audits) {
      ajouter("audits", a.created_at, a.score_total);
      ajouter("utilisation", a.created_at, 1);
    }
    for (const s of chartData.sites) {
      ajouter("sites", s.created_at, 1);
      ajouter("utilisation", s.created_at, 1);
    }
    for (const p of chartData.boutiqueProduits) ajouter("produits", p.created_at, 1);
    for (const i of incidents) ajouter("shopify", i.created_at, 1);
    return maps;
  }, [chartData, incidents]);

  // Jours de la période (du plus ancien à aujourd'hui) et ceux de la période précédente.
  const jours = useMemo(() => {
    const aujourdhui = new Date(maintenant);
    aujourdhui.setUTCHours(0, 0, 0, 0);
    const fin = aujourdhui.getTime();
    return Array.from({ length: periode }, (_, i) => {
      const tt = fin - (periode - 1 - i) * JOUR_MS;
      return { t: tt, tPrecedent: tt - periode * JOUR_MS };
    });
  }, [periode, maintenant]);

  // Valeur de la période, variation et série du graphique pour chaque indicateur.
  const resume = useMemo(() => {
    const vide: Agregat = { somme: 0, nb: 0 };
    return Object.fromEntries(
      METRICS.map((m) => {
        const map = parJour[m.key];
        const total = (cle: "t" | "tPrecedent") =>
          jours.reduce<Agregat>((acc, j) => {
            const a = map.get(dateKeyOf(j[cle])) ?? vide;
            return { somme: acc.somme + a.somme, nb: acc.nb + a.nb };
          }, { somme: 0, nb: 0 });
        const valeurDe = (a: Agregat): number | null => (m.type === "somme" ? a.somme : a.nb > 0 ? a.somme / a.nb : null);
        const actuel = valeurDe(total("t"));
        const precedent = valeurDe(total("tPrecedent"));

        const cumulA = { somme: 0, nb: 0 };
        const cumulP = { somme: 0, nb: 0 };
        const points: Point[] = jours.map((j) => {
          const jourActuel = map.get(dateKeyOf(j.t)) ?? vide;
          const jourPrecedent = map.get(dateKeyOf(j.tPrecedent)) ?? vide;
          cumulA.somme += jourActuel.somme; cumulA.nb += jourActuel.nb;
          cumulP.somme += jourPrecedent.somme; cumulP.nb += jourPrecedent.nb;
          return { ...j, jourActuel, jourPrecedent, actuel: valeurDe(cumulA), precedent: valeurDe(cumulP) };
        });
        return [m.key, { actuel, precedent, variation: variation(actuel, precedent), points, aPrecedent: total("tPrecedent").nb > 0 }];
      })
    ) as Record<MetricKey, { actuel: number | null; precedent: number | null; variation: number | null; points: Point[]; aPrecedent: boolean }>;
  }, [parJour, jours]);

  const formats = useMemo(() => {
    const entier = new Intl.NumberFormat(intlTag);
    const euro = new Intl.NumberFormat(intlTag, { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
    const euroCompact = new Intl.NumberFormat(intlTag, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
    return {
      valeur: (k: MetricKey, v: number | null) => (v === null ? "—" : k === "marges" ? euro.format(v) : k === "audits" ? `${Math.round(v)}/100` : entier.format(v)),
      axe: (k: MetricKey, v: number) => (k === "marges" ? euroCompact.format(v) : entier.format(v)),
      date: (tt: number) => new Date(tt).toLocaleDateString(intlTag, { day: "numeric", month: "short" }),
    };
  }, [intlTag]);

  const metric = METRICS.find((m) => m.key === metricKey)!;
  const courant = resume[metricKey];
  const hasActivity = METRICS.some((m) => resume[m.key].points.some((p) => p.jourActuel.nb > 0));
  const debut = jours[0].t;
  const fin = jours[jours.length - 1].t;

  // Par jour : valeur brute du jour (somme ou moyenne), null pour une moyenne sans donnée.
  const valeurJour = (a: Agregat): number | null => (metric.type === "somme" ? a.somme : a.nb > 0 ? a.somme / a.nb : null);
  const donneesJour = courant.points.map((p) => ({ ...p, actuel: valeurJour(p.jourActuel), precedent: valeurJour(p.jourPrecedent) }));
  const donnees = mode === "cumul" ? courant.points : donneesJour;

  const tooltip = (
    <Tooltip
      cursor={mode === "cumul" ? { stroke: couleurs.curseur } : { fill: couleurs.grille }}
      content={({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const p = payload[0].payload as Point;
        const vide = metricKey === "marges" ? t("noSimulation") : metricKey === "audits" ? t("noAudit") : "—";
        const texte = (v: number | null) => (v === null ? vide : formats.valeur(metricKey, v));
        return (
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-xl text-xs min-w-[200px] flex flex-col gap-1.5">
            <p className="text-[11px] text-[var(--text-faint)]">{mode === "cumul" ? t("tooltipCumul") : t("tooltipJour")}</p>
            <LigneTooltip libelle={formats.date(p.t)} valeur={texte(p.actuel)} couleur={couleurs.actuel} />
            {courant.aPrecedent ? (
              <LigneTooltip libelle={formats.date(p.tPrecedent)} valeur={texte(p.precedent)} couleur={couleurs.actuel} opacite={couleurs.precedentOpacite} pointilles />
            ) : null}
          </div>
        );
      }}
    />
  );

  const axes = (
    <>
      <CartesianGrid stroke={couleurs.grille} vertical={false} />
      <XAxis dataKey="t" tickFormatter={formats.date} tick={{ fill: couleurs.axe, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={48} />
      <YAxis
        tickFormatter={(v: number) => formats.axe(metricKey, v)}
        tick={{ fill: couleurs.axe, fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        allowDecimals={metric.type === "moyenne"}
        tickCount={3}
        domain={metricKey === "audits" ? [0, 100] : [0, "auto"]}
        width={56}
      />
    </>
  );

  const bouton = (actif: boolean) =>
    `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      actif ? "bg-[var(--surface)] text-[var(--text-primary)] shadow-sm" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
    }`;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden">
      {/* ── En-tête : titre + période ─────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-6 pt-5">
        <div>
          <p className="text-base font-semibold text-[var(--text-primary)]">{t("title")}</p>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">{t("caption")}</p>
        </div>
        <div className="flex rounded-lg bg-[var(--surface-2)] p-0.5">
          {PERIODES.map((p) => (
            <button key={p} type="button" onClick={() => setPeriode(p)} className={bouton(periode === p)}>
              {tVentes(`periodes.${p}j`)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Onglets indicateurs : valeur de la période + variation ─────── */}
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 border-y border-[var(--border)]">
        {METRICS.map((m) => {
          const r = resume[m.key];
          const actif = m.key === metricKey;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetricKey(m.key)}
              aria-pressed={actif}
              className={`relative flex flex-col items-start gap-1 px-5 py-3.5 text-left border-[var(--border)] [&:not(:last-child)]:border-r transition-colors ${
                actif ? "bg-[var(--surface-2)]" : "hover:bg-[var(--surface-2)]/60"
              }`}
            >
              {actif && <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: couleurs.actuel }} />}
              <span className="text-xs text-[var(--text-muted)]">{t(m.labelKey)}</span>
              <span className="flex items-baseline gap-2">
                <span className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{loading ? "…" : formats.valeur(m.key, r.actuel)}</span>
                {!loading && r.actuel !== null ? (
                  <VariationCourte valeur={r.variation} intlTag={intlTag} nouveau={tVentes("nouveau")} inverse={m.inverse} />
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Graphique de l'indicateur choisi ───────────────────────────── */}
      <div className="px-6 pt-4 pb-5 flex flex-col gap-3">
        <div className="flex justify-end">
          <div className="flex rounded-lg bg-[var(--surface-2)] p-0.5">
            <button type="button" onClick={() => setMode("cumul")} className={bouton(mode === "cumul")}>{t("modeCumul")}</button>
            <button type="button" onClick={() => setMode("jour")} className={bouton(mode === "jour")}>{t("modeJour")}</button>
          </div>
        </div>

        {loading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          </div>
        ) : !hasActivity ? (
          <div className="h-[220px] flex items-center justify-center">
            <p className="text-[var(--text-faint)] text-sm">{t("empty")}</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            {mode === "cumul" ? (
              <AreaChart data={donnees} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dv-activite" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={couleurs.actuel} stopOpacity={0.16} />
                    <stop offset="100%" stopColor={couleurs.actuel} stopOpacity={0} />
                  </linearGradient>
                </defs>
                {axes}
                {tooltip}
                {courant.aPrecedent ? (
                  <Area type="monotone" dataKey="precedent" stroke={couleurs.actuel} strokeOpacity={couleurs.precedentOpacite} strokeWidth={2} strokeDasharray="0.5 5" strokeLinecap="round" fill="none" isAnimationActive={false} activeDot={false} connectNulls />
                ) : null}
                <Area type="monotone" dataKey="actuel" stroke={couleurs.actuel} strokeWidth={2.5} fill="url(#dv-activite)" isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls />
              </AreaChart>
            ) : (
              <BarChart data={donnees} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={1} barCategoryGap={periode === 90 ? "15%" : "25%"}>
                {axes}
                {tooltip}
                {courant.aPrecedent ? <Bar dataKey="precedent" fill={couleurs.actuel} fillOpacity={couleurs.precedentOpacite * 0.6} radius={[3, 3, 0, 0]} isAnimationActive={false} /> : null}
                <Bar dataKey="actuel" fill={couleurs.actuel} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}

        <LegendeTendance
          actuel={formatPlage(debut, fin, intlTag)}
          precedent={courant.aPrecedent ? formatPlage(debut - periode * JOUR_MS, fin - periode * JOUR_MS, intlTag) : undefined}
          couleur={couleurs.actuel}
          opacitePrecedent={couleurs.precedentOpacite}
        />
      </div>
    </div>
  );
}
