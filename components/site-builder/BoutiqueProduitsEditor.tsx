"use client";

import { BOUTIQUE_PRODUITS_CAP, type BoutiqueDraft, type ProduitBoutiqueDraft } from "@/lib/site-builder-handoff";

// Édition du brouillon multi-produits (mode boutique) — rendu une seule fois dans
// app/site-builder/page.tsx, partagé entre les modes IA et Éditeur de templates (tous deux
// consomment ensuite le même boutiqueDraft en lecture, voir handleGenerate et
// TemplateEditor.tsx). Pas de validation stricte ici : un produit incomplet est simplement
// ignoré par le rendu final (buildTemplateHtmlBoutique / handleGenerateBoutique).
const PRODUIT_VIDE: ProduitBoutiqueDraft = { nom: "", description: "", image: null, prixVente: "", prixOriginal: "" };

export default function BoutiqueProduitsEditor({
  draft,
  onChange,
}: {
  draft: BoutiqueDraft;
  onChange: (draft: BoutiqueDraft) => void;
}) {
  function updateProduit(i: number, patch: Partial<ProduitBoutiqueDraft>) {
    const produits = draft.produits.map((p, idx) => (idx === i ? { ...p, ...patch } : p));
    onChange({ ...draft, produits });
  }

  function removeProduit(i: number) {
    onChange({ ...draft, produits: draft.produits.filter((_, idx) => idx !== i) });
  }

  function addProduit() {
    if (draft.produits.length >= BOUTIQUE_PRODUITS_CAP) return;
    onChange({ ...draft, produits: [...draft.produits, { ...PRODUIT_VIDE }] });
  }

  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-5 mb-8">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--text-muted)]">Nom de la boutique</label>
        <input
          type="text"
          value={draft.nomBoutique}
          onChange={(e) => onChange({ ...draft, nomBoutique: e.target.value })}
          className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-[var(--text-muted)]">Description</label>
        <textarea
          value={draft.descriptionBoutique}
          onChange={(e) => onChange({ ...draft, descriptionBoutique: e.target.value })}
          rows={2}
          className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none"
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-[var(--text-muted)]">
          Produits ({draft.produits.length}
          {draft.totalProduitsBoutique > draft.produits.length ? ` sur ${draft.totalProduitsBoutique}` : ""})
        </p>
        <button
          type="button"
          onClick={addProduit}
          disabled={draft.produits.length >= BOUTIQUE_PRODUITS_CAP}
          className="text-[11px] text-[var(--accent)] hover:opacity-80 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Ajouter un produit{draft.produits.length >= BOUTIQUE_PRODUITS_CAP ? ` (max ${BOUTIQUE_PRODUITS_CAP})` : ""}
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {draft.produits.map((p, i) => (
          <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-widest">
                Produit {i + 1}
              </span>
              <button
                type="button"
                onClick={() => removeProduit(i)}
                className="text-xs text-[var(--danger)] hover:opacity-80 transition"
              >
                Supprimer
              </button>
            </div>

            <input
              type="text"
              placeholder="Nom du produit"
              value={p.nom}
              onChange={(e) => updateProduit(i, { nom: e.target.value })}
              className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
            <textarea
              placeholder="Description courte"
              value={p.description}
              onChange={(e) => updateProduit(i, { description: e.target.value })}
              rows={2}
              className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none"
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Prix de vente"
                  value={p.prixVente}
                  onChange={(e) => updateProduit(i, { prixVente: e.target.value })}
                  className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg pl-3 pr-8 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] text-sm">€</span>
              </div>
              <div className="relative">
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Prix barré"
                  value={p.prixOriginal}
                  onChange={(e) => updateProduit(i, { prixOriginal: e.target.value })}
                  className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg pl-3 pr-8 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)] text-sm">€</span>
              </div>
            </div>
            <input
              type="url"
              placeholder="URL de l'image (optionnel)"
              value={p.image ?? ""}
              onChange={(e) => updateProduit(i, { image: e.target.value.trim() || null })}
              className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
            {p.image && (
              <div className="rounded-lg overflow-hidden border border-[var(--border-strong)] bg-[var(--bg)] h-24 w-24 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.image}
                  alt="Aperçu"
                  className="max-h-full max-w-full object-contain"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </div>
        ))}
        {draft.produits.length === 0 && (
          <p className="text-sm text-[var(--text-faint)] text-center py-6">
            Aucun produit — ajoute-en au moins un pour générer un site.
          </p>
        )}
      </div>
    </div>
  );
}
