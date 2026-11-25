"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

type Usage = {
  plan: string;
  monthly: { key: string; used: number; informatif?: boolean }[];
  budgetIa: { restant?: number; max: number; tokensSortieRestants?: number };
};

/** Générateur de landing page (plans Pro et Agency) : budget IA restant du mois, en euros et en
 *  tokens équivalents, et nombre de sites créés ce mois, à titre informatif seulement. La limite
 *  de création est le budget IA (tokens réellement consommés), jamais le nombre de sites. */
export default function BudgetIaSite() {
  const t = useTranslations("siteBuilder.builder.budgetIa");
  const format = useFormatter();
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setUsage(json as Usage | null))
      .catch(() => setUsage(null));
  }, []);

  // Expert : sites payés à l'unité (quota Expert), hors budget IA. Sans plan payant : rien.
  if (!usage || (usage.plan !== "pro" && usage.plan !== "agency") || typeof usage.budgetIa.restant !== "number") return null;

  const sites = usage.monthly.find((m) => m.key === "sites_generes")?.used ?? 0;
  const restant = usage.budgetIa.restant;
  const epuise = restant < 0.01;

  return (
    <p className={`mt-2 text-xs ${epuise ? "text-[var(--warning-text)]" : "text-[var(--text-faint)]"}`}>
      {epuise
        ? t("epuise")
        : t("restant", {
            euros: format.number(restant, { style: "currency", currency: "EUR" }),
            tokens: format.number(usage.budgetIa.tokensSortieRestants ?? 0),
          })}
      {" · "}
      {t("sitesCrees", { count: sites })}
    </p>
  );
}
