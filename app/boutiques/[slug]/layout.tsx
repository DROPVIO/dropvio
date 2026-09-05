import Link from "next/link";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";
import BoutiqueHeaderCart from "@/app/components/boutique/BoutiqueHeaderCart";

// Layout partagé par toutes les pages boutique publique (page.tsx, produits/[produitId],
// mentions-legales). Porte le header standard (logo, recherche, collections, icônes
// panier/compte/favoris) commun à toutes ces pages — avant ce layout, chaque page
// recréait son propre en-tête indépendamment. Le fetch ci-dessous cible la même URL que
// celui déjà fait par page.tsx/produits/[produitId]/page.tsx : Next.js dédoublonne
// automatiquement les appels fetch identiques faits pendant le rendu d'une même requête,
// donc pas de coût réseau supplémentaire malgré le fetch en double dans le code.
export default async function BoutiquePublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const baseUrl = await getBaseUrl();

  const boutiqueRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}`, { cache: "no-store" });
  if (!boutiqueRes.ok) {
    notFound();
  }
  const { boutique, categories } = (await boutiqueRes.json()) as {
    boutique: { nom: string; settings: Record<string, unknown> | null };
    categories: { id: string; nom: string; slug: string }[];
  };

  const basePath = await getBoutiqueBasePath(slug);
  const home = basePath || "/";

  const rawColorMode = boutique.settings?.colorMode;
  const colorMode = rawColorMode === "light" || rawColorMode === "dark" ? rawColorMode : undefined;
  const niche = typeof boutique.settings?.niche === "string" ? boutique.settings.niche : undefined;

  return (
    <div className="min-h-screen bg-[var(--bg)]" data-boutique-theme={colorMode} data-boutique-niche={niche}>
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href={home} className="shrink-0 text-lg font-bold text-[var(--text-primary)]">
            {boutique.nom}
          </Link>

          <form
            method="get"
            action={home}
            className="order-3 w-full sm:order-2 sm:w-auto sm:flex-1 sm:max-w-md"
          >
            <input
              type="search"
              name="search"
              placeholder="Rechercher un produit…"
              className="w-full rounded-full border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </form>

          <div className="order-2 ml-auto flex items-center gap-3 sm:order-3 sm:ml-0">
            <span
              aria-hidden="true"
              title="Liste de favoris — bientôt disponible"
              className="flex h-9 w-9 cursor-default items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-faint)]"
            >
              ♡
            </span>
            <span
              aria-hidden="true"
              title="Compte client — bientôt disponible"
              className="flex h-9 w-9 cursor-default items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-faint)]"
            >
              👤
            </span>
            <BoutiqueHeaderCart fullCartHref={`${home}#panier`} />
          </div>
        </div>

        <nav className="border-t border-[var(--border)]">
          <div className="mx-auto flex max-w-7xl items-center gap-6 overflow-x-auto whitespace-nowrap px-4 py-3 text-sm font-medium text-[var(--text-muted)] sm:px-6 lg:px-8">
            <Link href={home} className="shrink-0 transition hover:text-[var(--text-primary)]">
              Accueil
            </Link>
            {categories?.map((category) => (
              <Link
                key={category.id}
                href={`${home}?categoryId=${category.id}`}
                className="shrink-0 transition hover:text-[var(--text-primary)]"
              >
                {category.nom}
              </Link>
            ))}
            <Link href={`${home}#catalogue`} className="shrink-0 transition hover:text-[var(--text-primary)]">
              Catalogue
            </Link>
            <Link
              href={`${basePath}/mentions-legales`}
              className="shrink-0 transition hover:text-[var(--text-primary)] ml-auto"
            >
              Mentions légales
            </Link>
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}
