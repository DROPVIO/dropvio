"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ExpertCarte } from "@/components/landing/ExpertOffre";
import { AI_BUDGET_PART_JOUR, AI_BUDGET_PART_SEMAINE, type Plan } from "@/lib/plan-limits";
import { PRIX_PLAN_EUR, formatEuros, type PlanPayantAffiche } from "@/lib/prix";

const PLANS: (PlanPayantAffiche & Plan)[] = ["pro", "agency"];

/** Tarifs de la landing. Les chiffres des cartes (sites, audits, produits) suivent
 *  lib/plan-limits.ts ; les limites glissantes du budget IA sont lues directement dans les
 *  constantes pour ne jamais diverger du code. Le plan se choisit après l'inscription, sur
 *  /abonnement. Aucune mention d'essai sur la landing. */
export default function TarifsSection() {
  const t = useTranslations("landing.pricing");
  const locale = useLocale();

  return (
    <section
      id="tarifs"
      style={{ scrollMarginTop: "var(--dv-nav-h)" }}
      className="mx-auto box-border max-w-[1200px] border-t border-[#eee] px-4 py-[clamp(40px,5cqw,72px)] sm:px-6"
    >
      <div data-rv="up" style={{ "--dl": "0ms" } as React.CSSProperties} className="max-w-[720px]">
        <div className="dv-mono text-xs uppercase tracking-[0.1em] text-[#555]">{t("eyebrow")}</div>
        <h2 className="m-0 mt-3 text-[clamp(26px,2.4cqw,34px)] font-[650] leading-[1.15] tracking-[-0.03em]">{t("title")}</h2>
      </div>

      {/* Expert en premier sur mobile et tablette (pleine largeur), en dernier sur grand écran. */}
      <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {PLANS.map((plan, i) => {
          const misEnAvant = plan === "pro";
          return (
            <div
              key={plan}
              data-rv="up"
              style={{ "--dl": `${80 + i * 60}ms` } as React.CSSProperties}
              className={`flex flex-col rounded-2xl border bg-white p-6 ${misEnAvant ? "border-[#7c3aed] shadow-[0_12px_40px_rgba(124,58,237,0.12)]" : "border-[#e6e6e6]"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="m-0 text-lg font-semibold text-[#111]">{t(plan)}</h3>
                {misEnAvant ? (
                  <span className="rounded-full bg-[#7c3aed]/10 px-2.5 py-1 text-xs font-semibold text-[#7c3aed]">{t("recommended")}</span>
                ) : null}
              </div>
              <p className="m-0 mt-3 flex items-baseline gap-1 text-[#111]">
                <span className="text-[34px] font-[650] tracking-[-0.03em]">{formatEuros(PRIX_PLAN_EUR[plan], locale)}</span>
                <span className="text-sm text-[#666]">{t("perMonth")}</span>
              </p>

              <ul className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0 text-sm leading-[1.45] text-[#333]">
                {(t.raw(`features.${plan}`) as string[]).map((f) => (
                  <li key={f} className="flex gap-2.5">
                    <span aria-hidden className="mt-[3px] text-[#7c3aed]">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className={`mt-6 rounded-[10px] px-4 py-3 text-center text-sm font-semibold no-underline transition-colors ${misEnAvant ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9] hover:text-white" : "border border-[#d9d9d9] text-[#111] hover:border-[#7c3aed] hover:text-[#7c3aed]"}`}
              >
                {t(`cta.${plan}`)}
              </Link>
            </div>
          );
        })}
        <ExpertCarte
          className="order-first md:col-span-2 lg:order-none lg:col-span-1"
          style={{ "--dl": "200ms" } as React.CSSProperties}
        />
      </div>

      <div
        data-rv="up"
        style={{ "--dl": "260ms" } as React.CSSProperties}
        className="mt-6 grid gap-5 rounded-2xl border border-[#e6e6e6] bg-[#fafafa] p-6 md:grid-cols-[1fr_1fr]"
      >
        <div>
          <h3 className="m-0 text-base font-semibold text-[#111]">{t("budgetTitre")}</h3>
          <p className="m-0 mt-2 text-sm leading-[1.55] text-[#444]">{t("budgetTexte")}</p>
        </div>
        <div>
          <h3 className="m-0 text-base font-semibold text-[#111]">{t("limitesTitre")}</h3>
          <p className="m-0 mt-2 text-sm leading-[1.55] text-[#444]">
            {t("limitesTexte", { jour: Math.round(AI_BUDGET_PART_JOUR * 100), semaine: Math.round(AI_BUDGET_PART_SEMAINE * 100) })}
          </p>
        </div>
      </div>
    </section>
  );
}
