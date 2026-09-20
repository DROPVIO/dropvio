import Link from "next/link";
import type { ReactNode } from "react";

// Wrapper partagé par les 3 pages légales de l'app (mentions-légales, cgv, confidentialité) —
// même structure visuelle que app/boutiques/[slug]/mentions-legales/page.tsx (tokens
// var(--bg)/var(--surface)), adaptée pour des documents multi-sections plutôt qu'un unique
// bloc de texte.
export default function LegalPageLayout({
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
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-[var(--text-faint)] transition hover:text-[var(--text-muted)]">
          ← Retour à l&apos;accueil
        </Link>
        <p className="mt-6 text-sm uppercase tracking-[0.3em] text-violet-300">{eyebrow}</p>
        <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)]">{title}</h1>
        <p className="mt-2 text-xs text-[var(--text-faint)]">Dernière mise à jour : {updated}</p>
        <div className="mt-8 flex flex-col gap-8 text-sm leading-7 text-[var(--text-muted)]">
          {children}
        </div>
      </div>
    </main>
  );
}
