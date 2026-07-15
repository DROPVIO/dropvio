"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// ─── Static data ──────────────────────────────────────────────────────────────

const MARQUEE_ITEMS = [
  "Produits gagnants",
  "Calculateur de marge",
  "Site builder",
  "Audit IA",
  "Export Shopify-ready",
  "20 niches de produits gagnants",
];

const WORKFLOW_STEPS = [
  { num: "01", title: "Trouvez la niche",   desc: "20 niches de produits gagnants, données AliExpress en direct." },
  { num: "02", title: "Calculez la marge",  desc: "Prix, frais, marge nette — avant d'investir un centime en pub." },
  { num: "03", title: "Générez la page",    desc: "Palette, prix, structure — votre page en quelques minutes." },
  { num: "04", title: "Corrigez avec l'IA", desc: "Score sur 100, corrections précises, export en un clic." },
];

const SCORE_BARS = [
  { label: "Hiérarchie visuelle", target: 93,  val: "14/15" },
  { label: "CTA",                 target: 100, val: "15/15" },
  { label: "Copywriting",         target: 90,  val: "9/10"  },
  { label: "Typographie",         target: 100, val: "10/10" },
  { label: "Preuve sociale",      target: 53,  val: "8/15"  },
];

const FEATURES = [
  {
    title: "Produits gagnants",
    desc: "20 niches de produits gagnants avec données AliExpress en direct — potentiel de marge, concurrence, tendance, tout visible avant de choisir quoi vendre.",
    statVal: "20", statLabel: "niches de produits gagnants",
    more: "Chaque niche affiche les produits les plus vendus du moment, leur fourchette de prix d'achat, et une estimation de marge avant même d'ouvrir AliExpress. Mise à jour continue, pas de données figées.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M3 12l4-7 5 4 5-8 4 6"/>
        <circle cx="19" cy="7" r="1.5" fill="currentColor"/>
      </svg>
    ),
  },
  {
    title: "Calculateur de marge",
    desc: "Prix d'achat, frais de port, commission pub, prix de vente — la marge nette se recalcule en direct pour ne jamais lancer un produit à perte.",
    statVal: "0€", statLabel: "surprise sur vos marges",
    more: "Ajoutez vos coûts réels (achat, transport, transaction, publicité estimée) et voyez la marge nette évoluer champ par champ, avant de fixer votre prix de vente final.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M4 4h16v16H4z"/><path d="M4 10h16M10 4v16"/>
      </svg>
    ),
  },
  {
    title: "Site builder",
    desc: "Palettes personnalisées, prix réels, structure de page prête pour la conversion — sauvegarde automatique et export prêt pour Shopify.",
    statVal: "6", statLabel: "styles de page",
    more: "Choisissez une palette à 3 couleurs, vos vrais prix (avec ou sans barré), et prévisualisez en desktop, tablette et mobile avant d'exporter en HTML ou en Liquid pour Shopify.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
    ),
  },
  {
    title: "Audit de page IA",
    desc: "Score sur 100 basé sur 8 critères issus d'études UX publiées, corrections précises appliquées automatiquement, HTML corrigé téléchargeable.",
    statVal: "8", statLabel: "critères analysés",
    more: "Collez votre HTML ou uploadez le fichier, notre IA note chaque critère et vous montre exactement quoi corriger — avec un export du HTML déjà corrigé, prêt à republier.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <path d="M12 3l7 3v6c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-3z"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>
    ),
  },
];

