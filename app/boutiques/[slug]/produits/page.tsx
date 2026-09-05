import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGrid from "@/app/components/boutique/ProductGrid";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";
import { fetchBoutiqueApi } from "@/lib/boutique-internal-fetch";

const PAGE_SIZE = 12;

type ProduitCarte = {
  id: string;
  nom: string;
  description: string | null;
  prix_vente: number;
  prix_original: number | null;
  image_urls: string[] | null;
  boutique_categories: { nom: string; slug: string } | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const baseUrl = await getBaseUrl();

  const boutiqueRes = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}`);
  if (!boutiqueRes.ok) {
    return { title: "Boutique introuvable" };
  }
  const { boutique } = (await boutiqueRes.json()) as { boutique: { nom: string } };

  const title = `Catalogue — ${boutique.nom}`;
  const boutiqueUrl = getBoutiquePublicUrl(slug);
  const absoluteBoutiqueUrl = boutiqueUrl.startsWith("http") ? boutiqueUrl : `${baseUrl}${boutiqueUrl}`;
  const canonical = `${absoluteBoutiqueUrl}/produits`;

  return {
    title,
    alternates: { canonical },
    openGraph: { title, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function CataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const resolvedSearchParams = await searchParams;
  const categoryId = Array.isArray(resolvedSearchParams.categoryId)
    ? resolvedSearchParams.categoryId[0]
    : resolvedSearchParams.categoryId ?? "";
  const rawSearch = Array.isArray(resolvedSearchParams.search)
    ? resolvedSearchParams.search[0]
    : resolvedSearchParams.search ?? "";
  const searchTerm = rawSearch.trim();
  const rawPage = Array.isArray(resolvedSearchParams.page) ? resolvedSearchParams.page[0] : resolvedSearchParams.page;
  const currentPage = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);

  const baseUrl = await getBaseUrl();

  const boutiqueRes = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}`);
  if (!boutiqueRes.ok) {
    notFound();
  }
  const { boutique, categories } = (await boutiqueRes.json()) as {
    boutique: { id: string; nom: string };
    categories: { id: string; nom: string; slug: string }[];
  };

  const productsParams = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(currentPage) });
  if (categoryId) productsParams.set("categoryId", categoryId);
  if (searchTerm) productsParams.set("search", searchTerm);

  const productsRes = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}/produits?${productsParams.toString()}`);
  const { products: produits, totalPages, total } = productsRes.ok
    ? ((await productsRes.json()) as { products: ProduitCarte[]; totalPages: number; total: number })
    : { products: [], totalPages: 1, total: 0 };

  const basePath = await getBoutiqueBasePath(slug);

  function pageHref(page: number): string {
    const p = new URLSearchParams();
    if (categoryId) p.set("categoryId", categoryId);
    if (searchTerm) p.set("search", searchTerm);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return `${basePath}/produits${qs ? `?${qs}` : ""}`;
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-violet-300">Catalogue</p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
              {searchTerm ? `Résultats pour « ${searchTerm} »` : `Tous les produits de ${boutique.nom}`}
            </h1>
            {searchTerm ? (
              <Link
                href={`${basePath}/produits${categoryId ? `?categoryId=${categoryId}` : ""}`}
                className="mt-1 inline-block text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
              >
                ✕ Effacer la recherche
              </Link>
            ) : null}
          </div>
          <span className="rounded-full bg-violet-500/10 px-4 py-2 text-sm text-[var(--accent)]">{total} produit(s)</span>
        </div>

        <form method="get" className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto]">
          <input
            name="search"
            defaultValue={searchTerm}
            placeholder="Recherche nom ou description"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
          <input type="hidden" name="categoryId" value={categoryId} />
          <button
            type="submit"
            className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            Filtrer
          </button>
        </form>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`${basePath}/produits${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ""}`}
            className={`rounded-full border px-4 py-2 text-sm transition ${
              !categoryId
                ? "border-violet-400 bg-violet-500/15 text-[var(--text-primary)]"
                : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-violet-400/60 hover:bg-violet-500/10"
            }`}
          >
            Toutes les catégories
          </Link>
          {categories?.map((category) => {
            const active = category.id === categoryId;
            const href = `${basePath}/produits?categoryId=${category.id}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`;
            return (
              <Link
                key={category.id}
                href={href}
                className={`rounded-full border px-4 py-2 text-sm transition ${
                  active
                    ? "border-violet-400 bg-violet-500/15 text-[var(--text-primary)]"
                    : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-violet-400/60 hover:bg-violet-500/10"
                }`}
              >
                {category.nom}
              </Link>
            );
          })}
        </div>

        <div className="mt-8">
          <ProductGrid produits={produits} basePath={basePath} />
        </div>

        {totalPages > 1 ? (
          <div className="mt-10 flex items-center justify-center gap-4">
            {currentPage > 1 ? (
              <Link
                href={pageHref(currentPage - 1)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-violet-400/60 hover:bg-violet-500/10"
              >
                ← Précédent
              </Link>
            ) : null}
            <span className="text-sm text-[var(--text-muted)]">
              Page {currentPage} / {totalPages}
            </span>
            {currentPage < totalPages ? (
              <Link
                href={pageHref(currentPage + 1)}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-violet-400/60 hover:bg-violet-500/10"
              >
                Suivant →
              </Link>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}
