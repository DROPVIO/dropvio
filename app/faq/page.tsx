import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Logo from "@/components/Logo";
import { SUPPORT_EMAIL } from "@/lib/contact";
import FaqAccordeon, { type FaqCategorieRendue } from "./FaqAccordeon";

// Ordre des catégories et des questions ; les textes sont dans le namespace faq.
const STRUCTURE = [
  { id: "general", items: ["quoi", "langue"] },
  { id: "comptes", items: ["freeGratuit", "differences", "changerPlan", "limite"] },
  { id: "fonctionnalites", items: ["finder", "calculateur", "audit", "siteBuilder"] },
  { id: "donnees", items: ["partage", "rgpd"] },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("faq");
  return { title: t("metaTitre"), description: t("metaDescription") };
}

// Aucun plan Pro/Agency n'est aujourd'hui souscriptible (voir components/ParametresModal.tsx) :
// les questions d'abonnement renvoient vers le support (faq.plansBientot).
export default async function FaqPage() {
  const t = await getTranslations("faq");
  const valeurs = { adresse: SUPPORT_EMAIL };
  const lienEmail = (chunks: ReactNode) => <a href={`mailto:${SUPPORT_EMAIL}`}>{chunks}</a>;
  const texteEmail = (chunks: string) => chunks;

  // Réponse affichée et sa version texte brut pour le balisage FAQPage (schema.org).
  function reponse(id: string): { q: string; a: ReactNode; aText: string } {
    const q = t(`questions.${id}.q`);
    if (id === "differences") {
      const lignes = [t("questions.differences.free"), t("questions.differences.pro"), t("questions.differences.agency")];
      return {
        q,
        a: (
          <>
            <ul>
              {lignes.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p>{t.rich("questions.differences.fin", { ...valeurs, email: lienEmail })}</p>
          </>
        ),
        aText: `${lignes.join(". ")}. ${t.markup("questions.differences.fin", { ...valeurs, email: texteEmail })}`,
      };
    }
    if (id === "changerPlan") {
      return {
        q,
        a: t.rich("plansBientot", { ...valeurs, email: lienEmail }),
        aText: t.markup("plansBientot", { ...valeurs, email: texteEmail }),
      };
    }
    const a = t(`questions.${id}.a`);
    return { q, a, aText: a };
  }

  const categories = STRUCTURE.map((cat) => ({
    titre: t(`categories.${cat.id}`),
    items: cat.items.map(reponse),
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: categories.flatMap((cat) =>
      cat.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.aText },
      }))
    ),
  };
  const categoriesRendues: FaqCategorieRendue[] = categories.map((c) => ({
    titre: c.titre,
    items: c.items.map(({ q, a }) => ({ q, a })),
  }));

  return (
    <div className="faq-page">
      {/* Balisage structuré FAQPage (schema.org) pour le SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="lp-nav">
        <div className="wrap">
          <Link href="/" className="lp-logo">
            <Logo className="lp-logo-mark" />
            Dropvio
          </Link>
          <div className="nav-links">
            {/* #how : section « La chaîne » de la landing (components/landing/ChaineSection.tsx). */}
            <Link href="/#how">{t("nav.fonctionnalites")}</Link>
            <Link href="/faq">{t("nav.faq")}</Link>
          </div>
          <Link href="/register" className="nav-cta">
            {t("nav.cta")}
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <header className="faq-hero">
        <div className="wrap">
          <div className="eyebrow">
            <span className="eyebrow-dot" />
            {t("hero.surtitre")}
          </div>
          <h1>{t("hero.titre")}</h1>
          <p>{t("hero.intro")}</p>
        </div>
      </header>

      {/* ── FAQ ──────────────────────────────────────────────────── */}
      <section className="faq-section">
        <div className="wrap">
          <FaqAccordeon categories={categoriesRendues} />
        </div>
      </section>

      {/* ── Footer CTA ───────────────────────────────────────────── */}
      <footer className="lp-cta">
        <div className="wrap">
          <h2>{t("footer.titre")}</h2>
          <p>{t("footer.texte")}</p>
          <Link href="/register" className="btn-primary">
            {t("footer.cta")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
