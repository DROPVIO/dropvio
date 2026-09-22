"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

// ─── Content ──────────────────────────────────────────────────────────────────

interface FaqItem {
  q: string;
  a: React.ReactNode;
  /** Version texte brut, utilisée pour le balisage structuré FAQPage (schema.org). */
  aText: string;
}

interface FaqCategory {
  title: string;
  items: FaqItem[];
}

const CATEGORIES: FaqCategory[] = [
  {
    title: "Général",
    items: [
      {
        q: "Qu'est-ce que Dropvio ?",
        a: "Une plateforme tout-en-un pour dropshippers francophones. Trouve des produits gagnants, calcule ta marge réelle, audite ta landing page, crée ton site — sans jongler entre 5 outils différents.",
        aText: "Une plateforme tout-en-un pour dropshippers francophones. Trouve des produits gagnants, calcule ta marge réelle, audite ta landing page, crée ton site — sans jongler entre 5 outils différents.",
      },
      {
        q: "Dropvio est-il en français ?",
        a: "Oui, entièrement. Pensé pour le marché francophone, avec les vraies règles fiscales et légales françaises (TVA, URSSAF, taxes douanières).",
        aText: "Oui, entièrement. Pensé pour le marché francophone, avec les vraies règles fiscales et légales françaises (TVA, URSSAF, taxes douanières).",
      },
    ],
  },
  {
    title: "Comptes et facturation",
    items: [
      {
        q: "Quelle différence entre Free, Pro et Agency ?",
        a: (
          <ul>
            <li>Free (0€) : accès limité à chaque outil, pour tester</li>
            <li>Pro (29€/mois) : accès complet au finder et au calculateur, 30 audits IA/mois</li>
            <li>Agency (59€/mois) : comme Pro, avec 100 audits IA/mois</li>
          </ul>
        ),
        aText: "Free (0€) : accès limité à chaque outil, pour tester. Pro (29€/mois) : accès complet au finder et au calculateur, 30 audits IA par mois. Agency (59€/mois) : comme Pro, avec 100 audits IA par mois.",
      },
      {
        q: "Comment changer de plan ?",
        a: "Depuis Paramètres → Abonnement. Le changement est immédiat.",
        aText: "Depuis Paramètres → Abonnement. Le changement est immédiat.",
      },
      {
        q: "Comment annuler mon abonnement ?",
        a: "Depuis Paramètres → Abonnement → Annuler. Résiliation en un clic, effective à la fin de la période déjà payée. Pas d'engagement, pas de préavis à respecter.",
        aText: "Depuis Paramètres → Abonnement → Annuler. Résiliation en un clic, effective à la fin de la période déjà payée. Pas d'engagement, pas de préavis à respecter.",
      },
      {
        q: "Je peux repasser en Free au lieu d'annuler complètement ?",
        a: "Oui, tu gardes ton compte et tes données, juste avec les limites du plan Free.",
        aText: "Oui, tu gardes ton compte et tes données, juste avec les limites du plan Free.",
      },
      {
        q: "Que se passe-t-il si j'atteins la limite de mon plan ?",
        a: "Un message clair t'indique la limite atteinte (ex: audits/mois) et te propose de passer au plan supérieur si besoin. Rien ne se bloque sans explication.",
        aText: "Un message clair t'indique la limite atteinte (ex: audits/mois) et te propose de passer au plan supérieur si besoin. Rien ne se bloque sans explication.",
      },
    ],
  },
  {
    title: "Fonctionnalités",
    items: [
      {
        q: "Comment fonctionne le finder de produits ?",
        a: "Il utilise l'API AliExpress pour te montrer des produits filtrés par volume de commandes, note, marge. Mis à jour quotidiennement.",
        aText: "Il utilise l'API AliExpress pour te montrer des produits filtrés par volume de commandes, note, marge. Mis à jour quotidiennement.",
      },
      {
        q: "Le calculateur de marge inclut vraiment toutes les taxes françaises ?",
        a: "Oui : URSSAF, seuil de TVA, frais Stripe, et la taxe UE de 3€ sur les colis extra-UE de moins de 150€ (en vigueur depuis juillet 2026).",
        aText: "Oui : URSSAF, seuil de TVA, frais Stripe, et la taxe UE de 3€ sur les colis extra-UE de moins de 150€ (en vigueur depuis juillet 2026).",
      },
      {
        q: "C'est quoi le score d'audit IA ?",
        a: "Un score sur 100, basé sur 9 critères issus d'études réelles (Nielsen Norman Group, Unbounce, McKinsey). Il te dit précisément quoi corriger sur ta landing page.",
        aText: "Un score sur 100, basé sur 9 critères issus d'études réelles (Nielsen Norman Group, Unbounce, McKinsey). Il te dit précisément quoi corriger sur ta landing page.",
      },
      {
        q: "Le site builder, ça marche comment ?",
        a: (
          <>
            Deux modes : génération IA (à partir d&apos;une description produit) ou templates prêts à personnaliser.
            Export HTML direct, ou sauvegarde dans &laquo;&nbsp;Mes sites&nbsp;&raquo;.
          </>
        ),
        aText: "Deux modes : génération IA (à partir d'une description produit) ou templates prêts à personnaliser. Export HTML direct, ou sauvegarde dans « Mes sites ».",
      },
    ],
  },
  {
    title: "Données et sécurité",
    items: [
      {
        q: "Mes données sont-elles partagées avec d'autres utilisateurs ?",
        a: "Non, jamais. Chaque compte est isolé, personne d'autre ne peut voir tes simulations, tes sites ou tes audits.",
        aText: "Non, jamais. Chaque compte est isolé, personne d'autre ne peut voir tes simulations, tes sites ou tes audits.",
      },
      {
        q: "Dropvio respecte le RGPD ?",
        a: "Oui. Tu peux demander l'export ou la suppression de tes données à tout moment.",
        aText: "Oui. Tu peux demander l'export ou la suppression de tes données à tout moment.",
      },
    ],
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.aText,
      },
    }))
  ),
};

