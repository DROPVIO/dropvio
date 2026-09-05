import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGrid from "@/app/components/boutique/ProductGrid";
import { TEXTES_DEFAUT } from "@/lib/site-templates";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";
import { fetchBoutiqueApi } from "@/lib/boutique-internal-fetch";

const PAGE_SIZE = 12;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// Réutilise volontairement le même fetch (même URL, mêmes options) que le composant de
// page ci-dessous : Next.js dédoublonne automatiquement les appels fetch identiques faits
// pendant le rendu d'une même requête, donc pas de coût réseau supplémentaire.
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
  const { boutique } = (await boutiqueRes.json()) as {
    boutique: { nom: string; description: string | null };
  };

  const title = `${boutique.nom} · Dropvio`;
  const description = boutique.description?.trim()
    ? truncate(boutique.description.trim(), 155)
    : `Découvre les produits de ${boutique.nom} sur Dropvio.`;

  const boutiqueUrl = getBoutiquePublicUrl(slug);
  const canonical = boutiqueUrl.startsWith("http") ? boutiqueUrl : `${baseUrl}${boutiqueUrl}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function BoutiquePage({
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

  const baseUrl = await getBaseUrl();

  const boutiqueRes = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}`);
  if (!boutiqueRes.ok) {
    notFound();
  }
  const { boutique, categories } = (await boutiqueRes.json()) as {
    boutique: { id: string; nom: string; slug: string; description: string | null; theme: string | null; settings: unknown };
    categories: { id: string; nom: string; slug: string }[];
  };

  const productsParams = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (categoryId) productsParams.set("categoryId", categoryId);
  if (searchTerm) productsParams.set("search", searchTerm);

  const productsRes = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}/produits?${productsParams.toString()}`);
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

  const template = TEXTES_DEFAUT.generique;
  const basePath = await getBoutiqueBasePath(slug);
  const tagline = boutique.description || template.description;

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      {/* HERO — pleine largeur, seule utilisation de boutique.description sur cette page
          (avant : dupliqué entre "Nos collections" et "À propos"). Dégradé calé sur la
          palette personnalisée de la boutique si elle en a une (voir
          app/boutiques/[slug]/layout.tsx, --boutique-palette-*), sinon les tokens d'accent
          par défaut de l'app. */}
      <section className="relative overflow-hidden border-b border-[var(--border)] bg-gradient-to-br from-[var(--boutique-palette-primary,var(--accent))] to-[var(--boutique-palette-accent,var(--accent-secondary))]">
        <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-white sm:text-5xl">{boutique.nom}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/90">{tagline}</p>
          <a
            href="#produits"
            className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--bg)] transition hover:bg-white/90"
          >
            Voir les produits
          </a>
        </div>
      </section>

      {/* RÉASSURANCE — bande fine pleine largeur, pas une carte de dashboard */}
      <section className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 py-6 text-center text-sm text-[var(--text-muted)] sm:grid-cols-3 sm:px-6 lg:px-8">
          <div>🚚 Livraison suivie</div>
          <div>↩ Retour sous 14 jours</div>
          <div>🔒 Boutique vérifiée Dropvio</div>
        </div>
      </section>

      {/* FILTRES + GRILLE PRODUITS — pleine largeur */}
      <section id="produits" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
              {searchTerm ? `Résultats pour « ${searchTerm} »` : "Nos produits"}
            </h2>
            {searchTerm ? (
              <Link
                href={`${basePath || "/"}${categoryId ? `?categoryId=${categoryId}` : ""}`}
                className="mt-1 inline-block text-sm text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
              >
                ✕ Effacer la recherche
              </Link>
            ) : null}
          </div>
          <span className="rounded-full bg-violet-500/10 px-4 py-2 text-sm text-[var(--accent)]">
            {produits?.length ?? 0} produit(s)
          </span>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`${basePath || "/"}${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ""}`}
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
            const href = `${basePath}?categoryId=${category.id}${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`;
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

        <div className="mt-8 pb-16">
          <ProductGrid produits={produits} basePath={basePath} />
        </div>
      </section>
    </main>
  );
}
