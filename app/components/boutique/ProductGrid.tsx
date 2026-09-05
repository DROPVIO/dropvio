import Link from "next/link";

export type BoutiqueProduitCarte = {
  id: string;
  nom: string;
  description: string | null;
  prix_vente: number;
  prix_original: number | null;
  image_urls: string[] | null;
  boutique_categories: { nom: string; slug: string } | null;
};

function formatPrice(value: number) {
  return `${value.toFixed(2)}€`;
}

// Grille de cartes produit partagée entre l'accueil boutique et les pages collection —
// avant cette extraction, le même JSX était dupliqué entre les deux.
export default function ProductGrid({
  produits,
  basePath,
  emptyMessage = "Aucun produit trouvé dans cette boutique.",
}: {
  produits: BoutiqueProduitCarte[];
  basePath: string;
  emptyMessage?: string;
}) {
  if (!produits || produits.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--text-muted)]">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {produits.map((produit, index) => (
        <Link
          key={produit.id}
          href={`${basePath}/produits/${produit.id}`}
          className="boutique-product-card boutique-fade-in group overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
          style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
        >
          <div className="relative aspect-square overflow-hidden bg-[var(--surface-2)]">
            {produit.image_urls?.[0] ? (
              <img
                src={produit.image_urls[0]}
                alt={produit.nom}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--text-faint)]">🖼️</div>
            )}
            {produit.boutique_categories?.nom ? (
              <span className="absolute left-3 top-3 rounded-full bg-[var(--bg)]/90 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-violet-300">
                {produit.boutique_categories.nom}
              </span>
            ) : null}
          </div>
          <div className="space-y-1.5 p-4">
            <h3 className="text-base font-semibold text-[var(--text-primary)] line-clamp-1">{produit.nom}</h3>
            <div className="flex items-center gap-2 text-sm">
              <span className="price-tag font-semibold">{formatPrice(produit.prix_vente)}</span>
              {produit.prix_original ? <span className="text-[var(--text-faint)] line-through">{formatPrice(produit.prix_original)}</span> : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
