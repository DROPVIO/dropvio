"use client";

import { useState, useEffect } from "react";

type Site = {
  id: string;
  nom_produit: string;
  created_at: string;
};

export default function MesSitesPage() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sites-generes")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setSites(json.sites ?? []);
      })
      .catch(() => setError("Impossible de charger les sites"))
      .finally(() => setLoading(false));
  }, []);

  async function handleDownload(site: Site) {
    setDownloading(site.id);
    try {
      const res = await fetch(`/api/sites-generes/${site.id}`);
      const json = await res.json();
      if (!res.ok || !json.html_content) throw new Error();

      const blob = new Blob([json.html_content], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${site.nom_produit.replace(/\s+/g, "-").toLowerCase()}-landing.html`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Erreur lors du téléchargement.");
    } finally {
      setDownloading(null);
    }
  }

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-sans px-4 py-16">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[var(--accent)] text-xs font-medium tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Mes sites
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            Landing pages générées
          </h1>
          <p className="text-[var(--text-muted)] text-sm">
            Toutes vos landing pages sauvegardées automatiquement après génération.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-[var(--text-faint)] text-sm gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--border-strong)] border-t-violet-500 animate-spin" />
            Chargement…
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-6 py-8 text-center text-[var(--danger)] text-sm">
            {error}
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-6 py-16 text-center flex flex-col items-center gap-4">
            <span className="text-4xl">🏗️</span>
            <p className="text-[var(--text-primary)] font-semibold">Aucun site généré pour l&apos;instant</p>
            <p className="text-[var(--text-faint)] text-sm max-w-xs">
              Génère ta première landing page depuis le Site Builder et elle apparaîtra ici automatiquement.
            </p>
            <a
              href="/site-builder"
              className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition-all"
            >
              Créer une landing page →
            </a>
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--text-faint)] mb-4">
              {sites.length} site{sites.length > 1 ? "s" : ""} sauvegardé{sites.length > 1 ? "s" : ""}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-5 flex flex-col gap-4 hover:border-[var(--border-strong)] transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-base shrink-0">
                      🌐
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                        {site.nom_produit}
                      </p>
                      <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                        Généré le {formatDate(site.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href="/site-builder"
                      className="flex-1 py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-muted)] text-xs font-medium text-center hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] transition"
                    >
                      Regénérer
                    </a>
                    <button
                      onClick={() => handleDownload(site)}
                      disabled={downloading === site.id}
                      className="flex-1 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {downloading === site.id ? "…" : "Télécharger le HTML"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
