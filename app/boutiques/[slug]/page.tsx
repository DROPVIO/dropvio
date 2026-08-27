import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import BoutiqueCart from "@/app/components/BoutiqueCart";
import { TEXTES_DEFAUT } from "@/lib/site-templates";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";

const PAGE_SIZE = 12;

function formatPrice(value: number) {
  return `${value.toFixed(2).replace(".00", ".00")}€`;
}

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

  const boutiqueRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}`, { cache: "no-store" });
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

  const boutiqueRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}`, { cache: "no-store" });
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

  const template = TEXTES_DEFAUT.generique;
  const basePath = await getBoutiqueBasePath(slug);

  return (
    <main className="min-h-screen bg-[#07080e] text-white">
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_0.45fr]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-xl shadow-violet-500/10">
              <p className="text-sm uppercase tracking-[0.3em] text-violet-300">Boutique</p>
              <h1 className="mt-4 text-4xl font-bold text-white">{boutique.nom}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-zinc-300">{boutique.description || template.description}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={`${basePath || "/"}${searchTerm ? `?search=${encodeURIComponent(searchTerm)}` : ""}`}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    !categoryId
                      ? "border-violet-400 bg-violet-500/15 text-white"
                      : "border-white/10 bg-white/5 text-white hover:border-violet-400/60 hover:bg-violet-500/10"
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
                          ? "border-violet-400 bg-violet-500/15 text-white"
                          : "border-white/10 bg-white/5 text-white hover:border-violet-400/60 hover:bg-violet-500/10"
                      }`}
                    >
                      {category.nom}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-[#0f1320] p-8">
              <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Produits</h2>
                  <p className="mt-2 text-sm text-zinc-400">Découvre tous les produits disponibles dans cette boutique.</p>
                </div>
                <div className="rounded-full bg-violet-500/10 px-4 py-2 text-sm text-violet-200">{produits?.length ?? 0} produit(s)</div>
              </div>
              <form method="get" className="mb-6 grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                  <input
                    name="search"
                    defaultValue={searchTerm}
                    placeholder="Recherche nom ou description"
                    className="w-full rounded-2xl border border-white/10 bg-[#0d0d14] px-4 py-3 text-sm text-white outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                  <input type="hidden" name="categoryId" value={categoryId} />
                </div>
                <button
                  type="submit"
                  className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
                >
                  Filtrer
                </button>
              </form>
              {produits && produits.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {produits.map((produit) => (
                    <Link
                      key={produit.id}
                      href={`${basePath}/produits/${produit.id}`}
                      className="group overflow-hidden rounded-3xl border border-white/10 bg-[#141827] transition hover:border-violet-500/40 hover:bg-[#1a1f33]"
                    >
                      <div className="relative h-64 overflow-hidden bg-[#0f1320]">
                        {produit.image_urls?.[0] ? (
                          <img
                            src={produit.image_urls[0]}
                            alt={produit.nom}
                            className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-3xl text-zinc-700">🖼️</div>
                        )}
                      </div>
                      <div className="space-y-3 p-6">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-white">{produit.nom}</h3>
                            <p className="mt-2 text-sm text-zinc-400 line-clamp-2">{produit.description || "Pas de description disponible."}</p>
                          </div>
                          <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-violet-200">
                            {produit.boutique_categories?.nom ?? "Sans catégorie"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-sm text-white/90">
                          <span className="font-semibold">{formatPrice(produit.prix_vente)}</span>
                          {produit.prix_original ? <span className="text-zinc-500 line-through">{formatPrice(produit.prix_original)}</span> : null}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-dashed border-white/10 bg-white/5 p-10 text-center text-sm text-zinc-400">
                  Aucun produit trouvé dans cette boutique.
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-3xl border border-white/10 bg-[#13131f] p-6">
              <h2 className="text-lg font-semibold text-white">À propos</h2>
              <p className="mt-4 text-sm leading-7 text-zinc-400">{boutique.description || template.sousTitre}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-[#13131f] p-6">
              <h2 className="text-lg font-semibold text-white">Paiement</h2>
              <div className="mt-4 space-y-3 text-sm text-zinc-400">
                <p>🔒 Paiement sécurisé — bientôt disponible</p>
                <p>🚚 Livraison suivie</p>
                <p>↩ Retour sous 14 jours</p>
              </div>
            </div>
            <BoutiqueCart />
          </aside>
        </div>
      </section>
    </main>
  );
}
