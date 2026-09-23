"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { toIntlTag, type AppLocale } from "@/lib/locale";

type Site = {
  id: string;
  nom_produit: string;
  created_at: string;
  est_favori: boolean;
};

// Favoris en premier, ordre chronologique conservé à l'intérieur de chaque groupe — même
// tri que le serveur (app/api/sites-generes/route.ts), réutilisé ici pour retrier
// immédiatement après un toggle optimiste, sans attendre un rechargement complet.
function sortSites(list: Site[]): Site[] {
  return [...list].sort((a, b) => {
    if (a.est_favori !== b.est_favori) return a.est_favori ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export default function MesSitesPage() {
  const t = useTranslations("dashboard.mesSites");
  const tCommon = useTranslations("dashboard.common");
  const intlTag = toIntlTag(useLocale() as AppLocale);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null);
  const [shopifyDomainInput, setShopifyDomainInput] = useState("");
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [pushErrors, setPushErrors] = useState<Record<string, string>>({});
  const [pushResults, setPushResults] = useState<Record<string, { url: string; admin_url: string }>>({});
  // Plan free : téléchargement et publication Shopify réservés à Pro/Agency (voir diagnostic
  // "restriction export Site Builder") — démarre à false (état le plus restrictif) tant que
  // /api/plan n'a pas répondu.
  const [plan, setPlan] = useState<"free" | "pro" | "agency" | null>(null);
  const canExport = plan === "pro" || plan === "agency";

  useEffect(() => {
    fetch("/api/sites-generes")
      .then((r) => r.json())
      .then((json) => {
        if (json.error) setError(json.error);
        else setSites(json.sites ?? []);
      })
      .catch(() => setError(t("errorLoad")))
      .finally(() => setLoading(false));

    fetch("/api/shopify/status")
      .then((r) => r.json())
      .then((json) => setShopifyConnected(Boolean(json.connected)))
      .catch(() => setShopifyConnected(false));

    fetch("/api/plan")
      .then((r) => r.json())
      .then((json) => setPlan(json.plan ?? "free"))
      .catch(() => setPlan("free"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleConnectShopify() {
    const shop = shopifyDomainInput.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      alert(t("shopifyFormatAlert"));
      return;
    }
    const returnTo = window.location.pathname;
    window.location.href = `/api/shopify/connect?shop=${encodeURIComponent(shop)}&returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function handlePushShopify(site: Site) {
    setPushingId(site.id);
    setPushErrors((prev) => ({ ...prev, [site.id]: "" }));
    try {
      const res = await fetch(`/api/sites-generes/${site.id}/shopify-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "html" }),
      });
      const json = await res.json();
      if (!res.ok) {
        setPushErrors((prev) => ({ ...prev, [site.id]: json.error || t("errorPublish") }));
        return;
      }
      setPushResults((prev) => ({ ...prev, [site.id]: { url: json.url, admin_url: json.admin_url } }));
    } catch {
      setPushErrors((prev) => ({ ...prev, [site.id]: t("errorServer") }));
    } finally {
      setPushingId(null);
    }
  }

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
      alert(t("errorDownload"));
    } finally {
      setDownloading(null);
    }
  }

  async function handleDelete(site: Site) {
    if (!confirm(t("confirmDelete", { nom: site.nom_produit }))) return;
    setDeleting(site.id);
    try {
      const res = await fetch(`/api/sites-generes/${site.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSites((prev) => prev.filter((s) => s.id !== site.id));
    } catch {
      alert(t("errorDelete"));
    } finally {
      setDeleting(null);
    }
  }

  // Optimiste : met à jour et retrie immédiatement, avant même la réponse serveur — annule
  // et revient à l'état précédent si la requête échoue.
  async function handleToggleFavori(site: Site) {
    const nextFavori = !site.est_favori;
    setSites((prev) => sortSites(prev.map((s) => (s.id === site.id ? { ...s, est_favori: nextFavori } : s))));
    try {
      const res = await fetch(`/api/sites-generes/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ est_favori: nextFavori }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setSites((prev) => sortSites(prev.map((s) => (s.id === site.id ? { ...s, est_favori: !nextFavori } : s))));
      alert(t("errorFavorite"));
    }
  }

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat(intlTag, {
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
            {t("badge")}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mb-2">{t("title")}</h1>
          <p className="text-[var(--text-muted)] text-sm">{t("subtitle")}</p>
        </div>

        {shopifyConnected === false && (
          <div className="mb-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-xs text-[var(--text-muted)] flex-1">{t("shopifyPrompt")}</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={shopifyDomainInput}
                onChange={(e) => setShopifyDomainInput(e.target.value)}
                placeholder={t("shopifyPlaceholder")}
                className="flex-1 sm:w-56 px-3 py-2 rounded-xl bg-[var(--bg)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)]/40"
              />
              <button
                onClick={handleConnectShopify}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all whitespace-nowrap"
              >
                {t("shopifyConnect")}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24 text-[var(--text-faint)] text-sm gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--border-strong)] border-t-violet-500 animate-spin" />
            {tCommon("loading")}
          </div>
        ) : error ? (
          <div className="rounded-2xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-6 py-8 text-center text-[var(--danger)] text-sm">
            {error}
          </div>
        ) : sites.length === 0 ? (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-6 py-16 text-center flex flex-col items-center gap-4">
            <span className="text-4xl">🏗️</span>
            <p className="text-[var(--text-primary)] font-semibold">{t("emptyTitle")}</p>
            <p className="text-[var(--text-faint)] text-sm max-w-xs">{t("emptyBody")}</p>
            <a
              href="/site-builder"
              className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition-all"
            >
              {t("emptyCta")}
            </a>
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--text-faint)] mb-4">{t("count", { count: sites.length })}</p>
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
                        {t("generatedOn", { date: formatDate(site.created_at) })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleFavori(site)}
                      aria-label={site.est_favori ? t("favoriteRemove") : t("favoriteAdd")}
                      className="shrink-0 text-lg leading-none transition hover:scale-110"
                    >
                      {site.est_favori ? "⭐" : "☆"}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <a
                      href={`/site-builder?regenerate=${site.id}`}
                      className="flex-1 py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-muted)] text-xs font-medium text-center hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] transition"
                    >
                      {t("regenerate")}
                    </a>
                    {canExport ? (
                      <button
                        onClick={() => handleDownload(site)}
                        disabled={downloading === site.id}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {downloading === site.id ? "…" : t("download")}
                      </button>
                    ) : (
                      <Link
                        href="/#pricing"
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all text-center"
                      >
                        {t("lockPro")}
                      </Link>
                    )}
                  </div>
                  {shopifyConnected && !canExport && (
                    <Link
                      href="/#pricing"
                      className="py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-muted)] text-xs font-medium text-center hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] transition"
                    >
                      {t("lockProShopify")}
                    </Link>
                  )}
                  {shopifyConnected && canExport && (
                    <button
                      onClick={() => handlePushShopify(site)}
                      disabled={pushingId === site.id}
                      className="py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-muted)] text-xs font-medium text-center hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)] transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {pushingId === site.id ? t("publishing") : t("publish")}
                    </button>
                  )}
                  {pushErrors[site.id] && (
                    <p className="text-[11px] text-[var(--danger)]">{pushErrors[site.id]}</p>
                  )}
                  {pushResults[site.id] && (
                    <p className="text-[11px] text-[var(--text-faint)]">
                      {t("publishedPrefix")}
                      <a
                        href={pushResults[site.id].url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] hover:underline"
                      >
                        {t("publishedLink")}
                      </a>
                    </p>
                  )}

                  <button
                    onClick={() => handleDelete(site)}
                    disabled={deleting === site.id}
                    className="text-xs text-[var(--text-faint)] hover:text-[var(--danger)] transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleting === site.id ? t("deleting") : t("delete")}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
