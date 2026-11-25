"use client";

import { useTranslations } from "next-intl";

/** Couleurs prises dans les variables du thème (app/globals.css) : l'ancien blanc codé en dur
 *  rendait les titres (« Sites », « Images »…) presque invisibles en thème clair. */
export function UsageMeter({ label, sub, used, max }: { label: string; sub?: string; used: number; max: number | null }) {
  const t = useTranslations("common");
  const unlimited = max === null;
  const ratio = unlimited || max === 0 ? 0 : Math.min(1, used / max);
  const barColor = ratio >= 1 ? "bg-red-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-violet-500";

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
          {sub && <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{sub}</p>}
        </div>
        <p className="text-xs font-semibold text-[var(--text-primary)] shrink-0 whitespace-nowrap">
          {unlimited ? (
            <span className="text-[var(--success-text)]">{t("unlimited")}</span>
          ) : (
            <>
              {used} <span className="text-[var(--text-muted)]">/ {max}</span>
            </>
          )}
        </p>
      </div>
      {!unlimited && (
        <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${ratio * 100}%` }} />
        </div>
      )}
    </div>
  );
}
