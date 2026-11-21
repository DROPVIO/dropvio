"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import Logo from "@/components/Logo";
import { ExpertConfigurateur } from "@/components/landing/ExpertOffre";
import { useReveal } from "@/components/landing/useReveal";
import { SUPPORT_EMAIL } from "@/lib/contact";

/** Contenu de /expert (app/expert/page.tsx) : même cadre que la landing (scope .dv-home, palette
 *  fixe, nav et pied de page), avec le configurateur du plan Expert et la recharge Quota. */
export default function ExpertPageContenu() {
  const t = useTranslations("landing");
  const racineRef = useReveal<HTMLDivElement>();

  return (
    <div ref={racineRef} className="dv-home relative min-h-dvh">
      <header className="dv-hero-nav box-border border-b border-[#eee] bg-white">
        <nav className="mx-auto flex h-full max-w-[1200px] items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="flex flex-none items-center gap-2 text-[#111] no-underline">
            <Logo className="h-6 w-6 text-[#7c3aed]" />
            <span className="hidden text-[18px] font-bold tracking-[-0.03em] sm:inline">Dropvio</span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm font-medium sm:gap-[26px]">
            <Link href="/login" className="whitespace-nowrap text-[#111] no-underline">
              {t("nav.login")}
            </Link>
            <Link
              href="/register?plan=expert"
              className="flex-none rounded-lg bg-[#7c3aed] px-[13px] py-[9px] text-sm font-semibold text-white no-underline transition-colors hover:bg-[#6d28d9] hover:text-white"
            >
              <span className="whitespace-nowrap">{t("nav.cta")}</span>
            </Link>
          </div>
        </nav>
      </header>

      <main className="mx-auto box-border max-w-[1200px] px-4 pb-[clamp(48px,6cqw,96px)] pt-[clamp(28px,4cqw,56px)] sm:px-6">
        <Link href="/#tarifs" className="text-sm font-semibold text-[#555] no-underline hover:text-[#7c3aed]">
          {t("expertPage.retour")}
        </Link>
        <div data-rv="up" style={{ "--dl": "0ms" } as React.CSSProperties} className="mt-6 max-w-[720px]">
          <div className="dv-mono text-xs uppercase tracking-[0.1em] text-[#7c3aed]">{t("expertPage.eyebrow")}</div>
          <h1 className="m-0 mt-3 text-[clamp(28px,3cqw,42px)] font-[650] leading-[1.1] tracking-[-0.035em] text-[#111]" style={{ textWrap: "balance" }}>
            {t("expertPage.titre")}
          </h1>
          <p className="m-0 mt-3 text-[15px] leading-[1.6] text-[#444]">{t("expertPage.texte")}</p>
        </div>

        <div className="mt-8">
          <ExpertConfigurateur />
        </div>
      </main>

      <footer className="border-t border-[#eee]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-[18px] px-4 pb-10 pt-7 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-[#111] no-underline">
            <Logo className="h-5 w-5 text-[#7c3aed]" />
            <span className="text-base font-bold tracking-[-0.03em]">Dropvio</span>
          </Link>
          <nav className="flex flex-wrap gap-x-6 gap-y-2.5 text-sm">
            <Link href="/faq" className="text-[#444] no-underline">{t("footer.faq")}</Link>
            <Link href="/cgv" className="text-[#444] no-underline">{t("footer.terms")}</Link>
            <Link href="/confidentialite" className="text-[#444] no-underline">{t("footer.privacy")}</Link>
            <Link href="/mentions-legales" className="text-[#444] no-underline">{t("footer.legal")}</Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#444] no-underline">{t("footer.contact")}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
