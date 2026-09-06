"use client";

import { useState, useRef, useCallback } from "react";
import { AUDIT_HTML_MAX_CHARS } from "@/lib/audit-config";

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  nom: string;
  score: number;
  max: number;
  points_forts: string[];
  points_faibles: string[];
  corrections_specifiques: string[];
};

type AuditResult = {
  score_global: number;
  score_designer: string;
  resume_executif: string;
  categories: Category[];
};

// ─── Score circle ─────────────────────────────────────────────────────────────

// Valeurs retournées comme des var() CSS (pas des hex figés) — valides à la fois dans un
// style={{ color }} et comme attribut de présentation SVG (stroke=...), suit le thème
// clair/sombre automatiquement.
function ScoreCircle({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const color = score >= 75 ? "var(--success)" : score >= 50 ? "var(--warning)" : "var(--danger)";
  const label = score >= 75 ? "Bon" : score >= 50 ? "Passable" : "Faible";

  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: 152, height: 152 }}>
      <svg width="152" height="152" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="76" cy="76" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <circle
          cx="76" cy="76" r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute flex flex-col items-center gap-0.5">
        <span className="text-4xl font-bold text-[var(--text-primary)] tabular-nums">{score}</span>
        <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">/ 100</span>
        <span className="text-[11px] font-semibold mt-0.5" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}

// ─── Category card ────────────────────────────────────────────────────────────