const TRUST_ITEMS = [
  { src: "Nielsen Norman Group", text: "Hiérarchie visuelle et lecture en Z / F — comment l'œil parcourt réellement une page." },
  { src: "Unbounce",             text: "Ratio d'attention et structure du CTA — ce qui fait réellement cliquer." },
  { src: "McKinsey",             text: "Clarté du message et charge cognitive — pourquoi la simplicité convertit." },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  // openFeature: which feat-card is expanded
  const [openFeature, setOpenFeature] = useState<number | null>(null);
  // visibleFeatures: which feat-cards have been scrolled into view (React-owned)
  const [visibleFeatures, setVisibleFeatures] = useState<Set<number>>(new Set());

  useEffect(() => {
    // ── Score ring animation ──────────────────────────────────────
    const circumference = 2 * Math.PI * 52;
    const target = 91;
    const ringFg  = document.getElementById("ringFg")   as SVGCircleElement | null;
    const scoreEl = document.getElementById("scoreNum") as HTMLElement | null;
    let running = false;
    let raf = 0;

    function animateScore() {
      if (running || !ringFg || !scoreEl) return;
      running = true;
      ringFg.style.strokeDashoffset = String(circumference - (target / 100) * circumference);
      const start = performance.now();
      (function step(now: number) {
        const p = Math.min((now - start) / 1400, 1);
        scoreEl!.textContent = String(Math.round(p * target));
        if (p < 1) { raf = requestAnimationFrame(step); } else { running = false; }
      })(start);
      document.querySelectorAll<HTMLElement>(".bar-fill").forEach((bar) => {
        const t = bar.getAttribute("data-target") ?? "0";
        requestAnimationFrame(() => { bar.style.width = t + "%"; });
      });
    }

    function resetScore() {
      running = false;
      cancelAnimationFrame(raf);
      if (ringFg)  ringFg.style.strokeDashoffset = String(circumference);
      if (scoreEl) scoreEl.textContent = "0";
      document.querySelectorAll<HTMLElement>(".bar-fill").forEach((b) => { b.style.width = "0%"; });
    }

    const auditDemo = document.querySelector(".audit-demo");
    const scoreObs = auditDemo
      ? new IntersectionObserver(
          (entries) => entries.forEach((e) => (e.isIntersecting ? animateScore() : resetScore())),
          { threshold: 0.3 }
        )
      : null;
    if (auditDemo && scoreObs) scoreObs.observe(auditDemo);

    // ── Reveal for non-interactive elements (workflow, trust, pricing) ──
    const revealObs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle("in-view", e.isIntersecting)),
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
    );
    document.querySelectorAll(".reveal, .reveal-fade").forEach((el) => revealObs.observe(el));

    // ── Feat-cards: React-state driven to survive re-renders ──────
    // When a card is clicked, React re-renders and would overwrite any
    // imperatively-added className. So we track visibility in React state.
    const featObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.featIdx);
            setVisibleFeatures((prev) => {
              if (prev.has(idx)) return prev;
              const next = new Set(prev);
              next.add(idx);
              return next;
            });
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll<HTMLElement>("[data-feat-idx]").forEach((el) => featObs.observe(el));

    return () => {
      scoreObs?.disconnect();
      revealObs.disconnect();
      featObs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="landing-page">
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

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="wrap">
          <Link href="/" className="lp-logo">
            <div className="lp-logo-mark" />
            Dropvio
          </Link>
          <div className="nav-links">
            <a href="#features">Fonctionnalités</a>
            <a href="#workflow">Méthode</a>
            <a href="#pricing">Tarifs</a>
          </div>
          <Link href="/register" className="nav-cta">Commencer gratuitement</Link>
        </div>
      </nav>

      {/* ── Marquee — clic = pause, relâche = reprise ─────────────── */}
      {/* CSS :active .marquee-track { animation-play-state: paused } handles it */}
      <div className="lp-marquee" title="Clic pour mettre en pause">
        <div className="marquee-track">
          {[0, 1].flatMap((ri) =>
            MARQUEE_ITEMS.map((item, i) => (
              <span key={`${ri}-${i}`} className="marquee-item">
                {item}<span className="mdot" />
              </span>
            ))
          )}
        </div>
      </div>

      {/* ── Hero — headline + sub + CTAs uniquement ───────────────── */}
      <header className="lp-hero">
        <div className="wrap">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Dropshipping — de la niche à la page qui convertit
          </div>
          <h1 className="hero-title">
            La nouvelle voix<br />
            <span className="accent">du dropshipping</span>
          </h1>
          <p className="hero-sub">
            Trouvez le produit, calculez la marge, générez la page, et laissez notre IA la corriger avant que vos clients ne la voient.
          </p>
          <div className="hero-actions">
            <Link href="/register" className="btn-primary">Commencer gratuitement</Link>
            <a href="#features" className="btn-secondary">Voir les outils</a>
          </div>
        </div>
      </header>

      {/* ── 4 Features — poids égal 2×2 ──────────────────────────── */}
      <section id="features">
        <div className="wrap">
          <div className="section-head">
            <p className="kicker">Ce qu&apos;il y a dans Dropvio</p>
            <h2>Quatre outils, un seul abonnement</h2>
            <p>Chaque fonctionnalité fait un travail précis — pas de gadgets, que du concret pour vendre.</p>
          </div>
          <div className="feat-grid">
            {FEATURES.map((feat, i) => (
              <div
                key={i}
                data-feat-idx={i}
                className={[
                  "feat-card",
                  visibleFeatures.has(i) ? "visible" : "",
                  openFeature === i ? "open" : "",
                ].filter(Boolean).join(" ")}
                style={{ transitionDelay: visibleFeatures.has(i) ? "0s" : `${i * 0.1}s` }}
                onClick={() => setOpenFeature(openFeature === i ? null : i)}
              >
                <div className="feat-icon">{feat.icon}</div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
                <div className="feat-stat">
                  <b>{feat.statVal}</b>
                  <span>{feat.statLabel}</span>
                </div>
                <div className="feat-toggle">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  {openFeature === i ? "Réduire" : "Voir le détail"}
                </div>
                <div className="feat-more">
                  <div className="feat-more-inner">{feat.more}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Audit demo — section dédiée, poids équivalent aux features ── */}
      <div className="lp-demo-section">
        <div className="wrap">
          <div className="section-head" style={{ marginBottom: 40 }}>
            <p className="kicker">Analyse en direct</p>
            <h2>Cette page a été notée par notre IA</h2>
            <p>8 critères issus d&apos;études réelles (Nielsen Norman Group, Unbounce, McKinsey).</p>
          </div>

          <div className="audit-demo">
            <div className="ring-wrap">
              <svg className="lp-ring" width="140" height="140" viewBox="0 0 120 120">
                <circle className="ring-bg" cx="60" cy="60" r="52" />
                <circle className="ring-fg" id="ringFg" cx="60" cy="60" r="52" />
              </svg>
              <div style={{ marginTop: -92, textAlign: "center" }}>
                <span
                  id="scoreNum"
                  style={{ display: "block", fontFamily: "'Plus Jakarta Sans',sans-serif", fontSize: 28, fontWeight: 600, color: "var(--text)" }}
                >
                  0
                </span>
              </div>
              <span className="ring-label" style={{ marginTop: 60 }}>Score / 100</span>
            </div>
            <div className="audit-info">
              <p className="tag">Audit automatique</p>
              <h3>Cette landing page a été analysée par notre IA</h3>
              <p className="desc">
                Hiérarchie visuelle, espace blanc, typographie, preuve sociale, CTA, copywriting — 8 critères, 1 score, des corrections actionnables.
              </p>
              <div className="audit-criteria">
                <span className="crit ok">Hiérarchie visuelle</span>
                <span className="crit ok">CTA contrasté</span>
                <span className="crit ok">Copywriting clair</span>
                <span className="crit">Preuve sociale</span>
              </div>
            </div>
          </div>

          <div className="breakdown reveal">
            <p className="breakdown-title">Détail du score par critère</p>
            {SCORE_BARS.map((row) => (
              <div key={row.label} className="bar-row">
                <span className="bar-label">{row.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" data-target={String(row.target)} />
                </div>
                <span className="bar-val">{row.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Workflow ─────────────────────────────────────────────── */}
      <section id="workflow">
        <div className="wrap">
          <div className="section-head">
            <p className="kicker">Le flux de travail</p>
            <h2>Du produit à la page qui convertit</h2>
            <p>Quatre étapes, un seul outil — pas besoin de jongler entre cinq apps différentes.</p>
          </div>
          <div className="workflow">
            {WORKFLOW_STEPS.map((step, i) => (
              <div
                key={step.num}
                className="wf-card reveal"
                style={{ transitionDelay: `${i * 0.08}s` }}
              >
                <span className="wf-num">{step.num}</span>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                {i < 3 && <span className="wf-arrow">→</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust ────────────────────────────────────────────────── */}
      <section className="lp-trust">
        <div className="wrap">
          <div className="section-head">
            <p className="kicker">Pourquoi faire confiance au score</p>
            <h2>Le /100 vient de vraies études, pas d&apos;une impression</h2>
            <p>Chacun des 8 critères notés par notre IA est directement issu de recherches UX publiées — pas de faux témoignages, pas de chiffres inventés.</p>
          </div>
          <div className="trust-grid">
            {TRUST_ITEMS.map((item, i) => (
              <div key={item.src} className="trust-item reveal" style={{ transitionDelay: `${i * 0.1}s` }}>
                <span className="src">{item.src}</span>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────── */}
      <section id="pricing">
        <div className="wrap">
          <div className="section-head">
            <p className="kicker">Tarifs</p>
            <h2>Simple, honnête, sans surprise</h2>
            <p>Commencez gratuitement. Passez à l&apos;échelle quand votre boutique le justifie.</p>
          </div>
          <div className="pricing-grid">
            <div className="price-card reveal-fade" style={{ transitionDelay: "0s" }}>
              <h3>Free</h3>
              <span className="amount">0€<span>/mois</span></span>
              <ul>
                <li>3 audits IA par mois</li>
                <li>5 niches de produits gagnants sur 20</li>
                <li>Calculateur de marge illimité</li>
                <li>1 page générée avec le site builder</li>
                <li>Export HTML simple</li>
              </ul>
              <Link href="/register" className="price-btn">Commencer</Link>
            </div>
            <div className="price-card featured reveal-fade" style={{ transitionDelay: "0.1s" }}>
              <span className="badge-pop">Le plus choisi</span>
              <h3>Pro</h3>
              <span className="amount">29€<span>/mois</span></span>
              <ul>
                <li>Audits IA illimités</li>
                <li>20 niches de produits gagnants en temps réel</li>
                <li>Site builder complet, pages illimitées</li>
                <li>Palettes et prix personnalisés</li>
                <li>Export HTML corrigé par l&apos;IA</li>
                <li>Guide d&apos;intégration Shopify</li>
              </ul>
              <Link href="/register" className="price-btn">Passer à Pro</Link>
            </div>
            <div className="price-card reveal-fade" style={{ transitionDelay: "0.2s" }}>
              <h3>Agency</h3>
              <span className="amount">59€<span>/mois</span></span>
              <ul>
                <li>Tout Pro inclus</li>
                <li>Jusqu&apos;à 10 boutiques gérées</li>
                <li>Comptes clients séparés</li>
                <li>Export en lot des pages</li>
                <li>Support prioritaire sous 24h</li>
              </ul>
              <Link href="/register" className="price-btn">Commencer</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer CTA ───────────────────────────────────────────── */}
      <footer className="lp-cta">
        <div className="wrap">
          <h2>Votre prochaine page de vente mérite un score, pas une intuition</h2>
          <p>Gratuit pour commencer. Aucune carte bancaire requise.</p>
          <Link href="/register" className="btn-primary">Créer mon compte</Link>
        </div>
      </footer>
    </div>
  );
}
