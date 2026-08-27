"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type BoutiqueRow = {
  id: string;
  nom: string;
  slug: string;
  est_publique: boolean;
  created_at: string;
  produitsCount: number;
};

export default function BoutiquesDetailPage() {
  const [loading, setLoading] = useState(true);
  const [boutiques, setBoutiques] = useState<BoutiqueRow[]>([]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return; }

      // "boutiques" a aussi une policy select_public (boutiques d'AUTRES utilisateurs
      // marquées publiques) — le filtre .eq("user_id", user.id) est indispensable ici pour
      // ne lister que les miennes, la RLS seule ne le garantit pas.
      const { data: mine } = await supabase
        .from("boutiques")
        .select("id, nom, slug, est_publique, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const rows = mine ?? [];
      if (rows.length === 0) {
        setBoutiques([]);
        setLoading(false);
        return;
      }

      const ids = rows.map((b) => b.id);
      const { data: produits } = await supabase
        .from("boutique_produits")
        .select("boutique_id")
        .in("boutique_id", ids);

      const counts = new Map<string, number>();
      for (const p of produits ?? []) {
        counts.set(p.boutique_id, (counts.get(p.boutique_id) ?? 0) + 1);
      }

      setBoutiques(rows.map((b) => ({ ...b, produitsCount: counts.get(b.id) ?? 0 })));
      setLoading(false);
    });
  }, []);

  const totalProduits = boutiques.reduce((sum, b) => sum + b.produitsCount, 0);

  return (
    <div className="min-h-screen bg-[#0d0d14] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-white mt-3">Mes boutiques</h1>
          <p className="text-zinc-500 text-sm mt-1.5">Boutiques multi-produits créées via le Site Builder.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Boutiques</p>
            <p className="text-2xl font-bold tabular-nums text-violet-400 mt-2">{boutiques.length}</p>
          </div>
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">Produits catalogués</p>
            <p className="text-2xl font-bold tabular-nums text-blue-400 mt-2">{totalProduits}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
          {loading ? (
            <p className="text-zinc-600 text-sm text-center py-12">Chargement…</p>
          ) : boutiques.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-zinc-600 text-sm">Aucune boutique créée pour l&apos;instant.</p>
              <a href="/site-builder" className="text-violet-400 text-xs hover:underline">
                Créer une boutique →
              </a>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-white/[0.05]">
              {boutiques.map((b) => (
                <Link
                  key={b.id}
                  href={`/site-builder/boutique/${b.id}`}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-zinc-200 truncate">{b.nom}</p>
                    <p className="text-[11px] text-zinc-600 mt-0.5">
                      {new Date(b.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                      {b.est_publique && <span className="text-emerald-500"> · publique</span>}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 ml-4 text-zinc-300">
                    {b.produitsCount} produit{b.produitsCount > 1 ? "s" : ""}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
