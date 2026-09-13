"use client";

import { useEffect, useState } from "react";
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

// Extrait de app/dashboard/sites/page.tsx pour permettre un chargement en next/dynamic
// (ssr: false) — recharts (~390 KB) ne doit jamais faire partie du bundle initial de la
// page, seulement du chunk de ce composant, chargé à la demande.

export type ChartPoint = {
  date: string;
  "30 derniers jours": number;
  "Mois précédent": number;
};

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

export default function SitesChart({ data }: { data: ChartPoint[] }) {
  const isLight = useIsLightTheme();

  const gridStroke = isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.04)";
  const cursorStroke = isLight ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.06)";
  const axisTickFill = isLight ? "#a1a1aa" : "#52525b";
  const legendColor = isLight ? "#52525b" : "#a1a1aa";
  const mutedLineStroke = isLight ? "#d4d4d8" : "#3f3f46";

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: axisTickFill, fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
        <YAxis tick={{ fill: axisTickFill, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
        <Tooltip content={ChartTooltip} cursor={{ stroke: cursorStroke, strokeWidth: 1 }} />
        <Legend iconType="plainline" iconSize={16} wrapperStyle={{ fontSize: 11, color: legendColor, paddingTop: 16 }} />
        <Line type="monotone" dataKey="30 derniers jours" stroke="#7c3aed" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "#7c3aed", strokeWidth: 0 }} />
        <Line type="monotone" dataKey="Mois précédent" stroke={mutedLineStroke} strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, fill: axisTickFill, strokeWidth: 0 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
