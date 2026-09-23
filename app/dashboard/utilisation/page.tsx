"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { UsageMeter } from "@/components/UsageMeter";

type UsageMetric = { key: string; label: string; used: number; max: number | null };
type BoutiqueUsage = { id: string; nom: string; used: number; max: number | null };
type UsageData = {
  plan: string;
  monthly: UsageMetric[];
  total: UsageMetric[];
  catalogue: { max: number | null };
  boutiques: BoutiqueUsage[];
};

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", agency: "Agency" };

// /api/usage renvoie un libellé en dur (français) à côté de chaque `key` — on ignore ce
// libellé et on traduit à partir de la clé stable, pour ne pas dépendre de la langue du
// serveur (même approche que les autres écrans de cette zone).
const METRIC_KEYS: Record<string, string> = {
  audits_ia: "metricAuditsIa",
  sites_generes: "metricSitesGeneres",
  simulations_marge: "metricSimulationsMarge",
};

export default function UtilisationDetailPage() {
  const t = useTranslations("dashboard");
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? t("utilisation.errorLoad"));
          return;
        }
        setUsage(json);
      })
      .catch(() => setError(t("utilisation.errorServer")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metricLabel = (key: string, fallback: string) =>
    METRIC_KEYS[key] ? t(`utilisation.${METRIC_KEYS[key]}`) : fallback;

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
            {t("common.back")}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3">{t("utilisation.title")}</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">
            {t("utilisation.subtitle", { plan: usage ? PLAN_LABEL[usage.plan] ?? usage.plan : "…" })}
          </p>
        </div>

        {loading ? (
          <p className="text-[var(--text-faint)] text-sm text-center py-12">{t("common.loading")}</p>
        ) : error ? (
          <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">{error}</div>
        ) : usage ? (
          <div className="flex flex-col gap-8">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">
                {t("utilisation.thisMonth")}
              </p>
              {usage.monthly.map((m) => (
                <UsageMeter key={m.key} label={metricLabel(m.key, m.label)} used={m.used} max={m.max} />
              ))}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">
                {t("utilisation.total")}
              </p>
              {usage.total.map((m) => (
                <UsageMeter key={m.key} label={metricLabel(m.key, m.label)} used={m.used} max={m.max} />
              ))}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-3">
              <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">
                {t("utilisation.catalogueTitle")}
              </p>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3.5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{t("utilisation.catalogueLabel")}</p>
                  <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("utilisation.catalogueCaption")}</p>
                </div>
                <p className="text-xs font-semibold shrink-0">
                  {usage.catalogue.max === null ? (
                    <span className="text-[var(--success)]">{t("utilisation.catalogueFull")}</span>
                  ) : (
                    <span className="text-[var(--text-muted)]">
                      {t("utilisation.catalogueLimited", { max: usage.catalogue.max })}
                    </span>
                  )}
                </p>
              </div>

              {usage.boutiques.length === 0 ? (
                <p className="text-[11px] text-[var(--text-faint)]">{t("utilisation.noBoutique")}</p>
              ) : (
                usage.boutiques.map((b) => (
                  <UsageMeter
                    key={b.id}
                    label={t("utilisation.boutiqueProduits", { nom: b.nom })}
                    used={b.used}
                    max={b.max}
                  />
                ))
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
