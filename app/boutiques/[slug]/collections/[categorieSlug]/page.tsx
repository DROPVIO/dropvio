import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGrid from "@/app/components/boutique/ProductGrid";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";

const PAGE_SIZE = 12;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; categorieSlug: string }>;
}): Promise<Metadata> {
  const { slug, categorieSlug } = await params;
  const baseUrl = await getBaseUrl();

  const boutiqueRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}`, { cache: "no-store" });
  if (!boutiqueRes.ok) {
    return { title: "Collection introuvable" };
  }
  const { boutique, categories } = (await boutiqueRes.json()) as {
    boutique: { nom: string };
    categories: { id: string; nom: string; slug: string }[];
  };
  const categorie = categories.find((c) => c.slug === categorieSlug);
  if (!categorie) {
    return { title: "Collection introuvable" };
  }

  const title = `${categorie.nom} — ${boutique.nom} · Dropvio`;
  const boutiqueUrl = getBoutiquePublicUrl(slug);
  const absoluteBoutiqueUrl = boutiqueUrl.startsWith("http") ? boutiqueUrl : `${baseUrl}${boutiqueUrl}`;
  const canonical = `${absoluteBoutiqueUrl}/collections/${categorieSlug}`;

  return {
    title,
    alternates: { canonical },
    openGraph: { title, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string; categorieSlug: string }>;
}) {
  const { slug, categorieSlug } = await params;
  const baseUrl = await getBaseUrl();

  const boutiqueRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}`, { cache: "no-store" });
  if (!boutiqueRes.ok) {
    notFound();
  }
  const { categories } = (await boutiqueRes.json()) as {
    boutique: { id: string; nom: string };
    categories: { id: string; nom: string; slug: string }[];
  };

  const categorie = categories.find((c) => c.slug === categorieSlug);
  if (!categorie) {
    notFound();
  }

  const productsParams = new URLSearchParams({ limit: String(PAGE_SIZE), categoryId: categorie.id });
  const productsRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}/produits?${productsParams.toString()}`, {
    cache: "no-store",
  });
  const { products: produits } = productsRes.ok
    ? ((await productsRes.json()) as {
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
    : { products: [] };

  const basePath = await getBoutiqueBasePath(slug);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-violet-300">Collection</p>
            <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{categorie.nom}</h1>
            <Link href={`${basePath || "/"}`} className="mt-2 inline-block text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              ← Retour à toutes les catégories
            </Link>
          </div>
          <div className="rounded-full bg-violet-500/10 px-4 py-2 text-sm text-[var(--accent)]">{produits?.length ?? 0} produit(s)</div>
        </div>
        <ProductGrid
          produits={produits}
          basePath={basePath}
          emptyMessage="Aucun produit dans cette collection pour l'instant."
        />
      </section>
    </main>
  );
}
