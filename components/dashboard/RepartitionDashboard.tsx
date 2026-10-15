"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { isAppLocale, toIntlTag } from "@/lib/locale";
import type { DashboardChartData } from "@/components/DashboardActiviteChart";

// Camemberts sous le graphique d'activité du dashboard : répartition de toute l'activité
// Dropvio sur une période (sites, audits, simulations de marge, produits ajoutés en
// boutique, incidents Shopify), et budget IA du mois par fonction (/api/usage). Les données
// d'activité sont celles déjà chargées par app/dashboard/page.tsx.

const JOUR_MS = 24 * 3_600_000;
const PERIODES = [
  { cle: "7j", jours: 7 },
  { cle: "30j", jours: 30 },
  { cle: "90j", jours: 90 },
  { cle: "tout", jours: null },
] as const;

const ACTIVITES = [
  { cle: "sites", couleur: "#34d399" },
  { cle: "audits", couleur: "#60a5fa" },
  { cle: "simulations", couleur: "#a78bfa" },
  { cle: "produits", couleur: "#fbbf24" },
  { cle: "incidents", couleur: "#fb7185" },
] as const;

const FONCTIONS_IA: Record<string, string> = {
  site_builder: "#34d399",
  audit_ia: "#60a5fa",
  inspiration_ia: "#22d3ee",
  boutique_ia: "#fbbf24",
  textes_ia: "#f472b6",
};

type Part = { cle: string; nom: string; valeur: number; couleur: string };

export default function RepartitionDashboard({ chartData }: { chartData: DashboardChartData | null }) {
  const t = useTranslations("dashboard.repartition");
  const locale = useLocale();
  const intlTag = toIntlTag(isAppLocale(locale) ? locale : "fr");
  const [periode, setPeriode] = useState<(typeof PERIODES)[number]>(PERIODES[1]);
  const [incidents, setIncidents] = useState<{ created_at: string }[]>([]);
  const [budget, setBudget] = useState<{ parFonction: Record<string, number>; max: number } | null>(null);
  const [maintenant] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/shopify/incidents")
      .then((r) => (r.ok ? r.json() : { incidents: [] }))
      .then((json) => setIncidents(json.incidents ?? []))
      .catch(() => setIncidents([]));
    fetch("/api/usage")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.budgetIa) setBudget({ parFonction: json.budgetIa.parFonction ?? {}, max: json.budgetIa.max });
      })
      .catch(() => setBudget(null));
  }, []);

  const activite: Part[] = useMemo(() => {
    if (!chartData) return [];
    const depuis = periode.jours === null ? "" : new Date(maintenant - periode.jours * JOUR_MS).toISOString();
    const compte = (lignes: { created_at: string }[]) => lignes.filter((l) => l.created_at >= depuis).length;
    const valeurs: Record<(typeof ACTIVITES)[number]["cle"], number> = {
      sites: compte(chartData.sites),
      audits: compte(chartData.audits),
      simulations: compte(chartData.simulations),
      produits: compte(chartData.boutiqueProduits),
      incidents: compte(incidents),
    };
    return ACTIVITES.map((a) => ({ cle: a.cle, nom: t(`activites.${a.cle}`), valeur: valeurs[a.cle], couleur: a.couleur })).filter((p) => p.valeur > 0);
  }, [chartData, incidents, periode, maintenant, t]);

  const depensesIa: Part[] = useMemo(
    () =>
      Object.entries(budget?.parFonction ?? {})
        .filter(([, euros]) => euros > 0)
        .map(([fonction, euros]) => ({
          cle: fonction,
          nom: t.has(`fonctions.${fonction}`) ? t(`fonctions.${fonction}`) : fonction,
          valeur: euros,
          couleur: FONCTIONS_IA[fonction] ?? "#94a3b8",
        }))
        .sort((a, b) => b.valeur - a.valeur),
    [budget, t]
  );

  const euros = new Intl.NumberFormat(intlTag, { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  const entier = new Intl.NumberFormat(intlTag);
  const totalIa = depensesIa.reduce((s, p) => s + p.valeur, 0);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t("titre")}</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("aide")}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIODES.map((p) => (
            <button
              key={p.cle}
              type="button"
              onClick={() => setPeriode(p)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                periode.cle === p.cle
                  ? "bg-violet-600 text-white"
                  : "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {t(`periodes.${p.cle}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Camembert
          titre={t("activiteTitre")}
          parts={activite}
          centre={entier.format(activite.reduce((s, p) => s + p.valeur, 0))}
          sousCentre={t("actions")}
          formater={(v) => entier.format(v)}
          vide={chartData ? t("aucuneActivite") : t("chargement")}
        />
        <Camembert
          titre={t("iaTitre")}
          parts={depensesIa}
          centre={euros.format(totalIa)}
          sousCentre={budget ? t("surBudget", { max: euros.format(budget.max) }) : ""}
          formater={(v) => euros.format(v)}
          vide={budget ? t("aucuneDepense") : t("chargement")}
        />
      </div>
    </div>
  );
}

function Camembert({
  titre,
  parts,
  centre,
  sousCentre,
  formater,
  vide,
}: {
  titre: string;
  parts: Part[];
  centre: string;
  sousCentre: string;
  formater: (v: number) => string;
  vide: string;
}) {
  const total = parts.reduce((s, p) => s + p.valeur, 0);
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col gap-3">
      <p className="text-xs font-semibold text-[var(--text-primary)]">{titre}</p>
      {parts.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center">
          <p className="text-[12px] text-[var(--text-faint)]">{vide}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row">
          <div className="relative h-[180px] w-[180px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={parts} dataKey="valeur" nameKey="nom" innerRadius={58} outerRadius={86} paddingAngle={parts.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                  {parts.map((p) => (
                    <Cell key={p.cle} fill={p.couleur} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as Part;
                    return (
                      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs shadow-xl" style={{ color: p.couleur }}>
                        {p.nom} : {formater(p.valeur)} ({((p.valeur / total) * 100).toFixed(1)} %)
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-base font-bold tabular-nums text-[var(--text-primary)]">{centre}</span>
              <span className="text-[10px] text-[var(--text-faint)] max-w-[100px] leading-tight">{sousCentre}</span>
            </div>
          </div>
          <ul className="m-0 flex w-full list-none flex-col gap-2 p-0">
            {parts.map((p) => (
              <li key={p.cle} className="flex items-center justify-between gap-3 text-[12px]">
                <span className="flex min-w-0 items-center gap-2 text-[var(--text-muted)]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.couleur }} />
                  <span className="truncate">{p.nom}</span>
                </span>
                <span className="shrink-0 tabular-nums text-[var(--text-primary)]">
                  {formater(p.valeur)} <span className="text-[var(--text-faint)]">· {((p.valeur / total) * 100).toFixed(1)} %</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
