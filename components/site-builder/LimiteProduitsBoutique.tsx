"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { PLAN_LIMITS, planLabel, planSuperieurProduitsBoutique, type Plan } from "@/lib/plan-limits";
import { LIEN_CHANGER_DE_PLAN } from "@/lib/plan-links";

// Limite de produits par boutique du plan (lib/plan-limits.ts), la même que celle appliquée
// par POST /api/boutiques/[id]/produits. Le serveur reste la référence ; ceci n'en est que
// l'affichage.
export function limiteProduitsAtteinte(plan: Plan, count: number): boolean {
  const max = PLAN_LIMITS[plan].produitsBoutiqueMax;
  return max !== null && count >= max;
}

export function CompteurProduits({ plan, count }: { plan: Plan; count: number }) {
  const t = useTranslations("siteBuilder.boutique.limite");
  const max = PLAN_LIMITS[plan].produitsBoutiqueMax;
  const atteinte = limiteProduitsAtteinte(plan, count);
  return (
    <span
      className={`rounded-full border px-3 py-2 text-xs font-semibold tabular-nums ${
        atteinte
          ? "border-[var(--warning)]/40 bg-amber-500/10 text-[var(--warning)]"
          : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)]"
      }`}
    >
      {max === null ? t("compteurIllimite", { count }) : t("compteur", { count, max, plan: planLabel(plan) })}
    </span>
  );
}

// Message sous le formulaire d'ajout : limite atteinte (ajout bloqué), ou boutique au-delà de
// la limite après un passage à un plan inférieur (aucun produit supprimé, ajouts bloqués).
export function AlerteLimiteProduits({ plan, count }: { plan: Plan; count: number }) {
  const t = useTranslations("siteBuilder.boutique.limite");
  const max = PLAN_LIMITS[plan].produitsBoutiqueMax;
  if (max === null || count < max) return null;

  const superieur = planSuperieurProduitsBoutique(plan);
  const maxSuperieur = superieur ? PLAN_LIMITS[superieur].produitsBoutiqueMax : null;
  const depassement = count > max;

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-[var(--warning)]">
      <p>
        {depassement
          ? t("depassement", { count, max, plan: planLabel(plan) })
          : t("atteinte", { max, plan: planLabel(plan) })}
      </p>
      {superieur ? (
        <Link href={LIEN_CHANGER_DE_PLAN} className="mt-1 inline-block font-semibold underline underline-offset-2">
          {maxSuperieur === null
            ? t("passerIllimite", { plan: planLabel(superieur) })
            : t("passer", { plan: planLabel(superieur), max: maxSuperieur })}
        </Link>
      ) : null}
    </div>
  );
}

// Bandeau en haut de la page de gestion quand la boutique dépasse la limite du plan actuel
// (passage à un plan inférieur) : rien n'est supprimé, seuls les ajouts sont bloqués.
export function BandeauDepassementProduits({ plan, count }: { plan: Plan; count: number }) {
  const t = useTranslations("siteBuilder.boutique.limite");
  const max = PLAN_LIMITS[plan].produitsBoutiqueMax;
  if (max === null || count <= max) return null;
  const superieur = planSuperieurProduitsBoutique(plan);
  return (
    <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6 text-sm text-[var(--warning)]">
      <p>{t("depassement", { count, max, plan: planLabel(plan) })}</p>
      {superieur ? (
        <Link href={LIEN_CHANGER_DE_PLAN} className="mt-1 inline-block font-semibold underline underline-offset-2">
          {t("voirPlans")}
        </Link>
      ) : null}
    </div>
  );
}
