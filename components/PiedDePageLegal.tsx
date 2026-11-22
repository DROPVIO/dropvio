"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

/** Pied de page juridique commun à toutes les pages de Dropvio (publiques et outil).
 *  Absent des vitrines publiques des marchands (/boutiques/<slug> ou leur sous-domaine) :
 *  elles ont leurs propres mentions légales. « Résilier votre contrat » n'apparaît qu'aux
 *  comptes connectés. */
export default function PiedDePageLegal({ connecte, vitrine }: { connecte: boolean; vitrine: boolean }) {
  const pathname = usePathname();
  const t = useTranslations("piedDePage");
  const tRetractation = useTranslations("retractation");
  const tResiliation = useTranslations("resiliation");
  if (vitrine || /^\/boutiques\/[^/]+/.test(pathname)) return null;

  const lien = "text-[var(--text-faint)] no-underline transition hover:text-[var(--text-muted)]";
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--bg)]">
      <nav aria-label={t("titre")} className="mx-auto flex max-w-[1200px] flex-wrap gap-x-5 gap-y-2 px-4 py-5 text-xs sm:px-6">
        <Link href="/mentions-legales" className={lien}>{t("mentions")}</Link>
        <Link href="/cgv" className={lien}>{t("cgv")}</Link>
        <Link href="/confidentialite" className={lien}>{t("confidentialite")}</Link>
        <Link href="/retractation" className={lien}>{tRetractation("lien")}</Link>
        {connecte ? <Link href="/resiliation" className={lien}>{tResiliation("lien")}</Link> : null}
      </nav>
    </footer>
  );
}
