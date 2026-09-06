import type { CSSProperties } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";
import { fetchBoutiqueApi } from "@/lib/boutique-internal-fetch";
import BoutiqueHeaderCart from "@/app/components/boutique/BoutiqueHeaderCart";
import SecondaryBanner from "@/app/components/boutique/SecondaryBanner";

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

  const boutiqueRes = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}`);
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

  const rawPalette = boutique.settings?.palette as { primary?: unknown; secondary?: unknown; accent?: unknown } | undefined;
  const hasCustomPalette =
    typeof rawPalette?.primary === "string" && typeof rawPalette?.accent === "string";
  const paletteStyle = hasCustomPalette
    ? ({
        "--boutique-palette-primary": rawPalette!.primary,
        "--boutique-palette-accent": rawPalette!.accent,
        ...(typeof rawPalette!.secondary === "string" ? { "--boutique-palette-secondary": rawPalette!.secondary } : {}),
      } as CSSProperties)
    : undefined;

  return (
    <div
      className="min-h-screen bg-[var(--bg)]"
      data-boutique-theme={colorMode}
      data-boutique-niche={niche}
      data-boutique-palette={hasCustomPalette ? "custom" : undefined}
      style={paletteStyle}
    >
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
            {/* La page d'accueil n'a plus de panneau panier statique (doublon avec ce
                tiroir, retiré lors de la refonte de la page d'accueil) — "Voir mon panier"
                ramène simplement à l'accueil de la boutique. */}
            <BoutiqueHeaderCart fullCartHref={home} />
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
                href={`${basePath}/collections/${category.slug}`}
                className="shrink-0 transition hover:text-[var(--text-primary)]"
              >
                {category.nom}
              </Link>
            ))}
            <Link href={`${basePath}/produits`} className="shrink-0 transition hover:text-[var(--text-primary)]">
              Catalogue
            </Link>
            <Link
              href={`${home}#a-propos`}
              className="shrink-0 transition hover:text-[var(--text-primary)] ml-auto"
            >
              À propos
            </Link>
            <Link
              href={`${basePath}/mentions-legales`}
              className="shrink-0 transition hover:text-[var(--text-primary)]"
            >
              Mentions légales
            </Link>
          </div>
        </nav>
      </header>
      <SecondaryBanner texte={boutique.settings?.bandeauTexte as string | null | undefined} />
      {children}

      {/* Footer — présent sur toutes les pages boutique publiques (ce layout les wrap
          toutes), pas seulement l'accueil, pour que ces liens restent joignables peu
          importe où le visiteur navigue. Mêmes cibles que la nav du header ci-dessus.
          "Nos collections" pointe vers /produits (pas de page "toutes les collections"
          dédiée aujourd'hui, /produits porte déjà les filtres par catégorie) et disparaît
          s'il n'y a aucune catégorie — pas de lien mort. */}
      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-8 text-sm text-[var(--text-muted)] sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span className="font-semibold text-[var(--text-primary)]">{boutique.nom}</span>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href={`${basePath}/mentions-legales`} className="transition hover:text-[var(--text-primary)]">
              Mentions légales
            </Link>
            <Link href={`${home}#a-propos`} className="transition hover:text-[var(--text-primary)]">
              À propos
            </Link>
            <Link href={`${basePath}/produits`} className="transition hover:text-[var(--text-primary)]">
              Catalogue
            </Link>
            {categories && categories.length > 0 ? (
              <Link href={`${basePath}/produits`} className="transition hover:text-[var(--text-primary)]">
                Nos collections
              </Link>
            ) : null}
          </div>
        </div>
      </footer>
    </div>
  );
}
