import Link from "next/link";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { toIntlTag, type AppLocale } from "@/lib/locale";

// Balises des textes juridiques traduits (namespace legal, rendus avec t.rich).
export const balisesLegales = {
  strong: (chunks: ReactNode) => <strong className="text-[var(--text-primary)]">{chunks}</strong>,
  email: (chunks: ReactNode) => (
    <a href="mailto:legal@dropvio.com" className="text-[var(--accent)] hover:opacity-80">
      {chunks}
    </a>
  ),
  mentions: (chunks: ReactNode) => (
    <a href="/mentions-legales" className="text-[var(--accent)] hover:opacity-80">
      {chunks}
    </a>
  ),
};

export function TitreSection({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">{children}</h2>;
}

// Wrapper partagé par les 3 pages légales de l'app (mentions légales, CGV, confidentialité) —
// même structure visuelle que app/boutiques/[slug]/mentions-legales/page.tsx (tokens
// var(--bg)/var(--surface)), adaptée pour des documents multi-sections. Hors français, un
// encart rappelle que la version française fait foi (les traductions sont informatives).
// updated : date ISO (AAAA-MM-JJ), affichée au format de la langue.
export default async function LegalPageLayout({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: ReactNode;
}) {
  const t = await getTranslations("legal.commun");
  const locale = (await getLocale()) as AppLocale;
  const date = new Intl.DateTimeFormat(toIntlTag(locale), { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${updated}T12:00:00Z`)
  );
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-[var(--text-faint)] transition hover:text-[var(--text-muted)]">
          {t("retour")}
        </Link>
        <p className="mt-6 text-sm uppercase tracking-[0.3em] text-violet-300">{eyebrow}</p>
        <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)]">{title}</h1>
        <p className="mt-2 text-xs text-[var(--text-faint)]">{t("miseAJour", { date })}</p>
        {locale !== "fr" ? (
          <p className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-xs text-[var(--text-muted)]">
            {t("versionFaisantFoi")}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-8 text-sm leading-7 text-[var(--text-muted)]">{children}</div>
      </div>
    </main>
  );
}
