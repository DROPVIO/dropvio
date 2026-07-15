"use client";

import { useState } from "react";

interface SpyResult {
  productCount: number;
  avgPrice: number;
  minPrice: number;
  maxPrice: number;
  estimatedRevenue: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function SpyPage() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SpyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalyze() {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(
        `/api/spy?url=${encodeURIComponent(url.trim())}`
      );
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Une erreur est survenue");
      } else {
        setResult(json);
      }
    } catch {
      setError("Impossible de contacter l'API");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleAnalyze();
  }

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white font-sans px-4 py-16">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium tracking-widest uppercase">
            Intelligence concurrentielle
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent mb-3">
            Spy Tool
          </h1>
          <p className="text-zinc-400 text-base">
            Analysez n&apos;importe quelle boutique Shopify en quelques secondes
          </p>
        </div>

        {/* Input */}
        <div className="rounded-2xl bg-[#13131f] border border-white/5 p-6 mb-6 shadow-xl shadow-black/40">
          <label className="block text-sm font-medium text-zinc-300 mb-3">
            URL de la boutique concurrente
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ex: boutique-exemple.com"
              className="flex-1 bg-[#0d0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
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
                  Analyse…
                </span>
              ) : (
                "Analyser"
              )}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 mb-6">
            {error}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="rounded-2xl bg-[#13131f] border border-white/5 p-6 shadow-xl shadow-black/40">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-widest mb-6">
              Résultats
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <StatCard
                label="Produits"
                value={result.productCount.toString()}
                accent="violet"
              />
              <StatCard
                label="Prix moyen"
                value={formatCurrency(result.avgPrice)}
                accent="blue"
              />
              <StatCard
                label="Prix minimum"
                value={formatCurrency(result.minPrice)}
                accent="indigo"
              />
              <StatCard
                label="Prix maximum"
                value={formatCurrency(result.maxPrice)}
                accent="purple"
              />
            </div>

            {/* Revenue estimate */}
            <div className="rounded-xl bg-gradient-to-r from-violet-600/10 to-blue-600/10 border border-violet-500/20 p-5">
              <p className="text-xs text-zinc-500 uppercase tracking-widest font-medium mb-1">
                CA mensuel estimé
              </p>
              <p className="text-3xl font-bold bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
                {formatCurrency(result.estimatedRevenue)}
              </p>
              <p className="text-xs text-zinc-600 mt-2">
                5 000 visites × 2,5% conversion × prix moyen
              </p>
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
  const border = {
    violet: "border-violet-500/20",
    blue: "border-blue-500/20",
    indigo: "border-indigo-500/20",
    purple: "border-purple-500/20",
  }[accent];

  const text = {
    violet: "text-violet-300",
    blue: "text-blue-300",
    indigo: "text-indigo-300",
    purple: "text-purple-300",
  }[accent];

  return (
    <div
      className={`rounded-xl bg-white/[0.03] border ${border} px-4 py-4`}
    >
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${text}`}>{value}</p>
    </div>
  );
}
