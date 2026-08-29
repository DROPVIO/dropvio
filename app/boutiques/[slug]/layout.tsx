import Link from "next/link";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";

// Layout partagé par toutes les pages boutique publique (page.tsx, produits/[produitId],
// mentions-legales). Porte la nav standard (Accueil, Nos collections, Catalogue, Mentions
// légales) commune à toutes ces pages — avant ce layout, chaque page recréait son propre
// en-tête indépendamment. Le fetch ci-dessous cible la même URL que celui déjà fait par
// page.tsx/produits/[produitId]/page.tsx : Next.js dédoublonne automatiquement les appels
// fetch identiques faits pendant le rendu d'une même requête, donc pas de coût réseau
// supplémentaire malgré le fetch en double dans le code.
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
  const { boutique } = (await boutiqueRes.json()) as { boutique: { nom: string } };

  const basePath = await getBoutiqueBasePath(slug);
  const home = basePath || "/";

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <nav className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link href={home} className="text-lg font-bold text-[var(--text-primary)]">
            {boutique.nom}
          </Link>
          <div className="flex flex-wrap items-center gap-6 text-sm font-medium text-[var(--text-muted)]">
            <Link href={home} className="transition hover:text-[var(--text-primary)]">
              Accueil
            </Link>
            <Link href={`${home}#collections`} className="transition hover:text-[var(--text-primary)]">
              Nos collections
            </Link>
            <Link href={`${home}#catalogue`} className="transition hover:text-[var(--text-primary)]">
              Catalogue
            </Link>
            <Link href={`${basePath}/mentions-legales`} className="transition hover:text-[var(--text-primary)]">
              Mentions légales
            </Link>
            <span
              aria-hidden="true"
              title="Compte client — bientôt disponible"
              className="flex h-8 w-8 cursor-default items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-faint)]"
            >
              👤
            </span>
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}
