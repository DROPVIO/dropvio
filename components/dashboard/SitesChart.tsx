"use client";

import { useLocale, useTranslations } from "next-intl";
import { Area, AreaChart, CartesianGrid, Tooltip, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { isAppLocale, toIntlTag } from "@/lib/locale";
import { useIsLightTheme } from "@/components/dashboard/useIsLightTheme";
import { EnTeteTendance, LegendeTendance, LigneTooltip, VariationCourte, couleursTendance, formatPlage } from "@/components/dashboard/Tendance";

// Extrait de app/dashboard/sites/page.tsx pour permettre un chargement en next/dynamic
// (ssr: false) — recharts (~390 KB) ne doit jamais faire partie du bundle initial de la
// page, seulement du chunk de ce composant, chargé à la demande.

// Clés de données neutres (pas les libellés affichés) : les textes visibles sont traduits.
// t : jour de la période actuelle (ms) ; previous / previousDate : même position 30 jours plus tôt.
export type ChartPoint = {
  date: string;
  t: number;
  previousDate: string;
  current: number;
  previous: number;
};

export default function SitesChart({ data }: { data: ChartPoint[] }) {
  const t = useTranslations("dashboard.sites");
  const tVentes = useTranslations("dashboard.ventes");
  const locale = useLocale();
  const intlTag = toIntlTag(isAppLocale(locale) ? locale : "fr");
  const couleurs = couleursTendance(useIsLightTheme());
  if (data.length === 0) return null;

  const total = data.reduce((s, p) => s + p.current, 0);
  const totalPrecedent = data.reduce((s, p) => s + p.previous, 0);
  const variation = totalPrecedent === 0 ? (total === 0 ? 0 : null) : ((total - totalPrecedent) / totalPrecedent) * 100;
  const entier = new Intl.NumberFormat(intlTag);

  const debut = data[0].t;
  const fin = data[data.length - 1].t;
  const decalage = 30 * 24 * 60 * 60 * 1000;

  return (
    <div className="flex flex-col gap-3">
      <EnTeteTendance
        titre={t("serieCurrent")}
        valeur={entier.format(total)}
        variation={<VariationCourte valeur={variation} intlTag={intlTag} nouveau={tVentes("nouveau")} />}
      />
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 6, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="dv-sites-actuel" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={couleurs.actuel} stopOpacity={0.16} />
              <stop offset="100%" stopColor={couleurs.actuel} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={couleurs.grille} vertical={false} />
          <XAxis dataKey="date" tick={{ fill: couleurs.axe, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={48} />
          <YAxis tick={{ fill: couleurs.axe, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} tickCount={3} domain={[0, "auto"]} width={40} />
          <Tooltip
            cursor={{ stroke: couleurs.curseur }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ChartPoint;
              return (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-xl text-xs min-w-[180px] flex flex-col gap-1.5">
                  <LigneTooltip libelle={p.date} valeur={entier.format(p.current)} couleur={couleurs.actuel} />
                  <LigneTooltip libelle={p.previousDate} valeur={entier.format(p.previous)} couleur={couleurs.actuel} opacite={couleurs.precedentOpacite} pointilles />
                </div>
              );
            }}
          />
          <Area type="monotone" dataKey="previous" name={t("seriePrevious")} stroke={couleurs.actuel} strokeOpacity={couleurs.precedentOpacite} strokeWidth={2} strokeDasharray="0.5 5" strokeLinecap="round" fill="none" activeDot={false} />
          <Area type="monotone" dataKey="current" name={t("serieCurrent")} stroke={couleurs.actuel} strokeWidth={2.5} fill="url(#dv-sites-actuel)" activeDot={{ r: 4, strokeWidth: 0 }} />
        </AreaChart>
      </ResponsiveContainer>
      <LegendeTendance
        actuel={formatPlage(debut, fin, intlTag)}
        precedent={formatPlage(debut - decalage, fin - decalage, intlTag)}
        couleur={couleurs.actuel}
        opacitePrecedent={couleurs.precedentOpacite}
      />
    </div>
  );
}
