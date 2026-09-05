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
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {produits.map((produit) => (
        <Link
          key={produit.id}
          href={`${basePath}/produits/${produit.id}`}
          className="group overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] transition hover:border-violet-500/40 hover:bg-[var(--surface-2)]"
        >
          <div className="relative h-64 overflow-hidden bg-[var(--surface-2)]">
            {produit.image_urls?.[0] ? (
              <img
                src={produit.image_urls[0]}
                alt={produit.nom}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-3xl text-[var(--text-faint)]">🖼️</div>
            )}
          </div>
          <div className="space-y-3 p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{produit.nom}</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)] line-clamp-2">{produit.description || "Pas de description disponible."}</p>
              </div>
              <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
                {produit.boutique_categories?.nom ?? "Sans catégorie"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm text-[var(--text-primary)]/90">
              <span className="price-tag font-semibold">{formatPrice(produit.prix_vente)}</span>
              {produit.prix_original ? <span className="text-[var(--text-faint)] line-through">{formatPrice(produit.prix_original)}</span> : null}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
