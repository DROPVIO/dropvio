"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { isValidSlug, slugify } from "@/lib/slugify";
import { useApiErrorMessage } from "@/lib/use-api-error";

type Boutique = {
  id: string;
  nom: string;
  slug: string;
  description: string | null;
  est_publique: boolean;
};


export default function BoutiqueBuilderListPage() {
  const router = useRouter();
  const t = useTranslations("siteBuilder.boutique.liste");
  const apiErrorMessage = useApiErrorMessage();
  const [boutiques, setBoutiques] = useState<Boutique[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
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
        setError(apiErrorMessage(data, t("erreurChargement")));
        return;
      }
      setBoutiques(data.boutiques || []);
    } catch {
      setError(apiErrorMessage({ code: "network" }));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!nom.trim()) {
      setError(t("nomRequis"));
      return;
    }
    const computedSlug = slug.trim() || slugify(nom);
    if (!isValidSlug(computedSlug)) {
      setError(apiErrorMessage({ code: "slug_invalid" }));
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/boutiques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, slug: computedSlug, description, settings: {} }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(json, t("erreurCreation")));
        return;
      }
      setNom("");
      setSlug("");
      setDescription("");
      void router.refresh();
      await fetchBoutiques();
      router.push(`/site-builder/boutique/${json.id}`);
    } catch {
      setError(apiErrorMessage({ code: "network" }));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-14 text-[var(--text-primary)]">
      <div className="mx-auto max-w-5xl">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-violet-400">{t("surtitre")}</p>
            <h1 className="mt-3 text-3xl font-bold">{t("titre")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
              {t("intro")}
            </p>
          </div>
          <Link
            href="/site-builder"
            className="inline-flex items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
          >
            {t("retourGenerateur")}
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("tesBoutiques")}</h2>
            <p className="mt-2 text-sm text-[var(--text-faint)]">
              {t("tesBoutiquesAide")}
            </p>

            {loading ? (
              <div className="mt-6 text-sm text-[var(--text-muted)]">{t("chargement")}</div>
            ) : error ? (
              <div className="mt-6 rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 p-4 text-sm text-[var(--danger)]">
                {error}
              </div>
            ) : boutiques.length === 0 ? (
              <div className="mt-6 text-sm text-[var(--text-muted)]">{t("vide")}</div>
            ) : (
              <div className="mt-6 space-y-4">
                {boutiques.map((boutique) => (
                  <Link
                    key={boutique.id}
                    href={`/site-builder/boutique/${boutique.id}`}
                    className="block rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4 transition hover:border-violet-500/30 hover:bg-[var(--surface-3)]"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{boutique.nom}</p>
                        <p className="text-sm text-[var(--text-faint)]">/{boutique.slug}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                            boutique.est_publique
                              ? "bg-emerald-500/10 text-[var(--success)]"
                              : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                          }`}
                        >
                          {boutique.est_publique ? t("publique") : t("privee")}
                        </span>
                        <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-[var(--accent)]">
                          {t("ouvrir")}
                        </span>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-[var(--text-muted)]">{boutique.description || t("sansDescription")}</p>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("creerTitre")}</h2>
                <p className="mt-1 text-sm text-[var(--text-faint)]">{t("creerAide")}</p>
              </div>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleCreate}>
              <div>
                <label className="text-sm font-medium text-[var(--text-muted)]">{t("nom")}</label>
                <input
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder={t("nomPlaceholder")}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-muted)]">{t("slug")}</label>
                <input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder={t("slugPlaceholder")}
                />
                <p className="mt-2 text-xs text-[var(--text-faint)]">{t("slugAide")}</p>
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--text-muted)]">{t("description")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none"
                  placeholder={t("descriptionPlaceholder")}
                />
              </div>

              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center justify-center rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
              >
                {creating ? t("creation") : t("creer")}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
