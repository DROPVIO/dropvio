import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";

const PAGE_SIZE = 12;

type PublicBoutique = {
  id: string;
  nom: string;
  slug: string;
  description: string | null;
  theme: string | null;
  created_at: string;
};

// Annuaire des boutiques publiques : page de Dropvio, donc dans la langue du visiteur (les
// boutiques listées ont chacune leur propre langue).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("boutique.annuaire");
  return { title: t("metaTitre"), description: t("metaDescription") };
}

export default async function BoutiquesIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("boutique");
  const resolvedSearchParams = await searchParams;
  const rawPage = Array.isArray(resolvedSearchParams.page) ? resolvedSearchParams.page[0] : resolvedSearchParams.page;
  const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);

  const baseUrl = await getBaseUrl();
  const res = await fetch(`${baseUrl}/api/boutiques/public?page=${page}&limit=${PAGE_SIZE}`, {
    cache: "no-store",
  });

  const { boutiques, totalPages } = res.ok
    ? ((await res.json()) as { boutiques: PublicBoutique[]; totalPages: number })
    : { boutiques: [] as PublicBoutique[], totalPages: 1 };

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm uppercase tracking-[0.3em] text-violet-300">{t("annuaire.surtitre")}</p>
        <h1 className="mt-4 text-4xl font-bold text-[var(--text-primary)]">{t("annuaire.titre")}</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
          {t("annuaire.intro")}
        </p>

        {boutiques.length > 0 ? (
          <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {boutiques.map((boutique) => (
              <Link
                key={boutique.id}
                href={getBoutiquePublicUrl(boutique.slug)}
                className="group overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 transition hover:border-violet-500/40 hover:bg-[var(--surface-2)]"
              >
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{boutique.nom}</h2>
                <p className="mt-2 text-sm text-[var(--text-muted)] line-clamp-3">
                  {boutique.description || t("annuaire.descriptionDefaut")}
                </p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--text-muted)]">
            {t("annuaire.vide")}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-3">
            {page > 1 && (
              <Link
                href={`/boutiques?page=${page - 1}`}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-violet-400/60 hover:bg-violet-500/10"
              >
                {t("pagination.precedent")}
              </Link>
            )}
            <span className="text-sm text-[var(--text-muted)]">{t("pagination.page", { page, total: totalPages })}</span>
            {page < totalPages && (
              <Link
                href={`/boutiques?page=${page + 1}`}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-violet-400/60 hover:bg-violet-500/10"
              >
                {t("pagination.suivant")}
              </Link>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
