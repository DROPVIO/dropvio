"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getMargeColor } from "@/lib/calcul-marge";

type SimulationRow = {
  id: string;
  nom: string;
  resultats: { margeNette?: number; margePct?: number } | null;
  created_at: string;
};

export default function MargesDetailPage() {
  const [loading, setLoading] = useState(true);
  const [simulations, setSimulations] = useState<SimulationRow[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      const { data } = await supabase
        .from("simulations_marge")
        .select("id, nom, resultats, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(200);
      setSimulations((data as SimulationRow[]) ?? []);
      setLoading(false);
    });
  }, []);

  const pcts = simulations.map((s) => s.resultats?.margePct).filter((v): v is number => typeof v === "number");
  const margeMoyenne = pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null;

  return (
    <div className="min-h-screen bg-[#0d0d14] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white mt-3">Calculateur de marge</h1>
          <p className="text-zinc-500 text-sm mt-1.5">Historique complet de tes simulations sauvegardées.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Simulations</p>
            <p className="text-2xl font-bold tabular-nums text-violet-400 mt-2">{simulations.length}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Marge moyenne</p>
            <p className="text-2xl font-bold tabular-nums text-blue-400 mt-2">
              {margeMoyenne !== null ? `${margeMoyenne.toFixed(1)}%` : "—"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          {loading ? (
            <p className="text-zinc-600 text-sm text-center py-12">Chargement…</p>
          ) : simulations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-zinc-600 text-sm">Aucune simulation sauvegardée pour l&apos;instant.</p>
              <a href="/tools/calculateur-marge" className="text-violet-400 text-xs hover:underline">
                Ouvrir le calculateur de marge →
              </a>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-white/[0.05]">
              {simulations.map((s) => {
                const margeNette = s.resultats?.margeNette;
                const margePct = s.resultats?.margePct;
                return (
                  <div key={s.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{s.nom}</p>
                      <p className="text-[11px] text-zinc-600 mt-0.5">
                        {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>
                    {typeof margeNette === "number" && typeof margePct === "number" ? (
                      <span
                        className="text-sm font-semibold tabular-nums shrink-0 ml-4"
                        style={{ color: getMargeColor(margePct) }}
                      >
                        {margeNette >= 0 ? "+" : ""}{margeNette.toFixed(2)} € · {margePct.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-sm text-zinc-600 shrink-0 ml-4">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
