"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toIntlTag, type AppLocale } from "@/lib/locale";

interface SpyResult {
  productCount: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  estimatedRevenue: number;
}

function formatCurrency(value: number, intlTag: string) {
  return new Intl.NumberFormat(intlTag, {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

// StatCard a besoin de 4 teintes d'accent distinctes (violet/blue/indigo/purple) — seules
// les deux premières ont un token dédié (--accent/--accent-secondary). Pour indigo/purple,
// pas de token existant : on bascule la nuance Tailwind elle-même selon le thème (600 sur
// fond clair, 300 sur fond sombre) plutôt que d'ajouter deux tokens pour un seul usage.
function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const read = () => setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return isLight;
}

export default function SpyPage() {
  const t = useTranslations("dashboard.spy");
  const intlTag = toIntlTag(useLocale() as AppLocale);
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!url.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/spy?url=${encodeURIComponent(url.trim())}`
      );
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? t("errorGeneric"));
      } else {
        setResult(json);
      }
    } catch {
      setError(t("errorApi"));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleAnalyze();
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-sans px-4 py-16">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[var(--accent)] text-xs font-medium tracking-widest uppercase">
            {t("badge")}
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] bg-clip-text text-transparent mb-3">
            {t("title")}
          </h1>
          <p className="text-[var(--text-muted)] text-base">{t("subtitle")}</p>
        </div>

        {/* Input */}
        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 mb-6 shadow-xl shadow-black/40">
          <label className="block text-sm font-medium text-[var(--text-muted)] mb-3">{t("urlLabel")}</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("urlPlaceholder")}
              className="flex-1 bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
            <button
              onClick={handleAnalyze}
              disabled={loading || !url.trim()}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-violet-900/30 whitespace-nowrap"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  {t("analyzing")}
                </span>
              ) : (
                t("analyze")
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 text-[var(--danger)] text-sm px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 shadow-xl shadow-black/40">
            <h2 className="text-sm font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-6">
              {t("results")}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <StatCard
                label={t("statProducts")}
                value={result.productCount.toString()}
                accent="violet"
              />
              <StatCard
                label={t("statAvgPrice")}
                value={formatCurrency(result.avgPrice, intlTag)}
                accent="blue"
              />
              <StatCard
                label={t("statMinPrice")}
                value={formatCurrency(result.minPrice, intlTag)}
                accent="indigo"
              />
              <StatCard
                label={t("statMaxPrice")}
                value={formatCurrency(result.maxPrice, intlTag)}
                accent="purple"
              />
            </div>

            {/* Revenue estimate */}
            <div className="rounded-xl bg-gradient-to-r from-violet-600/10 to-blue-600/10 border border-violet-500/20 p-5">
              <p className="text-xs text-[var(--text-faint)] uppercase tracking-widest font-medium mb-1">
                {t("revenueLabel")}
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] bg-clip-text text-transparent">
                {formatCurrency(result.estimatedRevenue, intlTag)}
              </p>
              <p className="text-xs text-[var(--text-faint)] mt-2">{t("revenueCaption")}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "violet" | "blue" | "indigo" | "purple";
}) {
  const isLight = useIsLightTheme();

  const border = {
    violet: "border-violet-500/20",
    blue: "border-blue-500/20",
    indigo: "border-indigo-500/20",
    purple: "border-purple-500/20",
  }[accent];

  const text = {
    violet: "text-[var(--accent)]",
    blue: "text-[var(--accent-secondary)]",
    indigo: isLight ? "text-indigo-600" : "text-indigo-300",
    purple: isLight ? "text-purple-600" : "text-purple-300",
  }[accent];

  return (
    <div
      className={`rounded-xl bg-[var(--surface-2)] border ${border} px-4 py-4`}
    >
      <p className="text-xs text-[var(--text-faint)] mb-1">{label}</p>
      <p className={`text-xl font-bold ${text}`}>{value}</p>
    </div>
  );
}
