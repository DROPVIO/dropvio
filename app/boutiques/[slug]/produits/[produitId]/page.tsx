import type { Metadata } from "next";
import Image from "next/image";
import AddToCartButton from "@/app/components/AddToCartButton";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/get-base-url";
import { fetchBoutiqueApi } from "@/lib/boutique-internal-fetch";
import {
  chargerBoutiquePublique,
  metadonneesBoutique,
  metadonneesIntrouvable,
  traductionsBoutique,
  tronquer,
  urlAbsolueBoutique,
} from "@/lib/boutique-public";
import { DEVISE_BOUTIQUE, formatPrix } from "@/lib/boutique-format";
import JsonLd from "@/app/components/boutique/JsonLd";

type Produit = {
  id: string;
  nom: string;
  slug: string;
  description: string | null;
  prix_vente: number;
  prix_original: number | null;
  image_urls: string[] | null;
  boutique_categories: { nom: string; slug: string } | null;
};

async function chargerProduit(slug: string, produitId: string): Promise<Produit | null> {
  const baseUrl = await getBaseUrl();
  const res = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}/produits/${produitId}`);
  if (!res.ok) return null;
  return ((await res.json()) as { produit: Produit }).produit;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; produitId: string }>;
}): Promise<Metadata> {
  const { slug, produitId } = await params;
  const [donnees, produit] = await Promise.all([chargerBoutiquePublique(slug), chargerProduit(slug, produitId)]);
  if (!donnees || !produit) return metadonneesIntrouvable();
  const { boutique } = donnees;
  const t = await traductionsBoutique(boutique.langue);

  return metadonneesBoutique({
    boutique,
    titre: t("meta.produitTitre", { produit: produit.nom, nom: boutique.nom }),
    description: produit.description?.trim()
      ? tronquer(produit.description.trim(), 155)
      : t("meta.produitDescription", { produit: produit.nom, prix: formatPrix(produit.prix_vente, boutique.langue), nom: boutique.nom }),
    canonical: `${await urlAbsolueBoutique(slug)}/produits/${produitId}`,
  });
}

export default async function ProduitPage({
  params,
}: {
  params: Promise<{ slug: string; produitId: string }>;
}) {
  const { slug, produitId } = await params;
  const [donnees, produit] = await Promise.all([chargerBoutiquePublique(slug), chargerProduit(slug, produitId)]);
  if (!donnees || !produit) {
    notFound();
  }
  const { boutique } = donnees;
  const urlBoutique = await urlAbsolueBoutique(slug);
  const urlProduit = `${urlBoutique}/produits/${produit.id}`;
  const t = await traductionsBoutique(boutique.langue);
  const images = (produit.image_urls ?? []).filter(Boolean);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: produit.nom,
          ...(produit.description?.trim() && { description: produit.description.trim() }),
          ...(images.length > 0 && { image: images }),
          sku: produit.id,
          url: urlProduit,
          ...(produit.boutique_categories?.nom && { category: produit.boutique_categories.nom }),
          offers: {
            "@type": "Offer",
            price: Number(produit.prix_vente).toFixed(2),
            priceCurrency: DEVISE_BOUTIQUE,
            availability: "https://schema.org/InStock",
            url: urlProduit,
            seller: { "@type": "Store", name: boutique.nom, url: urlBoutique },
          },
        }}
      />
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 xl:grid-cols-[0.65fr_0.35fr]">
          <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8 shadow-xl shadow-violet-500/10">
            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.3em] text-violet-300">{t("produit.surtitre")}</p>
              <h1 className="mt-2 text-4xl font-bold text-[var(--text-primary)]">{produit.nom}</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">{produit.boutique_categories?.nom ?? t("produit.sansCategorie")}</p>
            </div>
            <div className="grid gap-6 lg:grid-cols-[0.8fr_0.4fr]">
              <div>
                <div className="relative aspect-square rounded-3xl overflow-hidden border border-[var(--border)] bg-[var(--surface-2)]">
                  {produit.image_urls?.[0] ? (
                    <Image
                      src={produit.image_urls[0]}
                      alt={produit.nom}
                      fill
                      sizes="(max-width: 1024px) 100vw, 60vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-5xl text-[var(--text-faint)]">🖼️</div>
                  )}
                </div>
                <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">{t("produit.description")}</h2>
                  <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">{produit.description || t("produit.sansDescription")}</p>
                </div>
              </div>
              <aside className="space-y-6">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">{t("produit.prix")}</h2>
                  <div className="mt-4 flex items-center gap-3">
                    <span className="price-tag text-3xl font-bold text-[var(--text-primary)]">{formatPrix(produit.prix_vente, boutique.langue)}</span>
                    {produit.prix_original ? <span className="text-sm text-[var(--text-faint)] line-through">{formatPrix(produit.prix_original, boutique.langue)}</span> : null}
                  </div>
                </div>
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
                  <h2 className="text-xl font-semibold text-[var(--text-primary)]">{t("produit.commander")}</h2>
                  <p className="mt-4 text-sm text-[var(--text-muted)]">{t("produit.commanderAide")}</p>
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
