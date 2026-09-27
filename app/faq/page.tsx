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

const SUPPORT_EMAIL = "support@dropvio.com";

// Réponse unique à tout ce qui touche l'abonnement payant. Aucun plan Pro/Agency n'est
// aujourd'hui souscriptible : components/ParametresModal.tsx désactive « Changer de plan »
// et « Gérer la facturation » avec exactement ce message, et le seul paiement Stripe du
// repo est l'achat unique de la formation (app/formation/checkout). Il n'y a donc ni
// souscription, ni changement de plan, ni résiliation à documenter ici.
// Le texte visible et aText doivent rester identiques mot pour mot (JSON-LD FAQPage).
const PLANS_BIENTOT_TEXTE = `Les plans Pro et Agency arrivent bientôt. En attendant, contactez ${SUPPORT_EMAIL}.`;
const PLANS_BIENTOT = (
  <>
    Les plans Pro et Agency arrivent bientôt. En attendant, contactez{" "}
    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
  </>
);

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
        q: "Le plan Free coûte quelque chose ?",
        a: "Non. Le compte Free est gratuit, sans limite de temps, et la création de compte ne demande aucune carte bancaire.",
        aText: "Non. Le compte Free est gratuit, sans limite de temps, et la création de compte ne demande aucune carte bancaire.",
      },
      {
        q: "Quelle différence entre Free, Pro et Agency ?",
        a: (
          <>
            <ul>
              <li>Free (0€) : accès limité à chaque outil, audit IA non inclus</li>
              <li>Pro (29€/mois) : accès complet au finder et au calculateur, 30 audits IA/mois</li>
              <li>Agency (59€/mois) : comme Pro, avec 100 audits IA/mois</li>
            </ul>
            <p>Seul le plan Free est ouvert pour l&apos;instant : {PLANS_BIENTOT}</p>
          </>
        ),
        // Mot pour mot le texte visible, à la seule différence des séparateurs de puces
        // (« . » là où le rendu utilise des <li>) : schema.org attend un texte plat.
        aText: `Free (0€) : accès limité à chaque outil, audit IA non inclus. Pro (29€/mois) : accès complet au finder et au calculateur, 30 audits IA/mois. Agency (59€/mois) : comme Pro, avec 100 audits IA/mois. Seul le plan Free est ouvert pour l'instant : ${PLANS_BIENTOT_TEXTE}`,
      },
      {
        q: "Comment passer à Pro ou Agency, ou changer de plan ?",
        a: PLANS_BIENTOT,
        aText: PLANS_BIENTOT_TEXTE,
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
            Sauvegarde dans &laquo;&nbsp;Mes sites&nbsp;&raquo;, et téléchargement du HTML sur les plans Pro et Agency.
          </>
        ),
        aText: "Deux modes : génération IA (à partir d'une description produit) ou templates prêts à personnaliser. Sauvegarde dans « Mes sites », et téléchargement du HTML sur les plans Pro et Agency.",
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


      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="wrap">
          <Link href="/" className="lp-logo">
            <Logo className="lp-logo-mark" />
            Dropvio
          </Link>
          <div className="nav-links">
            {/* Ancres réelles de app/page.tsx : #fonctionnalites (ChaineSection), #resultats,
                #pricing. #features et #workflow ne renvoyaient vers aucune section existante. */}
            <Link href="/#fonctionnalites">Fonctionnalités</Link>
            <Link href="/#resultats">Résultats</Link>
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
