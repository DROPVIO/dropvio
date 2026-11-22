import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { lireDocumentLegal, type PageLegale } from "@/lib/legal-content";

// Rendu commun des pages juridiques (mentions légales, CGV, confidentialité) : le contenu est
// le fichier content/legal/<page>.md converti en HTML, affiché tel quel.
export default async function LegalPageLayout({ page }: { page: PageLegale }) {
  const t = await getTranslations("legal.commun");
  const contenu = await lireDocumentLegal(page);
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Link href="/" className="text-sm text-[var(--text-faint)] transition hover:text-[var(--text-muted)]">
          {t("retour")}
        </Link>
        <article className="document-legal mt-6" dangerouslySetInnerHTML={{ __html: contenu }} />
      </div>
    </main>
  );
}
