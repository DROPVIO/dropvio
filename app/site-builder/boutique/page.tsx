"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Boutique = {
  id: string;
  nom: string;
  slug: string;
  description: string | null;
  theme: string | null;
  est_publique: boolean;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function BoutiqueBuilderListPage() {
  const router = useRouter();
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [theme, setTheme] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void fetchBoutiques();
  }, []);

  async function fetchBoutiques() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/boutiques");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de charger tes boutiques.");
        return;
      }
      setBoutiques(data.boutiques || []);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim()) {
      setError("Le nom de la boutique est requis.");
      return;
    }
    const computedSlug = slug.trim() || slugify(nom);
    if (!computedSlug) {
      setError("Le slug de la boutique est invalide.");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/boutiques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, slug: computedSlug, description, theme, settings: {} }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Impossible de créer la boutique.");
        return;
      }
      setNom("");
      setSlug("");
      setDescription("");
      setTheme("");
      void router.refresh();
      await fetchBoutiques();
      router.push(`/site-builder/boutique/${json.id}`);
    } catch {
      setError("Impossible de contacter le serveur.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0d14] px-4 py-14 text-white">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-violet-400">Boutique Dropvio</p>
            <h1 className="mt-3 text-3xl font-bold">Créer et gérer tes boutiques</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Gère plusieurs produits, catégories et ta boutique publique depuis Dropvio.
            </p>
          </div>
          <Link
            href="/site-builder"
            className="inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-violet-500/40 hover:bg-violet-500/10"
          >
            Retour au générateur actuel
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-white/10 bg-[#13131f] p-6">
            <h2 className="text-lg font-semibold text-white">Tes boutiques</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Crée une nouvelle boutique ou ouvre une boutique existante pour y ajouter des produits.
            </p>

            {loading ? (
              <div className="mt-6 text-sm text-zinc-400">Chargement...</div>
            ) : error ? (
              <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                {error}
              </div>
            ) : boutiques.length === 0 ? (
              <div className="mt-6 text-sm text-zinc-400">Aucune boutique créée pour le moment.</div>
            ) : (
              <div className="mt-6 space-y-4">
                {boutiques.map((boutique) => (
                  <Link
                    key={boutique.id}
                    href={`/site-builder/boutique/${boutique.id}`}
                    className="block rounded-3xl border border-white/10 bg-white/5 p-4 transition hover:border-violet-500/30 hover:bg-white/10"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-white">{boutique.nom}</p>
                        <p className="text-sm text-zinc-500">/{boutique.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                            boutique.est_publique
                              ? "bg-emerald-500/10 text-emerald-300"
                              : "bg-white/5 text-zinc-400"
                          }`}
                        >
                          {boutique.est_publique ? "Publique" : "Privée"}
                        </span>
                        <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-violet-300">
                          Ouvrir
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-zinc-400">{boutique.description || "Pas de description"}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#13131f] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Créer une boutique</h2>
                <p className="mt-1 text-sm text-zinc-500">Nom, slug, et thème de la boutique.</p>
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="text-sm font-medium text-zinc-300">Nom de la boutique</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d14] px-4 py-3 text-sm text-white outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder="Ex: Boutique Fitness"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300">Slug public</label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d14] px-4 py-3 text-sm text-white outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder="Ex: boutique-fitness"
                />
                <p className="mt-2 text-xs text-zinc-500">Laisse vide pour générer automatiquement à partir du nom.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d14] px-4 py-3 text-sm text-white outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none"
                  placeholder="Description courte de la boutique"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-zinc-300">Thème</label>
                <input
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d14] px-4 py-3 text-sm text-white outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder="Ex: premium"
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
              >
                {creating ? "Création..." : "Créer ma boutique"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
