"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type AuditRow = {
  id: string;
  url_ou_nom_site: string;
  score_total: number;
  created_at: string;
};

// Valeurs retournées comme des var() CSS (pas des hex figés) : valide dans un style={{ color }}
// React sur un élément HTML classique, suit le thème clair/sombre automatiquement.
function scoreColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}

export default function AuditsDetailPage() {
  const [loading, setLoading] = useState(true);
  const [audits, setAudits] = useState<AuditRow[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("audits_realises")
        .select("id, url_ou_nom_site, score_total, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      setAudits((data as AuditRow[]) ?? []);
      setLoading(false);
    });
  }, []);

  const scoreMoyen = audits.length > 0
    ? Math.round(audits.reduce((sum, a) => sum + a.score_total, 0) / audits.length)
    : null;

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3">Audits IA</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">Historique complet de tes audits de sites.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Audits réalisés</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--accent)] mt-2">{audits.length}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">Score moyen</p>
            <p className="text-2xl font-bold tabular-nums mt-2" style={{ color: scoreMoyen !== null ? scoreColor(scoreMoyen) : "var(--text-faint)" }}>
              {scoreMoyen !== null ? `${scoreMoyen}/100` : "—"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
          {loading ? (
            <p className="text-[var(--text-faint)] text-sm text-center py-12">Chargement…</p>
          ) : audits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-[var(--text-faint)] text-sm">Aucun audit réalisé pour l&apos;instant.</p>
              <a href="/audit" className="text-[var(--accent)] text-xs hover:underline">
                Lancer un audit IA →
              </a>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {audits.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{a.url_ou_nom_site}</p>
                    <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                      {new Date(a.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 ml-4" style={{ color: scoreColor(a.score_total) }}>
                    {a.score_total}/100
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
