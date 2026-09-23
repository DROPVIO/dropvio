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

    return () => {
      io.disconnect();
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

      {/* Fond décoratif : fine grille, sans halo lumineux */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.16]"
        style={{
          backgroundImage:
            "linear-gradient(var(--dv-grid) 1px,transparent 1px),linear-gradient(90deg,var(--dv-grid) 1px,transparent 1px)",
          backgroundSize: "78px 78px",
          maskImage: "radial-gradient(120% 90% at 50% 0%,#000 10%,transparent 72%)",
        }}
      />

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-[var(--dv-line)] bg-[var(--dv-glass)] backdrop-blur-[12px]">
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
            className="dv-btn-primary flex-none rounded-xl bg-[var(--dv-accent)] px-5 py-[11px] font-['Plus_Jakarta_Sans',sans-serif] text-[14.5px] font-bold text-[var(--dv-accent-ink)] transition-colors duration-200"
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
              <span className="h-[7px] w-[7px] rounded-full bg-[var(--dv-accent)]" />
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
                className="dv-btn-primary rounded-2xl bg-[var(--dv-accent)] px-[26px] py-[15px] font-['Plus_Jakarta_Sans',sans-serif] text-[16px] font-bold text-[var(--dv-accent-ink)] transition-colors duration-300"
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

          {/* Mockup téléphone vu de trois quarts. Tout est construit en CSS (aucune image) :
              le conteneur porte la perspective, le châssis la rotation. L'écran montre une
              miniature stylisée du dashboard — palette sombre réelle de l'app
              (#0d0d14 / #13131f / accent violet #7c3aed, cf. :root dans globals.css), fixe
              et indépendante du thème de la landing puisqu'il s'agit d'une « capture ». */}
          <div data-reveal="" data-slide="right" className="flex justify-center">
            <div style={{ perspective: "1200px" }}>
              <div
                className="relative h-[520px] w-[256px]"
                style={{
                  transform: "rotateY(-19deg) rotateX(3deg)",
                  transformStyle: "preserve-3d",
                }}
              >
                {/* Tranche : plaque arrière décalée en Z. Avec rotateY négatif, c'est le côté
                    DROIT qui s'avance vers l'utilisateur, donc cette plaque dépasse à droite et
                    donne une vraie épaisseur (et non un bandeau peint). */}
                <div
                  aria-hidden
                  className="absolute inset-0 rounded-[46px]"
                  style={{
                    transform: "translateZ(-12px)",
                    background: "linear-gradient(90deg,#08080a 0%,#1b1b21 55%,#3d3d47 100%)",
                  }}
                />

                <div
                  className="relative h-full w-full rounded-[46px] bg-[#0f0f13] p-[11px]"
                  style={{ boxShadow: "0 38px 60px -34px rgba(0,0,0,0.55), 0 3px 8px rgba(0,0,0,0.16)" }}
                >
                  {/* Reflet du châssis — placé avant l'écran dans le DOM, donc peint dessous :
                      il n'apparaît que sur l'anneau du cadre, jamais sur l'écran. */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-[46px]"
                    style={{
                      background:
                        "linear-gradient(135deg,rgba(255,255,255,0.12) 0%,rgba(255,255,255,0) 34%,rgba(255,255,255,0) 68%,rgba(255,255,255,0.06) 100%)",
                    }}
                  />

                  {/* Écran bord à bord */}
                  <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[38px] bg-[#0d0d14]">
                    <div className="flex min-h-0 flex-1">
                      {/* Sidebar */}
                      <div className="flex w-[38px] shrink-0 flex-col items-center gap-[7px] border-r border-white/[0.06] bg-[#13131f] py-3">
                        <div className="h-[16px] w-[16px] rounded-[5px] bg-[#7c3aed]" />
                        <div className="mt-1 h-[3px] w-[16px] rounded-full bg-white/[0.07]" />
                        <div className="flex h-[19px] w-[19px] items-center justify-center rounded-[6px] bg-[#7c3aed]/25">
                          <div className="h-[7px] w-[7px] rounded-[2px] bg-[#a78bfa]" />
                        </div>
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div key={i} className="flex h-[19px] w-[19px] items-center justify-center rounded-[6px]">
                            <div className="h-[7px] w-[7px] rounded-[2px] bg-white/20" />
                          </div>
                        ))}
                        <div className="mt-auto h-[17px] w-[17px] rounded-full bg-white/[0.09]" />
                      </div>

                      {/* Contenu */}
                      <div className="flex min-w-0 flex-1 flex-col gap-[9px] p-[11px]">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[8px] font-bold leading-none text-white">Dashboard</div>
                            <div className="mt-[3px] h-[3px] w-[52px] rounded-full bg-white/[0.12]" />
                          </div>
                          <div className="h-[15px] w-[15px] rounded-full bg-[#7c3aed]/40" />
                        </div>

                        {/* Cartes de stats */}
                        <div className="grid grid-cols-2 gap-[7px]">
                          {[
                            { l: "Sites", v: "12", c: "#a78bfa" },
                            { l: "Audits", v: "30", c: "#60a5fa" },
                            { l: "Marge", v: "58%", c: "#34d399" },
                            { l: "Produits", v: "1,2k", c: "#fbbf24" },
                          ].map((s) => (
                            <div key={s.l} className="rounded-[7px] border border-white/[0.07] bg-[#13131f] px-[7px] py-[6px]">
                              <div className="text-[5.5px] font-semibold uppercase tracking-[0.1em] text-white/35">{s.l}</div>
                              <div className="mt-[3px] text-[11px] font-bold leading-none" style={{ color: s.c }}>
                                {s.v}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Graphique */}
                        <div className="rounded-[7px] border border-white/[0.07] bg-[#13131f] p-[8px]">
                          <div className="mb-[6px] flex items-center justify-between">
                            <div className="text-[5.5px] font-semibold uppercase tracking-[0.1em] text-white/35">Activité</div>
                            <div className="h-[3px] w-[18px] rounded-full bg-white/[0.1]" />
                          </div>
                          <svg viewBox="0 0 150 46" className="h-[46px] w-full" aria-hidden>
                            {[11, 23, 34].map((y) => (
                              <line key={y} x1="0" y1={y} x2="150" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                            ))}
                            <path
                              d="M0 38 L21 31 L42 34 L63 21 L84 25 L105 12 L126 16 L150 6 L150 46 L0 46 Z"
                              fill="rgba(124,58,237,0.18)"
                            />
                            <path
                              d="M0 38 L21 31 L42 34 L63 21 L84 25 L105 12 L126 16 L150 6"
                              fill="none"
                              stroke="#a78bfa"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <circle cx="150" cy="6" r="2.4" fill="#a78bfa" />
                          </svg>
                        </div>

                        {/* Liste */}
                        <div className="flex flex-col gap-[5px]">
                          {[
                            { w: "72%", c: "#34d399" },
                            { w: "54%", c: "#a78bfa" },
                            { w: "63%", c: "#60a5fa" },
                          ].map((row, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-[6px] rounded-[6px] border border-white/[0.06] bg-[#13131f] px-[7px] py-[6px]"
                            >
                              <div className="h-[11px] w-[11px] shrink-0 rounded-[3px]" style={{ background: `${row.c}33` }} />
                              <div className="min-w-0 flex-1">
                                <div className="h-[3px] rounded-full bg-white/[0.16]" style={{ width: row.w }} />
                                <div className="mt-[3px] h-[2.5px] w-[38%] rounded-full bg-white/[0.08]" />
                              </div>
                              <div className="h-[3px] w-[13px] shrink-0 rounded-full" style={{ background: row.c, opacity: 0.55 }} />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Indicateur d'accueil */}
                    <div className="flex justify-center pb-[7px] pt-[5px]">
                      <div className="h-[3px] w-[78px] rounded-full bg-white/25" />
                    </div>
                  </div>
                </div>
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
                      ? "grid h-[52px] w-[52px] place-items-center rounded-[15px] border border-[var(--dv-accent)] bg-[var(--dv-accent)] font-['Plus_Jakarta_Sans',sans-serif] text-[17px] font-extrabold text-[var(--dv-accent-ink)]"
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
                      className="w-[26px] rounded-t-lg bg-[var(--dv-accent)] transition-[height] duration-[1.1s]"
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
              className="dv-price-card is-featured relative rounded-[22px] border border-[var(--dv-accent)] bg-[var(--dv-card)] p-[30px] pt-[34px] shadow-[0_10px_28px_-22px_oklch(0_0_0_/_0.45)] transition-[transform,box-shadow] duration-[0.45s]"
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
                className="dv-price-cta-solid mt-[26px] block rounded-[13px] bg-[var(--dv-accent)] py-3.5 text-center font-['Plus_Jakarta_Sans',sans-serif] text-[15.5px] font-extrabold text-[var(--dv-accent-ink)] transition-colors duration-300"
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
          <div className="relative">
            <Logo className="mx-auto h-[34px] w-[34px] animate-[dv-bob_5s_ease-in-out_infinite] text-[var(--dv-logo)]" />
            <h2 className="mx-auto mt-[22px] max-w-[18ch] text-[clamp(28px,3.8vw,46px)] font-extrabold leading-[1.06]">
              Lancez le prochain produit avec les bons chiffres.
            </h2>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/register"
                className="dv-final-cta-primary rounded-2xl bg-[var(--dv-accent)] px-7 py-[15px] font-['Plus_Jakarta_Sans',sans-serif] text-[16px] font-extrabold text-[var(--dv-accent-ink)] transition-colors duration-300"
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
