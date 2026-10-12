"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import Logo from "@/components/Logo";
import ChaineSection from "@/components/landing/ChaineSection";
import DemoAudit from "@/components/landing/DemoAudit";
import FaqAccordion from "@/components/landing/FaqAccordion";
import HeroDevices from "@/components/landing/HeroDevices";
import { useReveal } from "@/components/landing/useReveal";
import { SUPPORT_EMAIL } from "@/lib/contact";

/* Landing publique, portée depuis l'export « Dropvio Landing-2 ».
 *
 * Palette fixe (fond blanc, une section sombre) : contrairement au reste de l'app, la landing
 * ne suit pas data-theme — son contraste repose sur l'alternance clair → sombre → clair, et la
 * maquette n'a pas de bascule de thème. Voir le scope .dv-home dans app/globals.css.
 *
 * La nav ne défile pas avec la page (non sticky), comme dans la maquette : nav + hero occupent
 * exactement un écran, et une nav collante mangerait cette hauteur.
 *
 * Toute la copie passe par le namespace `landing` des 4 locales. Les chiffres annoncés
 * viennent de lib/plan-limits.ts, et aucun texte ne promet d'essai ni de résiliation : il n'y
 * a aujourd'hui ni abonnement Stripe ni parcours d'essai dans le code. */

export default function LandingPage() {
  const t = useTranslations("landing");
  const racineRef = useReveal<HTMLDivElement>();

  const ctaNav =
    "flex-none rounded-lg bg-[#7c3aed] px-[13px] py-[9px] text-sm font-semibold text-white no-underline transition-colors hover:bg-[#6d28d9] hover:text-white";

  return (
    <div ref={racineRef} className="dv-home relative">
      {/* ── Nav ──────────────────────────────────────────────────────── */}
      <header className="dv-hero-nav box-border border-b border-[#eee] bg-white">
        <nav className="mx-auto flex h-full max-w-[1200px] items-center gap-4 px-4 sm:px-6">
          <Link href="#top" className="flex flex-none items-center gap-2 text-[#111] no-underline">
            <Logo className="h-6 w-6 text-[#7c3aed]" />
            {/* Le mot-logo tombe sous 640 px : la nav doit rester sur une ligne pour que
                --dv-nav-h reste exacte. La marque reste identifiée par son signe. */}
            <span className="hidden text-[18px] font-bold tracking-[-0.03em] sm:inline">Dropvio</span>
          </Link>
          <div className="ml-auto flex items-center gap-3 text-sm font-medium sm:gap-[26px]">
            <Link href="/login" className="whitespace-nowrap text-[#111] no-underline">
              {t("nav.login")}
            </Link>
            <Link href="/register" className={ctaNav}>
              <span className="whitespace-nowrap">{t("nav.cta")}</span>
            </Link>
          </div>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section
        id="top"
        className="dv-hero box-border flex items-center justify-center px-4 sm:px-8 lg:px-16"
        style={{ scrollMarginTop: "var(--dv-nav-h)", paddingBlock: "clamp(8px, 2vh, 24px)" }}
      >
        <div className="grid w-full max-w-[1360px] items-center gap-5 lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] lg:gap-12">
          <div className="dv-hero-text flex min-w-0 flex-col justify-center">
            <div className="dv-mono text-xs uppercase tracking-[0.1em] text-[#555]">{t("hero.eyebrow")}</div>
            <h1
              data-rv="hero"
              style={{ "--dl": "0ms", textWrap: "balance" } as React.CSSProperties}
              className="dv-hero-h1 font-[650]"
            >
              {t("hero.title")}
            </h1>
            <p data-rv="hero" style={{ "--dl": "60ms" } as React.CSSProperties} className="dv-hero-sub text-[#555]">
              {t("hero.subtitle")}
            </p>
            <div
              data-rv="hero"
              style={{ "--dl": "120ms" } as React.CSSProperties}
              className="dv-hero-actions flex flex-wrap items-center gap-x-[22px] gap-y-3.5"
            >
              <Link
                href="/register"
                className="dv-hero-primary inline-flex items-center rounded-[10px] bg-[#7c3aed] px-[22px] font-semibold text-white no-underline transition-colors hover:bg-[#6d28d9] hover:text-white"
              >
                {t("hero.ctaPrimary")}
              </Link>
            </div>
            <p className="dv-hero-terms leading-[1.45] text-[#444]">{t("hero.note")}</p>
          </div>

          <div className="dv-hero-devices min-h-[260px] min-w-0">
            <HeroDevices />
          </div>
        </div>
      </section>

      <DemoAudit />
      <ChaineSection />
      <FaqAccordion />

      {/* ── CTA final ────────────────────────────────────────────────── */}
      <section className="mx-auto box-border flex max-w-[1200px] flex-col items-center border-t border-[#eee] px-4 py-[clamp(56px,6cqw,104px)] text-center sm:px-6">
        <h2
          data-rv="up"
          style={{ "--dl": "0ms" } as React.CSSProperties}
          className="m-0 max-w-[640px] text-[clamp(30px,3.2cqw,46px)] font-[650] leading-[1.06] tracking-[-0.035em]"
        >
          {t("final.title")}
        </h2>
        <Link
          href="/register"
          data-rv="up"
          style={{ "--dl": "80ms" } as React.CSSProperties}
          className="mt-7 rounded-[10px] bg-[#7c3aed] px-[22px] py-[15px] text-base font-semibold text-white no-underline transition-colors hover:bg-[#6d28d9] hover:text-white"
        >
          {t("final.cta")}
        </Link>
        <p data-rv="up" style={{ "--dl": "160ms" } as React.CSSProperties} className="mt-3.5 text-sm leading-[1.45] text-[#444]">
          {t("final.note")}
        </p>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <footer data-rv="fade" style={{ "--dl": "0ms" } as React.CSSProperties} className="border-t border-[#eee]">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-[18px] px-4 pb-10 pt-7 sm:px-6">
          <Link href="#top" className="flex items-center gap-2 text-[#111] no-underline">
            <Logo className="h-5 w-5 text-[#7c3aed]" />
            <span className="text-base font-bold tracking-[-0.03em]">Dropvio</span>
            <span className="ml-1 hidden text-[13px] font-normal text-[#777] sm:inline">
              © {new Date().getFullYear()} — {t("footer.tagline")}
            </span>
          </Link>
          <nav className="flex flex-wrap gap-x-6 gap-y-2.5 text-sm">
            <Link href="/faq" className="text-[#444] no-underline">
              {t("footer.faq")}
            </Link>
            <Link href="/cgv" className="text-[#444] no-underline">
              {t("footer.terms")}
            </Link>
            <Link href="/confidentialite" className="text-[#444] no-underline">
              {t("footer.privacy")}
            </Link>
            <Link href="/mentions-legales" className="text-[#444] no-underline">
              {t("footer.legal")}
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#444] no-underline">
              {t("footer.contact")}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
