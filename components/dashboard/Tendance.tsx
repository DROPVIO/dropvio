"use client";

// Briques communes des graphiques « période actuelle vs période précédente » (style analytics
// Shopify) : courbe pleine + dégradé léger pour la période affichée, pointillés pour la période
// précédente de même durée, grandes valeurs avec variation, légende avec les plages de dates.

// Couleurs en hex (props SVG recharts : var() CSS non résolu dans les attributs), selon le thème.
export function couleursTendance(isLight: boolean) {
  return {
    actuel: isLight ? "#0284c7" : "#38bdf8",
    // Même teinte que la courbe actuelle, atténuée via strokeOpacity côté <Area>/<Line>.
    precedentOpacite: isLight ? 0.45 : 0.5,
    grille: isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)",
    axe: isLight ? "#71717a" : "#acacb5",
    curseur: isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.18)",
  };
}

/** Plage de dates compacte (« 6 juin – 5 juil. 2026 »), dans la langue active. */
export function formatPlage(debut: number, fin: number, intlTag: string): string {
  return new Intl.DateTimeFormat(intlTag, { day: "numeric", month: "short", year: "numeric" }).formatRange(debut, fin);
}

/** Variation courte façon Shopify : flèche + pourcentage, verte ou rouge. inverse : pour un
 *  indicateur où une hausse est une mauvaise nouvelle (incidents), hausse en rouge. */
export function VariationCourte({ valeur, intlTag, nouveau, inverse = false }: { valeur: number | null; intlTag: string; nouveau: string; inverse?: boolean }) {
  if (valeur === null) return <span className="text-xs text-[var(--text-faint)]">{nouveau}</span>;
  const hausse = valeur >= 0;
  const positif = valeur === 0 || hausse !== inverse;
  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold tabular-nums ${positif ? "text-[var(--success-text)]" : "text-[var(--danger-text)]"}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={hausse ? "" : "rotate-90"}>
        <path d="M3 9L9 3M9 3H4.5M9 3V7.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {(Math.abs(valeur) / 100).toLocaleString(intlTag, { style: "percent", maximumFractionDigits: 0 })}
    </span>
  );
}

/** En-tête : titre souligné en pointillés, grande valeur, variation à côté. */
export function EnTeteTendance({ titre, aide, valeur, variation }: { titre: string; aide?: string; valeur: string; variation: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="self-start text-sm font-semibold text-[var(--text-primary)] underline decoration-dotted decoration-[var(--text-faint)] underline-offset-4" title={aide}>
        {titre}
      </p>
      <div className="flex items-baseline gap-2.5">
        <p className="text-[28px] leading-tight font-bold tabular-nums text-[var(--text-primary)]">{valeur}</p>
        {variation}
      </div>
    </div>
  );
}

/** Légende sous le graphique : trait plein = période actuelle, pointillés = précédente. */
export function LegendeTendance({ actuel, precedent, couleur, opacitePrecedent }: { actuel: string; precedent?: string; couleur: string; opacitePrecedent: number }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-[var(--text-muted)]">
      <span className="flex items-center gap-1.5">
        <svg width="18" height="4" aria-hidden="true"><line x1="1" y1="2" x2="17" y2="2" stroke={couleur} strokeWidth="2.5" strokeLinecap="round" /></svg>
        {actuel}
      </span>
      {precedent ? (
        <span className="flex items-center gap-1.5">
          <svg width="18" height="4" aria-hidden="true">
            <line x1="1" y1="2" x2="17" y2="2" stroke={couleur} strokeOpacity={opacitePrecedent} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="0.5 4" />
          </svg>
          {precedent}
        </span>
      ) : null}
    </div>
  );
}

/** Ligne du tooltip : échantillon de trait, libellé (date), valeur. */
export function LigneTooltip({ libelle, valeur, couleur, pointilles, opacite = 1 }: { libelle: string; valeur: string; couleur: string; pointilles?: boolean; opacite?: number }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-[var(--text-muted)]">
        <svg width="14" height="4" aria-hidden="true">
          <line x1="1" y1="2" x2="13" y2="2" stroke={couleur} strokeOpacity={opacite} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={pointilles ? "0.5 3.5" : undefined} />
        </svg>
        {libelle}
      </span>
      <span className="font-semibold tabular-nums text-[var(--text-primary)]">{valeur}</span>
    </p>
  );
}
