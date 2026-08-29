import type { Metadata } from "next";
import AddToCartButton from "@/app/components/AddToCartButton";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";

function formatPrice(value: number) {
  return `${value.toFixed(2)}€`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// Le fetch produit ci-dessous est identique (même URL/options) à celui du composant de
// page : Next.js le dédoublonne automatiquement pendant le rendu d'une même requête.
// Le fetch boutique n'est en revanche fait que pour le titre — la page elle-même n'a pas
// besoin du nom de la boutique, donc pas de dédoublonnage possible pour celui-là.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; produitId: string }>;
}): Promise<Metadata> {
  const { slug, produitId } = await params;
  const baseUrl = await getBaseUrl();

  const [boutiqueRes, produitRes] = await Promise.all([
    fetch(`${baseUrl}/api/boutiques/slug/${slug}`, { cache: "no-store" }),
    fetch(`${baseUrl}/api/boutiques/slug/${slug}/produits/${produitId}`, { cache: "no-store" }),
  ]);

  if (!produitRes.ok) {
    return { title: "Produit introuvable" };
  }

  const { produit } = (await produitRes.json()) as {
    produit: { nom: string; description: string | null; prix_vente: number };
  };
  const boutiqueNom = boutiqueRes.ok
    ? ((await boutiqueRes.json()) as { boutique: { nom: string } }).boutique.nom
    : null;

  const title = boutiqueNom ? `${produit.nom} — ${boutiqueNom} · Dropvio` : `${produit.nom} · Dropvio`;
  const description = produit.description?.trim()
    ? truncate(produit.description.trim(), 155)
    : `${produit.nom} à ${produit.prix_vente.toFixed(2)}€.`;

  const boutiqueUrl = getBoutiquePublicUrl(slug);
  const absoluteBoutiqueUrl = boutiqueUrl.startsWith("http") ? boutiqueUrl : `${baseUrl}${boutiqueUrl}`;
  const canonical = `${absoluteBoutiqueUrl}/produits/${produitId}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ProduitPage({
  params,
}: {
  params: Promise<{ slug: string; produitId: string }>;
}) {
  const { slug, produitId } = await params;
  const baseUrl = await getBaseUrl();

  const produitRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}/produits/${produitId}`, {
    cache: "no-store",
  });

  if (!produitRes.ok) {
    notFound();
  }

  const { produit } = (await produitRes.json()) as {
    produit: {
      id: string;
      nom: string;
      slug: string;
      description: string | null;
      prix_vente: number;
      prix_original: number | null;
      image_urls: string[] | null;
      stock: number;
      stock_status: string;
      boutique_categories: { nom: string; slug: string } | null;
    };
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 xl:grid-cols-[0.65fr_0.35fr]">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-xl shadow-violet-500/10">
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.3em] text-violet-300">Produit</p>
              <h1 className="mt-2 text-4xl font-bold text-[var(--text-primary)]">{produit.nom}</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{produit.boutique_categories?.nom ?? "Sans catégorie"}</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[0.8fr_0.4fr]">
              <div>
                <div className="rounded-3xl overflow-hidden border border-[var(--border)] bg-[var(--surface-2)]">
                  {produit.image_urls?.[0] ? (
                    <img
                      src={produit.image_urls[0]}
                      alt={produit.nom}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center text-5xl text-[var(--text-faint)]">🖼️</div>
                  )}
                </div>
                <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">Description</h2>
                  <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">{produit.description || "Aucune description disponible."}</p>
                </div>
              </div>
              <aside className="space-y-6">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">Prix</h2>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-3xl font-bold text-[var(--text-primary)]">{formatPrice(produit.prix_vente)}</span>
                    {produit.prix_original ? <span className="text-sm text-[var(--text-faint)] line-through">{formatPrice(produit.prix_original)}</span> : null}
                  </div>
                  <p className="mt-4 text-sm text-[var(--text-muted)]">Stock : {produit.stock} ({produit.stock_status === "in_stock" ? "En stock" : "Rupture"})</p>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">Commander</h2>
                  <p className="mt-4 text-sm text-[var(--text-muted)]">Ajoute ce produit au panier puis passe à la caisse. Paiement sécurisé — bientôt disponible.</p>
                  <AddToCartButton
                    boutiqueSlug={slug}
                    produitId={produit.id}
                    slug={produit.slug}
                    nom={produit.nom}
                    prix={produit.prix_vente}
                    imageUrl={produit.image_urls?.[0] ?? null}
                  />
                </div>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
