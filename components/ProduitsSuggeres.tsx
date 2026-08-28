"use client";

import { useEffect, useState } from "react";
import { slugify } from "@/lib/slugify";

type Suggestion = {
  id: string;
  nom: string;
  image: string | null;
  prixFournisseur: number;
  prixVente: number;
  niche: string;
  commandes: number;
  note: number | null;
  croissance: number | null;
};

// Suggestions de produits catalogue "complémentaires" à ce qui est déjà dans une boutique
// (GET /api/boutiques/[id]/suggestions-produits — requête Supabase classique, pas d'appel
// IA). Réutilisé à la fois sur la page de gestion de boutique et sur le flux "Ajouter à
// une boutique" du finder de produits gagnants.
export default function ProduitsSuggeres({
  boutiqueId,
  refreshKey,
  onAdded,
}: {
  boutiqueId: string;
  refreshKey?: number | string;
  onAdded?: () => void;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    // setState différé (microtask) plutôt qu'appelé en synchrone dans le corps de
    // l'effet, pour éviter le re-render en cascade immédiat (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
    });
    fetch(`/api/boutiques/${boutiqueId}/suggestions-produits`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Impossible de charger les suggestions.");
          return;
        }
        setSuggestions(json.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("Impossible de contacter le serveur.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boutiqueId, refreshKey]);

  async function handleAdd(suggestion: Suggestion) {
    setAddingId(suggestion.id);
    setError(null);
    try {
      const response = await fetch(`/api/boutiques/${boutiqueId}/produits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: suggestion.nom,
          slug: slugify(suggestion.nom),
          image_urls: suggestion.image ? [suggestion.image] : [],
          prix_vente: suggestion.prixVente,
          prix_original: null,
          stock: 0,
          stock_status: "in_stock",
          source_produit_id: suggestion.id,
          meta: {},
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setError(json.error ?? "Impossible d'ajouter ce produit.");
        return;
      }
      setAddedIds((prev) => new Set(prev).add(suggestion.id));
      onAdded?.();
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setAddingId(null);
    }
  }

  // Pas de suggestion exploitable (boutique sans produit relié au catalogue) -> pas de
  // section plutôt qu'un encart vide qui n'apporte rien.
  if (!loading && suggestions.length === 0 && !error) return null;

  return (
    <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <div className="mb-4">
        <p className="text-xs uppercase tracking-[0.3em] text-violet-400">Suggestions</p>
        <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Produits complémentaires suggérés</h3>
        <p className="mt-1 text-sm text-[var(--text-faint)]">
          Basées sur la niche des produits déjà dans cette boutique.
        </p>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--text-faint)]">Chargement des suggestions…</p>
      ) : error ? (
        <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">{error}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {suggestions.map((s) => {
            const added = addedIds.has(s.id);
            return (
              <div
                key={s.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface-2)]"
              >
                <div className="h-32 overflow-hidden bg-[var(--surface-3)]">
                  {s.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.image} alt={s.nom} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-3xl">🛍️</div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <p className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]">{s.nom}</p>
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
                    <span className="font-semibold text-violet-300">{s.prixVente.toFixed(2)}€</span>
                    <span>{s.commandes > 1000 ? `${(s.commandes / 1000).toFixed(0)}k` : s.commandes} cmd</span>
                  </div>
                  {s.croissance !== null && (
                    <span
                      className={`text-[11px] font-semibold ${s.croissance >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}
                    >
                      {s.croissance >= 0 ? "↑" : "↓"} {Math.abs(s.croissance).toFixed(0)}% de croissance
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAdd(s)}
                    disabled={added || addingId === s.id}
                    className="mt-auto w-full rounded-xl bg-violet-600 py-2.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {added ? "✓ Ajouté" : addingId === s.id ? "Ajout…" : "Ajouter à la boutique"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
