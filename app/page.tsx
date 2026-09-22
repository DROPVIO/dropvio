"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import { applyTheme, getStoredTheme } from "@/lib/theme";

// ─── Static data ──────────────────────────────────────────────────────────────

const FLOW_STEPS = [
  { num: "01", title: "Recherche produit", desc: "Interrogez le catalogue AliExpress par niche, prix, délai de livraison et vendeur. Les produits sans marge viable sont écartés avant même l'analyse." },
  { num: "02", title: "Calcul de marge — mode France", desc: "Cotisations URSSAF, TVA, taxes à l'import UE et commissions Stripe déduites automatiquement. Vous voyez la marge nette, pas la marge brute qui fait rêver." },
  { num: "03", title: "Audit IA de la page de vente", desc: "Un score sur 100 et des correctifs classés par impact, appuyés sur les référentiels Nielsen Norman Group, Unbounce et McKinsey." },
  { num: "04", title: "Génération du site", desc: "Mono-produit ou boutique multi-produits : 4 templates, palettes personnalisables, textes de vente pré-remplis. En quelques clics." },
  { num: "05", title: "Commande AliExpress", desc: "Les commandes entrantes de votre boutique Shopify remontent dans Dropvio et partent chez le fournisseur, avec leur statut au même endroit." },
  { num: "06", title: "Tracking poussé vers Shopify", desc: "Dès que le numéro de suivi existe, il est envoyé automatiquement à Shopify. Le client est notifié, votre SAV se vide." },
] as const;

const PRODUCT_FEATURES = [
  { icon: "◎", title: "Produits gagnants", desc: "Recherche directe dans l'API AliExpress, filtres sur le délai, le vendeur et le potentiel de marge.", variant: "a" },
  { icon: "%", title: "Marge nette française", desc: "URSSAF, TVA, taxes UE et frais Stripe intégrés au calcul. Le chiffre que vous gardez vraiment.", variant: "a" },
  { icon: "AI", title: "Audit IA, score sur 100", desc: "Diagnostic de votre page de vente sur des référentiels UX reconnus, avec priorités d'action.", variant: "a" },
  { icon: "◧", title: "Site & boutique en 1 clic", desc: "4 templates, palettes personnalisables, mono-produit ou catalogue multi-produits.", variant: "b" },
  { icon: "⇄", title: "Connexion Shopify", desc: "Reliez une boutique existante ou celle générée par Dropvio, sans manipulation technique.", variant: "b" },
  { icon: "⤴", title: "Suivi & push tracking", desc: "Commandes AliExpress suivies et numéro de suivi renvoyé automatiquement dans Shopify.", variant: "b" },
] as const;

const RESULT_BARS = [
  { label: "Sourcing\nproduit", before: 72, after: 18 },
  { label: "Calcul de\nmarge", before: 58, after: 9 },
  { label: "Création\ndu site", before: 86, after: 22 },
  { label: "Suivi des\ncommandes", before: 64, after: 7 },
] as const;

