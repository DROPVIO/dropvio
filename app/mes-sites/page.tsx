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
    <div className="min-h-screen bg-[#0a0a0f] text-white font-sans px-4 py-16">
      <div className="max-w-4xl mx-auto">

        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Mes sites
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">
            Landing pages générées
          </h1>
          <p className="text-zinc-400 text-sm">
            Toutes vos landing pages sauvegardées automatiquement après génération.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500 text-sm gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-violet-500 animate-spin" />
            Chargement…
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 px-6 py-8 text-center text-red-400 text-sm">
            {error}
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-2xl bg-[#13131f] border border-white/5 px-6 py-16 text-center flex flex-col items-center gap-4">
            <span className="text-4xl">🏗️</span>
            <p className="text-white font-semibold">Aucun site généré pour l&apos;instant</p>
            <p className="text-zinc-500 text-sm max-w-xs">
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
            <p className="text-xs text-zinc-600 mb-4">
              {sites.length} site{sites.length > 1 ? "s" : ""} sauvegardé{sites.length > 1 ? "s" : ""}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {sites.map((site) => (
                <div
                  key={site.id}
                  className="rounded-2xl bg-[#13131f] border border-white/5 p-5 flex flex-col gap-4 hover:border-white/10 transition"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-base shrink-0">
                      🌐
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">
                        {site.nom_produit}
                      </p>
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Généré le {formatDate(site.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href="/site-builder"
                      className="flex-1 py-2 rounded-xl border border-white/10 text-zinc-400 text-xs font-medium text-center hover:border-white/20 hover:text-white transition"
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
