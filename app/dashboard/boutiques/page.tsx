"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { toIntlTag, type AppLocale } from "@/lib/locale";
import { PLAN_LIMITS, type Plan } from "@/lib/plan-limits";

type BoutiqueRow = {
  id: string;
  nom: string;
  slug: string;
  est_publique: boolean;
  created_at: string;
  produitsCount: number;
};

export default function BoutiquesDetailPage() {
  const t = useTranslations("dashboard");
  const intlTag = toIntlTag(useLocale() as AppLocale);
  const [loading, setLoading] = useState(true);
  const [boutiques, setBoutiques] = useState<BoutiqueRow[]>([]);
  // Limite du plan actuel : signale les boutiques restées au-delà après un passage à un plan
  // inférieur (aucun produit n'est supprimé, seuls les ajouts sont bloqués).
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => {
    fetch("/api/plan")
      .then((res) => res.json())
      .then((json) => setPlan(json.plan ?? "free"))
      .catch(() => setPlan(null));
  }, []);
  const maxProduits = plan ? PLAN_LIMITS[plan].produitsBoutiqueMax : null;

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
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link href="/dashboard" className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors">
            {t("common.back")}
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3">{t("boutiques.title")}</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">{t("boutiques.subtitle")}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("boutiques.statBoutiques")}</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--accent)] mt-2">{boutiques.length}</p>
          </div>
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("boutiques.statProduits")}</p>
            <p className="text-2xl font-bold tabular-nums text-[var(--accent-secondary)] mt-2">{totalProduits}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          {loading ? (
            <p className="text-[var(--text-faint)] text-sm text-center py-12">{t("common.loading")}</p>
          ) : boutiques.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <p className="text-[var(--text-faint)] text-sm">{t("boutiques.empty")}</p>
              <a href="/site-builder" className="text-[var(--accent)] text-xs hover:underline">
                {t("boutiques.cta")}
              </a>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {boutiques.map((b) => (
                <Link
                  key={b.id}
                  href={`/site-builder/boutique/${b.id}`}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:opacity-80 transition-opacity"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{b.nom}</p>
                    <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
                      {new Date(b.created_at).toLocaleDateString(intlTag, { day: "numeric", month: "short", year: "numeric" })}
                      {b.est_publique && <span className="text-[var(--success)]"> · {t("boutiques.public")}</span>}
                      {maxProduits !== null && b.produitsCount > maxProduits && (
                        <span className="text-[var(--warning)]"> · {t("boutiques.auDelaLimite", { max: maxProduits })}</span>
                      )}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0 ml-4 text-[var(--text-muted)]">
                    {t("boutiques.produitsCount", { count: b.produitsCount })}
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