function CategoryCard({ cat }: { cat: Category }) {
  const pct = cat.score / cat.max;
  const barColor = pct >= 0.75 ? "var(--success)" : pct >= 0.5 ? "var(--warning)" : "var(--danger)";

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{cat.nom}</p>
        <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: barColor }}>
          {cat.score} / {cat.max}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 rounded-full bg-[var(--surface-3)] overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct * 100}%`, background: barColor, transition: "width 0.6s ease" }}
        />
      </div>

      {/* Points forts */}
      {cat.points_forts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {cat.points_forts.map((p, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--success)] leading-relaxed">
              <span className="shrink-0 mt-px">✓</span>
              <span>{p}</span>
            </div>
          ))}
        </div>
      )}

      {/* Points faibles */}
      {cat.points_faibles.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {cat.points_faibles.map((p, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--danger)] leading-relaxed">
              <span className="shrink-0 mt-px">✕</span>
              <span>{p}</span>
            </div>
          ))}
        </div>
      )}

      {/* Corrections */}
      {cat.corrections_specifiques.length > 0 && (
        <div className="border-t border-[var(--border)] pt-3 flex flex-col gap-1.5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-faint)] mb-0.5">
            Corrections
          </p>
          {cat.corrections_specifiques.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--warning)] leading-relaxed">
              <span className="shrink-0 mt-px">→</span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [html,        setHtml]        = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [result,      setResult]      = useState<AuditResult | null>(null);
  const [htmlLoading, setHtmlLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [urlInput,   setUrlInput]   = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError,   setUrlError]   = useState<string | null>(null);

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setHtml((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }, []);

  async function handleFetchUrl() {
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setUrlError(null);
    try {
      const res = await fetch("/api/audit-site/from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUrlError(data.error ?? "Impossible de récupérer cette page.");
        return;
      }
      setHtml(data.html);
      setResult(null);
      setError(null);
    } catch {
      setUrlError("Impossible de contacter le serveur.");
    } finally {
      setUrlLoading(false);
    }
  }

  async function runAudit() {
    if (!html.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data as AuditResult);
        setTimeout(() => {
          document.getElementById("audit-results")?.scrollIntoView({ behavior: "smooth" });
        }, 100);
      }
    } catch {
      setError("Erreur réseau. Vérifie ta connexion et réessaie.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadCorrectedHtml() {
    if (!result || !html) return;
    setHtmlLoading(true);
    try {
      const res = await fetch("/api/audit-site/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html, categories: result.categories }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Erreur lors de la génération du HTML.");
        return;
      }
      const correctedHtml = await res.text();
      const blob = new Blob([correctedHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "landing-page-corrigee.html";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Erreur lors de la génération du HTML corrigé.");
    } finally {
      setHtmlLoading(false);
    }
  }

  const charCount = html.length;
  const willTruncate = charCount > AUDIT_HTML_MAX_CHARS;

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">🔍 Audit de landing page IA</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">
            Analyse basée sur Nielsen Norman Group, Unbounce et McKinsey — score sur 100 en 9 critères.
          </p>
        </div>

        {/* ── Input ───────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-[var(--text-muted)]">HTML de ta landing page</p>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".html,.htm"
                ref={fileRef}
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 rounded-lg bg-[var(--surface-3)] border border-[var(--border-strong)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition"
              >
                📁 Uploader .html
              </button>
              {html && (
                <button
                  onClick={() => { setHtml(""); setResult(null); setError(null); }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>

          {/* ── Analyser depuis une URL ─────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-[var(--text-muted)]">
              🔗 Analyser depuis une URL{" "}
              <span className="text-[var(--text-faint)] font-normal">(optionnel)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setUrlError(null); }}
                placeholder="https://ma-boutique.com"
                className="flex-1 bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition"
              />
              <button
                onClick={handleFetchUrl}
                disabled={!urlInput.trim() || urlLoading}
                className="px-4 py-3 rounded-xl bg-violet-600/20 border border-violet-500/30 text-[var(--accent)] text-sm font-semibold hover:bg-violet-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {urlLoading ? "…" : "Récupérer"}
              </button>
            </div>
            {urlError && <p className="text-xs text-[var(--danger)]">{urlError}</p>}
          </div>

          <div className="border-t border-[var(--border)]" />

          <textarea
            value={html}
            onChange={(e) => setHtml(e.target.value)}
            placeholder={`<!DOCTYPE html>\n<html>\n  <body>\n    <!-- Colle ici le HTML complet de ta landing page -->\n  </body>\n</html>`}
            className="w-full bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-xl px-4 py-3.5 text-[12px] text-[var(--text-muted)] placeholder-[var(--text-faint)] font-mono focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/40 transition resize-none"
            rows={12}
          />

          {charCount > 0 && (
            <p className="text-[11px] text-[var(--text-faint)]">
              {charCount.toLocaleString("fr-FR")} caractères
              {willTruncate && (
                <span className="text-[var(--warning)] ml-2">· sera tronqué à {AUDIT_HTML_MAX_CHARS.toLocaleString("fr-FR")} chars</span>
              )}
            </p>
          )}

          <button
            onClick={runAudit}
            disabled={loading || !html.trim()}
            className="w-full py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_24px_rgba(124,58,237,0.2)]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyse IA en cours…
              </span>
            ) : "Analyser avec l'IA →"}
          </button>
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error && (
          <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/[0.06] px-4 py-3 text-sm text-[var(--danger)] flex items-start gap-2">
            <span className="shrink-0">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Results ─────────────────────────────────────────────────── */}
        {result && (
          <div id="audit-results" className="flex flex-col gap-6">

            {/* Score global */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)] mb-5">
                Score global
              </p>
              <div className="flex flex-col sm:flex-row items-start gap-8">
                <ScoreCircle score={result.score_global} />
                <div className="flex flex-col gap-4 flex-1 min-w-0">
                  <p className="text-[13px] text-[var(--text-muted)] leading-relaxed">
                    {result.resume_executif}
                  </p>
                  {/* Designer quote */}
                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] px-4 py-4">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--accent)] mb-2">
                      Avis designer
                    </p>
                    <p className="text-[13px] text-[var(--text-muted)] leading-relaxed italic">
                      &ldquo;{result.score_designer}&rdquo;
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Category cards */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)] mb-4">
                Analyse détaillée — 9 critères
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {result.categories.map((cat) => (
                  <CategoryCard key={cat.id} cat={cat} />
                ))}
              </div>
            </div>

            {/* Download HTML */}
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">HTML corrigé</p>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                  Notre IA applique toutes les corrections et génère un fichier prêt à déployer (~30 s).
                </p>
              </div>
              <button
                onClick={downloadCorrectedHtml}
                disabled={htmlLoading}
                className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {htmlLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Génération…
                  </>
                ) : (
                  <>⬇ Télécharger le HTML corrigé</>
                )}
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
