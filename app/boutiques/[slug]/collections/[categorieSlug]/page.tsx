import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGrid from "@/app/components/boutique/ProductGrid";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";
import { fetchBoutiqueApi } from "@/lib/boutique-internal-fetch";
import {
  chargerBoutiquePublique,
  metadonneesBoutique,
  metadonneesIntrouvable,
  traductionsBoutique,
  urlAbsolueBoutique,
} from "@/lib/boutique-public";

const PAGE_SIZE = 12;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; categorieSlug: string }>;
}): Promise<Metadata> {
  const { slug, categorieSlug } = await params;
  const donnees = await chargerBoutiquePublique(slug);
  const categorie = donnees?.categories.find((c) => c.slug === categorieSlug);
  if (!donnees || !categorie) return metadonneesIntrouvable();
  const { boutique } = donnees;
  const t = await traductionsBoutique(boutique.langue);

  return metadonneesBoutique({
    boutique,
    titre: t("meta.collectionTitre", { collection: categorie.nom, nom: boutique.nom }),
    description: t("meta.collectionDescription", { collection: categorie.nom, nom: boutique.nom }),
    canonical: `${await urlAbsolueBoutique(slug)}/collections/${categorieSlug}`,
  });
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string; categorieSlug: string }>;
}) {
  const { slug, categorieSlug } = await params;
  const baseUrl = await getBaseUrl();

  const donnees = await chargerBoutiquePublique(slug);
  if (!donnees) {
    notFound();
  }
  const { boutique, categories } = donnees;
  const t = await traductionsBoutique(boutique.langue);

  const categorie = categories.find((c) => c.slug === categorieSlug);
  if (!categorie) {
    notFound();
  }

  const productsParams = new URLSearchParams({ limit: String(PAGE_SIZE), categoryId: categorie.id });
  const productsRes = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}/produits?${productsParams.toString()}`);
  const { products: produits, total } = productsRes.ok
    ? ((await productsRes.json()) as {
        total: number;
        products: {
          id: string;
          nom: string;
          description: string | null;
          prix_vente: number;
          prix_original: number | null;
          image_urls: string[] | null;
          boutique_categories: { nom: string; slug: string } | null;
        }[];
      })
    : { products: [], total: 0 };

  const basePath = await getBoutiqueBasePath(slug);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-violet-300">{t("collection.surtitre")}</p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{categorie.nom}</h1>
            <Link href={`${basePath || "/"}`} className="mt-2 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              {t("collection.retour")}
            </Link>
          </div>
          <div className="rounded-full bg-violet-500/10 px-4 py-2 text-sm text-[var(--accent)]">{t("nombreProduits", { count: total })}</div>
        </div>
        <ProductGrid
          produits={produits}
          basePath={basePath}
          langue={boutique.langue}
          emptyMessage={t("collection.vide")}
        />
        {total > produits.length ? (
          <div className="mt-10 text-center">
            <Link
              href={`${basePath}/produits?categoryId=${categorie.id}`}
              className="inline-block rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-400/60 hover:bg-violet-500/10"
            >
              {t("collection.voirTout", { count: total })}
            </Link>
          </div>
        ) : null}
      </section>
    </main>
  );
}
