"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Extrait de app/tools/calculateur-marge/page.tsx pour permettre un chargement en
// next/dynamic (ssr: false) — recharts (~390 KB) ne doit jamais faire partie du bundle
// initial de la page, seulement du chunk de ce composant, chargé à la demande.

export type MargeChartPoint = { name: string; margeBrute: number; margeNette: number };

// Couleurs recharts non-Tailwind (props SVG littérales — pas de résolution de var() CSS
// possible, cf. DashboardActiviteChart.tsx) — recalculées selon le thème.
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

export default function MargeBarChart({ chartData, devise = "€" }: { chartData: MargeChartPoint[]; devise?: string }) {
  const t = useTranslations("dashboard.calculateur");
  const isLight = useIsLightTheme();

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: isLight ? "#a1a1aa" : "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: isLight ? "#a1a1aa" : "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
        <Tooltip
          contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, fontSize: 12 }}
          labelStyle={{ color: "var(--text-faint)" }}
          formatter={(value) => `${Number(value).toFixed(2)} ${devise}`}
        />
        <Legend wrapperStyle={{ fontSize: 11, color: isLight ? "#52525b" : "#a1a1aa" }} />
        <Bar dataKey="margeBrute" name={t("chartMargeBrute")} fill="#7c3aed" radius={[6, 6, 0, 0]} />
        <Bar dataKey="margeNette" name={t("chartMargeNette")} fill={isLight ? "#059669" : "#10b981"} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
