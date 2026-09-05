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

  type ProduitCarte = {
    id: string;
    nom: string;
    description: string | null;
    prix_vente: number;
    prix_original: number | null;
    image_urls: string[] | null;
    boutique_categories: { nom: string; slug: string } | null;
  };

  const [productsRes, bestsellersRes] = await Promise.all([
    fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}/produits?${productsParams.toString()}`),
    fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}/produits?bestsellers=1`),
  ]);
  const { products: produits } = productsRes.ok
    ? ((await productsRes.json()) as { products: ProduitCarte[] })
    : { products: [] };
  const { products: bestsellers } = bestsellersRes.ok
    ? ((await bestsellersRes.json()) as { products: ProduitCarte[] })
    : { products: [] };

  const template = TEXTES_DEFAUT.generique;
  const basePath = await getBoutiqueBasePath(slug);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      {/* HERO — pleine largeur, accroche générique fixe (jamais boutique.description : le
          vrai texte de la boutique est l'exclusivité de la section "À propos" plus bas,
          pour ne pas recréer le doublon corrigé plus tôt ce soir). Dégradé en style inline
          plutôt qu'en classe Tailwind arbitraire : var(--x, var(--y)) imbriqué dans un
          crochet Tailwind ne compile jamais (bug constaté et corrigé ici même) — un style
          inline est évalué directement par le navigateur, sans passer par Tailwind. */}
      <section
        className="relative overflow-hidden border-b border-[var(--border)]"
        style={{
          backgroundImage:
            "linear-gradient(to bottom right, var(--boutique-palette-primary, var(--accent)), var(--boutique-palette-accent, var(--accent-secondary)))",
        }}
      >
        <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-white sm:text-5xl">{boutique.nom}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/90">{template.sousTitre}</p>
          <a
            href="#produits"
            className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--bg)] transition hover:scale-[1.03] hover:bg-white/90"
          >
            Voir les produits
          </a>
        </div>
      </section>

      {/* RÉASSURANCE — bande fine pleine largeur, pas une carte de dashboard. Classe
          boutique-reassurance : seul emplacement où la couleur "secondaire" de la palette
          personnalisée s'applique (voir app/globals.css). */}
      <section className="boutique-reassurance border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 py-6 text-center text-sm text-[var(--text-muted)] sm:grid-cols-3 sm:px-6 lg:px-8">
          <div>🚚 Livraison suivie</div>
          <div>↩ Retour sous 14 jours</div>
          <div>🔒 Boutique vérifiée Dropvio</div>
        </div>
      </section>

      {/* À PROPOS — seule utilisation de boutique.description sur cette page (avant :
          dupliquée entre "Nos collections" et "À propos" ; ce soir, remplacée par une
          accroche fixe dans le hero pour éviter de recréer ce doublon). Bloc texte centré,
          sans bordure ni carte, même traitement visuel que le hero. */}
      <section id="a-propos" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="text-sm uppercase tracking-[0.3em] text-violet-300">À propos</p>
        <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">{boutique.description || template.description}</p>
      </section>

      {/* BESTSELLERS — jusqu'à 3 produits, triés par commandes réelles (produits.commandes
          via source_produit_id). Absente si aucun produit n'a de donnée de commandes
          connue (import manuel, jamais lié au catalogue) — pas de "bestseller" arbitraire
          sans donnée réelle derrière. Réutilise ProductGrid tel quel. */}
      {bestsellers.length > 0 ? (
        <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">🔥 Nos bestsellers</h2>
          <div className="mt-6">
            <ProductGrid produits={bestsellers} basePath={basePath} />
          </div>
        </section>
      ) : null}

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