// ─── Accordion item ─────────────────────────────────────────────────────────

function FaqAccordionItem({ item, open, onToggle }: { item: FaqItem; open: boolean; onToggle: () => void }) {
  return (
    <div className={`faq-item ${open ? "open" : ""}`}>
      <button className="faq-q" onClick={onToggle} aria-expanded={open}>
        <span>{item.q}</span>
        <span className="faq-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </span>
      </button>
      <div className="faq-a">
        <div className="faq-a-inner">{item.a}</div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FaqPage() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="faq-page">
      {/* Balisage structuré FAQPage (schema.org) pour le SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

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
            <Logo className="lp-logo-mark" />
            Dropvio
          </Link>
          <div className="nav-links">
            <Link href="/#features">Fonctionnalités</Link>
            <Link href="/#workflow">Méthode</Link>
            <Link href="/#pricing">Tarifs</Link>
            <Link href="/faq">FAQ</Link>
          </div>
          <Link href="/register" className="nav-cta">Commencer gratuitement</Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <header className="faq-hero">
        <div className="wrap">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            Centre d&apos;aide
          </div>
          <h1>Questions fréquentes</h1>
          <p>Tout ce qu&apos;il faut savoir sur Dropvio : compte, facturation, fonctionnalités, données.</p>
        </div>
      </header>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="faq-section">
        <div className="wrap">
          <div className="faq-wrap">
            {CATEGORIES.map((cat, ci) => (
              <div key={cat.title} className="faq-category">
                <h2 className="faq-category-title">{cat.title}</h2>
                <div className="faq-list">
                  {cat.items.map((item, ii) => {
                    const id = `${ci}-${ii}`;
                    return (
                      <FaqAccordionItem
                        key={id}
                        item={item}
                        open={openItems.has(id)}
                        onToggle={() => toggle(id)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer CTA ───────────────────────────────────────────── */}
      <footer className="lp-cta">
        <div className="wrap">
          <h2>Une autre question ?</h2>
          <p>Crée ton compte gratuitement et découvre Dropvio par toi-même. Aucune carte bancaire requise.</p>
          <Link href="/register" className="btn-primary">Créer mon compte</Link>
        </div>
      </footer>
    </div>
  );
}
