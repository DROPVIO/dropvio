"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { UsageMeter } from "@/components/UsageMeter";
import { useApiErrorMessage } from "@/lib/use-api-error";

// informatif : compteur affiché sans plafond (sites des plans Pro et Agency, limités par le budget IA).
type UsageMetric = { key: string; label: string; used: number; max: number | null; informatif?: boolean };
type BoutiqueUsage = { id: string; nom: string; used: number; max: number | null };
type UsageData = {
  plan: string | null;
  monthly: UsageMetric[];
  total: UsageMetric[];
  catalogue: { max: number | null };
  boutiques: BoutiqueUsage[];
  // Deux budgets séparés : le budget IA (textes, sites, audits) et le budget images (Pro,
  // Agency ; null pour Expert, qui a un quota d'images).
  budgetIa?: { utilise: number; max: number; restant?: number };
  budgetImages?: { utilise: number; max: number; restant: number; imagesRestantes: number } | null;
};

const PLAN_LABEL: Record<string, string> = { pro: "Pro", agency: "Agency", expert: "Expert" };

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
  const format = useFormatter();
  const apiErrorMessage = useApiErrorMessage();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/usage")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(apiErrorMessage(json, t("utilisation.errorLoad")));
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
            {t("utilisation.subtitle", { plan: usage ? (usage.plan ? PLAN_LABEL[usage.plan] ?? usage.plan : t("nav.aucunAbonnement")) : "…" })}
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
              {usage.monthly.map((m) =>
                m.informatif ? (
                  <div key={m.key} className="rounded-xl border border-[var(--border)] px-4 py-3.5 flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{metricLabel(m.key, m.label)}</p>
                    <p className="text-xs font-semibold text-[var(--text-muted)]">{t("utilisation.sitesCrees", { count: m.used })}</p>
                  </div>
                ) : (
                  <UsageMeter key={m.key} label={metricLabel(m.key, m.label)} used={m.used} max={m.max} />
                )
              )}
            </div>

            {usage.budgetIa && usage.budgetIa.max > 0 && (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-3">
                <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">
                  {t("utilisation.budgetsTitre")}
                </p>
                <BudgetLigne
                  libelle={t("utilisation.budgetIa")}
                  aide={t("utilisation.budgetIaAide")}
                  restant={usage.budgetIa.restant ?? Math.max(0, usage.budgetIa.max - usage.budgetIa.utilise)}
                  max={usage.budgetIa.max}
                />
                {usage.budgetImages && (
                  <BudgetLigne
                    libelle={t("utilisation.budgetImages")}
                    aide={t("utilisation.budgetImagesAide", { images: usage.budgetImages.imagesRestantes })}
                    restant={usage.budgetImages.restant}
                    max={usage.budgetImages.max}
                  />
                )}
              </div>
            )}

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
                      {t("utilisation.catalogueLimited", { max: format.number(usage.catalogue.max) })}
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

/** Budget restant du mois, en euros, avec sa barre (même présentation que UsageMeter). */
function BudgetLigne({ libelle, aide, restant, max }: { libelle: string; aide: string; restant: number; max: number }) {
  const t = useTranslations("dashboard");
  const format = useFormatter();
  const euros = (v: number) => format.number(v, { style: "currency", currency: "EUR" });
  const ratio = max > 0 ? Math.min(1, Math.max(0, (max - restant) / max)) : 1;
  const barre = ratio >= 1 ? "bg-red-500" : ratio >= 0.8 ? "bg-amber-500" : "bg-violet-500";
  return (
    <div className="rounded-xl border border-[var(--border)] px-4 py-3.5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">{libelle}</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{aide}</p>
        </div>
        <p className="text-xs font-semibold shrink-0 whitespace-nowrap text-[var(--text-muted)]">
          {t("utilisation.budgetRestant", { restant: euros(restant), max: euros(max) })}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
        <div className={`h-full rounded-full ${barre}`} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