const MINI_FAQ = [
  { q: "Le calcul de marge est-il adapté au statut français ?", a: "Oui : le mode France intègre les cotisations URSSAF, la TVA, les taxes à l'import UE et les frais Stripe pour afficher une marge nette." },
  { q: "Puis-je garder ma boutique Shopify existante ?", a: "Oui. Connectez votre boutique actuelle : les commandes remontent dans Dropvio et le numéro de suivi repart automatiquement vers Shopify." },
  { q: "Sur quoi repose l'audit IA ?", a: "Sur des critères issus des travaux du Nielsen Norman Group, des benchmarks Unbounce et d'études McKinsey sur la conversion, traduits en un score sur 100." },
] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);

  function toggleTheme() {
    applyTheme(getStoredTheme() === "light" ? "dark" : "light");
  }

  function handleFaqToggle(event: React.SyntheticEvent<HTMLDetailsElement>) {
    const mark = event.currentTarget.querySelector<HTMLElement>("summary span:last-child");
    if (!mark) return;
    mark.style.transition = "transform .3s cubic-bezier(.16,1,.3,1)";
    mark.style.transform = event.currentTarget.open ? "rotate(135deg)" : "none";
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);

    function fillBars(chart: Element) {
      chart.querySelectorAll<HTMLElement>("[data-bar]").forEach((bar, i) => {
        const value = (bar.getAttribute("data-val") ?? "0") + "%";
        const prop = bar.getAttribute("data-axis") === "h" ? "height" : "width";
        if (reduce) { bar.style[prop] = value; return; }
        window.setTimeout(() => { bar.style[prop] = value; }, 90 * i);
      });
    }

    function count(el: HTMLElement) {
      const to = parseFloat(el.getAttribute("data-to") ?? "0");
      if (reduce) { el.textContent = String(to); return; }
      const t0 = performance.now();
      const dur = 1300;
      function tick(now: number) {
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = String(Math.round(to * ease(p)));
        if (p < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    // Reveal / chart-fill / count-up / line-fill — un seul IntersectionObserver
    // pour tous les éléments, même modèle (seuil, marge, désabonnement après
    // déclenchement) que le script inline d'origine du design.
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          io.unobserve(el);
          if (el.hasAttribute("data-reveal")) {
            const siblings = el.parentElement
              ? Array.from(el.parentElement.children).filter((n) => n.hasAttribute("data-reveal"))
              : [el];
            const idx = Math.max(0, siblings.indexOf(el));
            el.style.transitionDelay = reduce ? "0ms" : `${Math.min(idx * 80, 400)}ms`;
            el.setAttribute("data-reveal", "in");
          }
          if (el.hasAttribute("data-chart")) fillBars(el);
          if (el.hasAttribute("data-count")) count(el);
          if (el.hasAttribute("data-line")) {
            const fill = el.querySelector<HTMLElement>("[data-line-fill]");
            if (fill) fill.style.height = "100%";
          }
        });
      },
      { threshold: 0.18, rootMargin: "0px 0px -8% 0px" }
    );
    root.querySelectorAll("[data-reveal],[data-chart],[data-count],[data-line]").forEach((el) => io.observe(el));

    // Anneau du score IA — toujours au-dessus de la ligne de flottaison,
    // animé une fois au montage plutôt que déclenché au scroll.
    const ring = root.querySelector<SVGCircleElement>("[data-ring]");
    const ringNum = root.querySelector<HTMLElement>("[data-ring-num]");
    const target = 91;
    const circumference = 640.9;
    let raf = 0;
    if (ring) {
      if (reduce) {
        ring.style.strokeDashoffset = String(circumference * (1 - target / 100));
        if (ringNum) ringNum.textContent = String(target);
      } else {
        const t0 = performance.now() + 250;
        const dur = 2000;
        const tick = (now: number) => {
          const p = Math.max(0, Math.min(1, (now - t0) / dur));
          const e = 1 - Math.pow(1 - p, 5);
          ring.style.strokeDashoffset = String(circumference * (1 - (target / 100) * e));
          if (ringNum) ringNum.textContent = String(Math.round(target * e));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
    }

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={rootRef} className="dv-home relative min-h-screen overflow-hidden bg-[var(--dv-bg)] font-[Inter,system-ui,sans-serif] text-[var(--dv-ink)] antialiased">
      {/* Fonts */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600&display=swap"
        rel="stylesheet"
      />

      {/* Fond décoratif : grille + halo */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.28]"
        style={{
          backgroundImage:
            "linear-gradient(var(--dv-grid) 1px,transparent 1px),linear-gradient(90deg,var(--dv-grid) 1px,transparent 1px)",
          backgroundSize: "78px 78px",
          maskImage: "radial-gradient(120% 90% at 50% 0%,#000 10%,transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[220px] left-1/2 z-0 h-[620px] w-[1100px] -translate-x-1/2 opacity-[0.13] blur-[20px]"
        style={{ background: "radial-gradient(50% 50% at 50% 50%,var(--dv-accent),transparent 70%)" }}
      />

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[var(--dv-line)] bg-[var(--dv-glass)] backdrop-blur-[18px] backdrop-saturate-[1.4]">
        <nav className="mx-auto flex max-w-[1200px] items-center gap-[22px] px-[22px] py-[14px]">
          <a href="#top" className="flex items-center gap-2.5 text-[var(--dv-ink)]">
            <Logo className="h-7 w-7 text-[var(--dv-logo)]" />
            <span className="font-['Plus_Jakarta_Sans',sans-serif] text-[19px] font-extrabold tracking-[-0.03em]">Dropvio</span>
          </a>
          <div className="ml-auto hidden items-center gap-[26px] text-[14.5px] font-medium sm:flex">
            <a href="#flux" className="dv-nav-link text-[var(--dv-muted)] transition-colors">Le flux</a>
            <a href="#produit" className="dv-nav-link text-[var(--dv-muted)] transition-colors">Produit</a>
            <a href="#resultats" className="dv-nav-link text-[var(--dv-muted)] transition-colors">Résultats</a>
            <a href="#pricing" className="dv-nav-link text-[var(--dv-muted)] transition-colors">Tarifs</a>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Changer de thème"
            className="dv-theme-btn grid h-[38px] w-[38px] flex-none place-items-center rounded-[11px] border border-[var(--dv-line)] bg-[var(--dv-card)] text-[var(--dv-muted)] transition-[transform,color,border-color] duration-200"
          >
            <span className="dv-icon-dark text-[15px] leading-none">☾</span>
            <span className="dv-icon-light text-[15px] leading-none">☀</span>
          </button>
          <Link
            href="/register"
            className="dv-btn-primary flex-none rounded-xl bg-[var(--dv-accent)] px-5 py-[11px] font-['Plus_Jakarta_Sans',sans-serif] text-[14.5px] font-bold text-[var(--dv-accent-ink)] shadow-[0_10px_30px_-12px_var(--dv-accent)] transition-[transform,box-shadow] duration-200"
          >
            Commencer gratuitement
          </Link>
        </nav>
      </header>

      <main id="top" className="relative z-[1] mx-auto max-w-[1200px] px-[22px]">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="grid items-center gap-14 py-[clamp(48px,7vw,104px)] pb-[clamp(40px,5vw,72px)] lg:grid-cols-2">
          <div data-reveal="" data-slide="left">
            <div className="inline-flex items-center gap-[9px] rounded-full border border-[var(--dv-line)] bg-[var(--dv-card)] py-[7px] pl-[9px] pr-[14px] text-[13px] font-medium text-[var(--dv-muted)]">
              <span
                className="h-[7px] w-[7px] animate-[dv-pulse_2.4s_ease-in-out_infinite] rounded-full bg-[var(--dv-accent)]"
                style={{ boxShadow: "0 0 0 4px color-mix(in oklab,var(--dv-accent) 22%,transparent)" }}
              />
              Mode France : URSSAF, TVA, taxes UE, frais Stripe
            </div>
            <h1 className="mt-[22px] text-[clamp(40px,5.6vw,68px)] font-extrabold leading-[1.02]">
              La nouvelle voix du <span className="text-[var(--dv-accent)]">dropshipping.</span>
            </h1>
            <p className="mt-5 max-w-[52ch] text-[clamp(16px,1.3vw,18.5px)] leading-[1.6] text-[var(--dv-muted)]">
              Trouvez un produit gagnant, connaissez votre marge nette réelle, faites auditer votre page de vente par l&apos;IA et lancez la boutique — dans un seul outil, pensé pour la fiscalité française.
            </p>
            <div className="mt-[30px] flex flex-wrap gap-3">
              <Link
                href="/register"
                className="dv-btn-primary rounded-2xl bg-[var(--dv-accent)] px-[26px] py-[15px] font-['Plus_Jakarta_Sans',sans-serif] text-[16px] font-bold text-[var(--dv-accent-ink)] shadow-[0_16px_40px_-16px_var(--dv-accent)] transition-[transform,box-shadow] duration-300"
              >
                Commencer gratuitement
              </Link>
              <a
                href="#pricing"
                className="dv-btn-secondary rounded-2xl border border-[var(--dv-line)] bg-[var(--dv-card)] px-6 py-[15px] font-['Plus_Jakarta_Sans',sans-serif] text-[16px] font-semibold text-[var(--dv-ink)] transition-[transform,border-color,background] duration-300"
              >
                Voir les tarifs
              </a>
            </div>
            <p className="mt-[18px] text-[13px] text-[var(--dv-faint)]">Aucune carte bancaire requise · Sans engagement</p>
          </div>

          <div data-reveal="" data-slide="right" className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-x-[8%] -inset-y-[14%] opacity-[0.18] blur-[30px]"
              style={{ background: "radial-gradient(45% 45% at 62% 32%,var(--dv-accent),transparent 70%)" }}
            />
            <div className="dv-hero-card relative rounded-[26px] border border-[var(--dv-line)] bg-[var(--dv-card)] p-[26px] shadow-[0_44px_90px_-50px_oklch(0_0_0_/_0.8)] transition-transform duration-500">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-['Plus_Jakarta_Sans',sans-serif] text-[15.5px] font-bold">Audit IA · page de vente</div>
                  <div className="mt-[3px] text-[12.5px] text-[var(--dv-faint)]">Référentiels NN/g · Unbounce · McKinsey</div>
                </div>
                <span className="rounded-full bg-[color-mix(in_oklab,var(--dv-accent)_16%,transparent)] px-[11px] py-[6px] text-[11.5px] font-bold tracking-[0.04em] text-[var(--dv-accent)]">
                  TERMINÉ
                </span>
              </div>

              <div className="flex justify-center py-[22px] pb-2">
                <div className="relative h-[236px] w-[236px]">
                  <div
                    aria-hidden
                    className="absolute -inset-[18px] animate-[dv-spin_7s_linear_infinite] rounded-full opacity-[0.22] blur-[16px]"
                    style={{ background: "conic-gradient(from 0deg,transparent 0deg,var(--dv-accent) 120deg,transparent 240deg)" }}
                  />
                  <svg viewBox="0 0 240 240" width="236" height="236" className="relative -rotate-90">
                    <circle cx="120" cy="120" r="102" fill="none" stroke="var(--dv-line)" strokeWidth="14" />
                    <circle
                      data-ring=""
                      cx="120"
                      cy="120"
                      r="102"
                      fill="none"
                      stroke="var(--dv-accent)"
                      strokeWidth="14"
                      strokeLinecap="round"
                      strokeDasharray="640.9"
                      strokeDashoffset="640.9"
                      style={{ filter: "drop-shadow(0 0 12px color-mix(in oklab,var(--dv-accent) 60%,transparent))" }}
                    />
                  </svg>
                  <div className="absolute inset-0 grid place-content-center text-center">
                    <div className="font-['Plus_Jakarta_Sans',sans-serif] text-[60px] font-extrabold leading-none tracking-[-0.05em]">
                      <span data-ring-num="">0</span>
                      <span className="text-2xl font-semibold text-[var(--dv-faint)]">/100</span>
                    </div>
                    <div className="mt-2 text-xs font-semibold tracking-[0.14em] text-[var(--dv-faint)]">SCORE GLOBAL</div>
                  </div>
                </div>
              </div>

              <div data-chart="" className="mt-2 grid gap-[13px]">
                {[
                  { label: "Clarté de la promesse", value: 94, bg: "var(--dv-accent)", opacity: 1 },
                  { label: "Preuve sociale", value: 88, bg: "var(--dv-accent-2)", opacity: 1 },
                  { label: "Friction du tunnel", value: 76, bg: "var(--dv-accent)", opacity: 0.75 },
                ].map((row) => (
                  <div key={row.label} className="grid grid-cols-[1fr_auto] items-center gap-2 text-[13px]">
                    <div className="text-[var(--dv-muted)]">{row.label}</div>
                    <div className="font-semibold tabular-nums text-[var(--dv-ink)]">{row.value}</div>
                    <div className="col-span-2 h-[7px] overflow-hidden rounded-full bg-[var(--dv-card-2)]">
                      <div
                        data-bar=""
                        data-val={row.value}
                        style={{ width: "0%", height: "100%", borderRadius: 99, background: row.bg, opacity: row.opacity, transition: "width 1.25s cubic-bezier(.16,1,.3,1)" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Le flux ──────────────────────────────────────────────── */}
        <section id="flux" className="py-[clamp(64px,8vw,116px)] pb-[clamp(40px,5vw,64px)]">
          <div data-reveal="" className="max-w-[620px]">
            <div className="text-xs font-bold tracking-[0.16em] text-[var(--dv-accent)]">LE FLUX COMPLET</div>
            <h2 className="mt-3.5 text-[clamp(30px,3.8vw,46px)] font-extrabold leading-[1.08]">
              Du produit repéré au colis suivi. Sans quitter Dropvio.
            </h2>
            <p className="mt-4 text-[16.5px] leading-[1.6] text-[var(--dv-muted)]">
              Six étapes, une seule chaîne de décision. Chaque étape alimente la suivante avec vos vrais chiffres.
            </p>
          </div>

          <div className="relative mt-12 grid gap-3.5">
            <div data-line="" className="absolute bottom-[18px] left-[25px] top-[18px] w-0.5 overflow-hidden bg-[var(--dv-line)]">
              <div
                data-line-fill=""
                className="absolute inset-0 h-0 transition-[height] duration-[1.6s]"
                style={{ background: "linear-gradient(var(--dv-accent),var(--dv-accent-2))", transitionTimingFunction: "cubic-bezier(.16,1,.3,1)" }}
              />
            </div>

            {FLOW_STEPS.map((step) => (
              <div
                key={step.num}
                data-reveal=""
                className="dv-step relative grid grid-cols-[52px_1fr] items-start gap-[18px] rounded-[18px] border border-transparent p-4 transition-[border-color,background,transform] duration-300"
              >
                <div
                  className={
                    step.num === "06"
                      ? "grid h-[52px] w-[52px] place-items-center rounded-[15px] border border-[var(--dv-accent)] bg-[var(--dv-accent)] font-['Plus_Jakarta_Sans',sans-serif] text-[17px] font-extrabold text-[var(--dv-accent-ink)] shadow-[0_14px_36px_-14px_var(--dv-accent)]"
                      : "grid h-[52px] w-[52px] place-items-center rounded-[15px] border border-[var(--dv-line)] bg-[var(--dv-card)] font-['Plus_Jakarta_Sans',sans-serif] text-[17px] font-extrabold text-[var(--dv-accent)]"
                  }
                >
                  {step.num}
                </div>
                <div>
                  <h3 className="text-[19.5px] font-bold">{step.title}</h3>
                  <p className="mt-[7px] max-w-[66ch] text-[15.2px] leading-[1.6] text-[var(--dv-muted)]">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Produit ──────────────────────────────────────────────── */}
        <section id="produit" className="py-[clamp(56px,7vw,100px)]">
          <div data-reveal="" className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-[580px]">
              <div className="text-xs font-bold tracking-[0.16em] text-[var(--dv-accent)]">PRODUIT</div>
              <h2 className="mt-3.5 text-[clamp(30px,3.8vw,46px)] font-extrabold leading-[1.08]">
                Six modules. Une décision : est-ce que ce produit paie ?
              </h2>
            </div>
            <Link href="/register" className="text-[15px] font-semibold">Tout tester gratuitement →</Link>
          </div>

          <div className="mt-[42px] grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCT_FEATURES.map((feat) => (
              <div
                key={feat.title}
                data-reveal=""
                className={`dv-feature-card relative overflow-hidden rounded-[20px] border border-[var(--dv-line)] bg-[var(--dv-card)] p-[26px] transition-[transform,border-color,box-shadow] duration-[0.45s] ${feat.variant === "b" ? "is-accent-2" : ""}`}
              >
                <div
                  className={
                    feat.variant === "a"
                      ? "grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--dv-accent)_16%,transparent)] font-['Plus_Jakarta_Sans',sans-serif] font-extrabold text-[var(--dv-accent)]"
                      : "grid h-10 w-10 place-items-center rounded-xl bg-[color-mix(in_oklab,var(--dv-accent-2)_16%,transparent)] font-['Plus_Jakarta_Sans',sans-serif] font-extrabold text-[var(--dv-accent-2)]"
                  }
                >
                  {feat.icon}
                </div>
                <h3 className="mt-[18px] text-[18.5px] font-bold">{feat.title}</h3>
                <p className="mt-[9px] text-[14.8px] leading-[1.6] text-[var(--dv-muted)]">{feat.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Résultats ────────────────────────────────────────────── */}
        <section id="resultats" className="py-[clamp(56px,7vw,100px)]">
          <div
            data-reveal=""
            className="grid grid-cols-1 items-center gap-10 rounded-[26px] border border-[var(--dv-line)] bg-[var(--dv-bg-soft)] p-[clamp(24px,3vw,40px)] lg:grid-cols-2"
          >
            <div>
              <div className="text-xs font-bold tracking-[0.16em] text-[var(--dv-accent)]">RÉSULTATS</div>
              <h2 className="mt-3.5 text-[clamp(27px,3.2vw,40px)] font-extrabold leading-[1.1]">
                Le temps passe dans l&apos;analyse, plus dans les tableurs.
              </h2>
              <p className="mt-[15px] text-[15.8px] leading-[1.6] text-[var(--dv-muted)]">
                Heures hebdomadaires par tâche, avant et après Dropvio. Données illustratives issues de nos scénarios d&apos;usage.
              </p>
              <div className="mt-6 flex flex-wrap gap-[18px]">
                <div className="flex items-center gap-2 text-[13.5px] text-[var(--dv-muted)]">
                  <span className="h-[11px] w-[11px] rounded-[3px] bg-[var(--dv-line)]" />Avant
                </div>
                <div className="flex items-center gap-2 text-[13.5px] text-[var(--dv-muted)]">
                  <span className="h-[11px] w-[11px] rounded-[3px] bg-[var(--dv-accent)]" />Avec Dropvio
                </div>
              </div>
              <div className="mt-[30px] grid grid-cols-3 gap-4">
                <div>
                  <div className="font-['Plus_Jakarta_Sans',sans-serif] text-[34px] font-extrabold tracking-[-0.04em]">
                    <span data-count="" data-to="82">0</span>%
                  </div>
                  <div className="mt-1 text-[13px] text-[var(--dv-faint)]">de temps de setup en moins</div>
                </div>
                <div>
                  <div className="font-['Plus_Jakarta_Sans',sans-serif] text-[34px] font-extrabold tracking-[-0.04em]">
                    <span data-count="" data-to="4">0</span>
                  </div>
                  <div className="mt-1 text-[13px] text-[var(--dv-faint)]">templates prêts à vendre</div>
                </div>
                <div>
                  <div className="font-['Plus_Jakarta_Sans',sans-serif] text-[34px] font-extrabold tracking-[-0.04em]">
                    <span data-count="" data-to="9">0</span>
                  </div>
                  <div className="mt-1 text-[13px] text-[var(--dv-faint)]">critères d&apos;audit IA analysés</div>
                </div>
              </div>
            </div>

            <div data-chart="" className="grid h-[290px] grid-cols-4 gap-3 border-b border-[var(--dv-line)] px-1 pt-[18px] sm:gap-[26px]">
              {RESULT_BARS.map((bar) => (
                <div key={bar.label} className="flex h-full flex-col items-center justify-end gap-2.5">
                  <div className="flex h-full w-full items-end justify-center gap-1.5">
                    <div
                      data-bar=""
                      data-val={bar.before}
                      data-axis="h"
                      className="w-[26px] rounded-t-lg bg-[var(--dv-line)] transition-[height] duration-[1.1s]"
                      style={{ height: 0, transitionTimingFunction: "cubic-bezier(.16,1,.3,1)" }}
                    />
                    <div
                      data-bar=""
                      data-val={bar.after}
                      data-axis="h"
                      className="w-[26px] rounded-t-lg bg-[var(--dv-accent)] shadow-[0_0_26px_-6px_var(--dv-accent)] transition-[height] duration-[1.1s]"
                      style={{ height: 0, transitionTimingFunction: "cubic-bezier(.16,1,.3,1)" }}
                    />
                  </div>
                  <div className="whitespace-pre-line text-center text-[12.5px] leading-[1.3] text-[var(--dv-faint)]">{bar.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────── */}
        <section id="pricing" className="py-[clamp(56px,7vw,100px)]">
          <div data-reveal="" className="mx-auto max-w-[620px] text-center">
            <div className="text-xs font-bold tracking-[0.16em] text-[var(--dv-accent)]">TARIFS</div>
            <h2 className="mt-3.5 text-[clamp(30px,3.8vw,46px)] font-extrabold leading-[1.08]">Simple, honnête, sans surprise.</h2>
            <p className="mt-[15px] text-[16px] leading-[1.6] text-[var(--dv-muted)]">
              Commencez gratuitement. Passez à l&apos;échelle quand votre boutique le justifie.
            </p>
          </div>

          <div className="mt-11 grid grid-cols-1 items-start gap-5 md:grid-cols-3">
            <div data-reveal="" className="dv-price-card rounded-[22px] border border-[var(--dv-line)] bg-[var(--dv-card)] p-[30px] transition-[transform,box-shadow] duration-[0.45s]">
              <div className="font-['Plus_Jakarta_Sans',sans-serif] text-[17px] font-bold">Free</div>
              <div className="mt-3.5 flex items-baseline gap-1.5">
                <span className="font-['Plus_Jakarta_Sans',sans-serif] text-[46px] font-extrabold tracking-[-0.045em]">0€</span>
                <span className="text-[15px] text-[var(--dv-faint)]">/ mois</span>
              </div>
              <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--dv-muted)]">Pour tester Dropvio sans limite de temps, à votre rythme.</p>
              <div className="mt-[22px] grid gap-[11px] text-[14.5px] text-[var(--dv-muted)]">
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent)]">✓</span>Audit IA réservé à Pro et Agency</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent)]">✓</span>2 simulations de calcul de marge sauvegardées</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent)]">✓</span>5 pages générées avec le site builder par mois</div>
              </div>
              <Link
                href="/register"
                className="dv-price-cta-outline mt-[26px] block rounded-[13px] border border-[var(--dv-line)] bg-[var(--dv-card-2)] py-[13px] text-center font-['Plus_Jakarta_Sans',sans-serif] text-[15px] font-bold text-[var(--dv-ink)] transition-[border-color,transform] duration-300"
              >
                Commencer
              </Link>
            </div>

            <div
              data-reveal=""
              className="dv-price-card is-featured relative rounded-[22px] border border-[var(--dv-accent)] bg-[var(--dv-card)] p-[30px] pt-[34px] shadow-[0_34px_80px_-46px_var(--dv-accent)] transition-[transform,box-shadow] duration-[0.45s]"
            >
              <div className="absolute -top-[13px] left-[30px] rounded-full bg-[var(--dv-accent)] px-3 py-[5px] font-['Plus_Jakarta_Sans',sans-serif] text-[11.5px] font-extrabold tracking-[0.05em] text-[var(--dv-accent-ink)]">
                LE PLUS CHOISI
              </div>
              <div className="font-['Plus_Jakarta_Sans',sans-serif] text-[17px] font-bold">Pro</div>
              <div className="mt-3.5 flex items-baseline gap-1.5">
                <span className="font-['Plus_Jakarta_Sans',sans-serif] text-[50px] font-extrabold tracking-[-0.045em] text-[var(--dv-accent)]">29€</span>
                <span className="text-[15px] text-[var(--dv-faint)]">/ mois</span>
              </div>
              <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--dv-muted)]">Pour l&apos;e-commerçant qui lance et fait tourner ses produits.</p>
              <div className="mt-[22px] grid gap-[11px] text-[14.5px] text-[var(--dv-muted)]">
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent)]">✓</span>Recherche produit illimitée</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent)]">✓</span>30 audits IA par mois</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent)]">✓</span>Sites &amp; boutiques multi-produits</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent)]">✓</span>Connexion Shopify + push tracking</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent)]">✓</span>Export et téléchargement</div>
              </div>
              <Link
                href="/register"
                className="dv-price-cta-solid mt-[26px] block rounded-[13px] bg-[var(--dv-accent)] py-3.5 text-center font-['Plus_Jakarta_Sans',sans-serif] text-[15.5px] font-extrabold text-[var(--dv-accent-ink)] shadow-[0_16px_40px_-18px_var(--dv-accent)] transition-[transform,box-shadow] duration-300"
              >
                Passer en Pro
              </Link>
            </div>

            <div data-reveal="" className="dv-price-card is-agency rounded-[22px] border border-[var(--dv-line)] bg-[var(--dv-card)] p-[30px] transition-[transform,box-shadow,border-color] duration-[0.45s]">
              <div className="font-['Plus_Jakarta_Sans',sans-serif] text-[17px] font-bold">Agency</div>
              <div className="mt-3.5 flex items-baseline gap-1.5">
                <span className="font-['Plus_Jakarta_Sans',sans-serif] text-[46px] font-extrabold tracking-[-0.045em] text-[var(--dv-accent-2)]">59€</span>
                <span className="text-[15px] text-[var(--dv-faint)]">/ mois</span>
              </div>
              <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--dv-muted)]">Pour gérer plusieurs boutiques ou des comptes clients.</p>
              <div className="mt-[22px] grid gap-[11px] text-[14.5px] text-[var(--dv-muted)]">
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent-2)]">✓</span>Tout le plan Pro</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent-2)]">✓</span>Boutiques multiples</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent-2)]">✓</span>Palettes &amp; templates par client</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent-2)]">✓</span>Suivi des commandes consolidé</div>
                <div className="flex gap-2.5"><span className="text-[var(--dv-accent-2)]">✓</span>Support prioritaire</div>
              </div>
              <Link
                href="/register"
                className="dv-price-cta-outline is-agency mt-[26px] block rounded-[13px] border border-[var(--dv-line)] bg-[var(--dv-card-2)] py-[13px] text-center font-['Plus_Jakarta_Sans',sans-serif] text-[15px] font-bold text-[var(--dv-ink)] transition-[border-color,transform] duration-300"
              >
                Choisir Agency
              </Link>
            </div>
          </div>
        </section>

        {/* ── FAQ courte ───────────────────────────────────────────── */}
        <section className="py-[clamp(40px,5vw,72px)]">
          <div data-reveal="" className="grid grid-cols-1 gap-9 lg:grid-cols-[280px_1fr]">
            <h2 className="text-[clamp(26px,3vw,36px)] font-extrabold leading-[1.12]">Questions fréquentes</h2>
            <div className="grid gap-2.5">
              {MINI_FAQ.map((item) => (
                <details
                  key={item.q}
                  onToggle={handleFaqToggle}
                  className="rounded-[14px] border border-[var(--dv-line)] bg-[var(--dv-card)] p-4 px-[18px]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15.5px] font-semibold">
                    <span>{item.q}</span>
                    <span className="text-[var(--dv-accent)]">+</span>
                  </summary>
                  <p className="mt-3 text-[14.8px] leading-[1.6] text-[var(--dv-muted)]">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA finale ───────────────────────────────────────────── */}
        <section
          data-reveal=""
          className="relative my-[clamp(40px,5vw,72px)] overflow-hidden rounded-[28px] border border-[var(--dv-line)] bg-[var(--dv-bg-soft)] p-[clamp(34px,5vw,64px)] text-center"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-[10%] -bottom-[60%] h-[320px] opacity-[0.18]"
            style={{ background: "radial-gradient(50% 60% at 50% 100%,var(--dv-accent),transparent 70%)" }}
          />
          <div className="relative">
            <Logo className="mx-auto h-[34px] w-[34px] animate-[dv-bob_5s_ease-in-out_infinite] text-[var(--dv-logo)]" />
            <h2 className="mx-auto mt-[22px] max-w-[18ch] text-[clamp(28px,3.8vw,46px)] font-extrabold leading-[1.06]">
              Lancez le prochain produit avec les bons chiffres.
            </h2>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="dv-final-cta-primary rounded-2xl bg-[var(--dv-accent)] px-7 py-[15px] font-['Plus_Jakarta_Sans',sans-serif] text-[16px] font-extrabold text-[var(--dv-accent-ink)] shadow-[0_16px_44px_-16px_var(--dv-accent)] transition-[transform,box-shadow] duration-300"
              >
                Créer mon compte
              </Link>
              <a
                href="#pricing"
                className="dv-final-cta-secondary rounded-2xl border border-[var(--dv-line)] bg-[var(--dv-card)] px-[26px] py-[15px] font-['Plus_Jakarta_Sans',sans-serif] text-[16px] font-semibold text-[var(--dv-ink)] transition-[transform,border-color] duration-300"
              >
                Comparer les offres
              </a>
            </div>
          </div>
        </section>

        {/* ── Footer ───────────────────────────────────────────────── */}
        <footer className="flex flex-wrap items-center justify-between gap-5 border-t border-[var(--dv-line)] py-[34px] pb-[46px]">
          <div className="flex items-center gap-2.5">
            <Logo className="h-[21px] w-[21px] text-[var(--dv-logo)]" />
            <span className="text-[13.5px] text-[var(--dv-faint)]">© 2026 Dropvio — La nouvelle voix du dropshipping.</span>
          </div>
          <div className="flex gap-[22px] text-[13.5px]">
            <a href="#pricing" className="text-[var(--dv-muted)]">Tarifs</a>
            <Link href="/register" className="text-[var(--dv-muted)]">Créer un compte</Link>
            <a href="#top" className="text-[var(--dv-muted)]">Haut de page</a>
          </div>
        </footer>
      </main>
    </div>
  );
}
