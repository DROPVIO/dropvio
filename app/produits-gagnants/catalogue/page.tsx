"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { NICHES, nicheI18nKey, nicheLabel } from "@/lib/niches";
import { toIntlTag, type AppLocale } from "@/lib/locale";
import { useApiErrorMessage } from "@/lib/use-api-error";

type CatalogueRow = {
  id: string;
  nom: string;
  image: string | null;
  prixVente: number | null;
  niche: string | null;
  boutiques: { id: string; nom: string }[];
};

type CatalogueResponse = {
  products: CatalogueRow[];
  total: number;
  page: number;
  totalPages: number;
  planLimited: boolean;
};

const SEARCH_DEBOUNCE_MS = 300;
const COLONNES = "md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)]";

export default function CataloguePage() {
  // useSearchParams() doit être sous une frontière Suspense.
  return (
    <Suspense fallback={null}>
      <CatalogueListe />
    </Suspense>
  );
}

function CatalogueListe() {
  const t = useTranslations("catalogue");
  const tNiches = useTranslations("niches");
  const apiErrorMessage = useApiErrorMessage();
  const intlTag = toIntlTag(useLocale() as AppLocale);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Recherche, catégorie et page vivent dans l'URL : la flèche « ← » de la fiche et le bouton
  // retour du navigateur retrouvent la liste dans le même état.
  const search = searchParams.get("q") ?? "";
  const niche = searchParams.get("niche") ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);

  const [searchDraft, setSearchDraft] = useState(search);
  const [data, setData] = useState<CatalogueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function updateParams(next: { q?: string; niche?: string; page?: number }) {
    const params = new URLSearchParams(searchParams.toString());
    if (next.q !== undefined) {
      if (next.q) params.set("q", next.q);
      else params.delete("q");
    }
    if (next.niche !== undefined) {
      if (next.niche) params.set("niche", next.niche);
      else params.delete("niche");
    }
    if (next.page !== undefined) {
      if (next.page > 1) params.set("page", String(next.page));
      else params.delete("page");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (searchDraft.trim() === search) return;
    const timer = setTimeout(() => updateParams({ q: searchDraft.trim(), page: 1 }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (search) params.set("search", search);
    if (niche) params.set("niche", niche);

    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    fetch(`/api/catalogue?${params.toString()}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(apiErrorMessage(json, t("errorLoad")));
          setData(null);
          return;
        }
        setError(null);
        setData(json as CatalogueResponse);
      })
      .catch(() => {
        if (!cancelled) setError(apiErrorMessage({ code: "network" }));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, niche, page]);

  const labelNiche = (id: string | null) => {
    if (!id) return t("noCategory");
    const key = nicheI18nKey(id, "label");
    return key ? tNiches(key) : nicheLabel(id) ?? id;
  };

  const formatPrix = (value: number | null) =>
    value === null ? "—" : new Intl.NumberFormat(intlTag, { style: "currency", currency: "EUR" }).format(value);

  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const retour = searchParams.toString();

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] px-8 py-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
            <p className="mt-1.5 text-sm text-[var(--text-faint)]">{data ? t("count", { count: total }) : t("loadingShort")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
              className="w-64 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 py-2 text-[13.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <select
              value={niche}
              onChange={(e) => updateParams({ niche: e.target.value, page: 1 })}
              aria-label={t("filterCategory")}
              className="rounded-lg border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 py-2 text-[13.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">{t("allCategories")}</option>
              {NICHES.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.emoji} {labelNiche(n.id)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <div className={`hidden gap-4 border-b border-[var(--border)] px-6 py-3 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)] md:grid ${COLONNES}`}>
            <span>{t("colProduit")}</span>
            <span>{t("colPrix")}</span>
            <span>{t("colCategorie")}</span>
            <span>{t("colBoutique")}</span>
            <span>{t("colStock")}</span>
          </div>

          {loading && !data ? (
            <p className="py-16 text-center text-sm text-[var(--text-faint)]">{t("loading")}</p>
          ) : error ? (
            <div className="m-6 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger-text)]">{error}</div>
          ) : !data || data.products.length === 0 ? (
            <p className="py-16 text-center text-sm text-[var(--text-faint)]">{search || niche ? t("emptyFiltered") : t("empty")}</p>
          ) : (
            <div className={`flex flex-col divide-y divide-[var(--border)] transition-opacity ${loading ? "opacity-60" : ""}`}>
              {data.products.map((p) => (
                <Link
                  key={p.id}
                  href={`/produits-gagnants/catalogue/${encodeURIComponent(p.id)}${retour ? `?retour=${encodeURIComponent(retour)}` : ""}`}
                  className={`grid grid-cols-1 items-center gap-2 px-6 py-3 transition-colors hover:bg-[var(--surface-2)] md:gap-4 ${COLONNES}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-10 w-10 shrink-0 rounded-lg bg-[var(--surface-2)] object-cover" />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-[var(--surface-2)]" />
                    )}
                    <span className="truncate text-sm text-[var(--text-primary)]">{p.nom}</span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatPrix(p.prixVente)}</span>
                  <span className="truncate text-sm text-[var(--text-muted)]">{labelNiche(p.niche)}</span>
                  <span className={`truncate text-sm ${p.boutiques.length ? "text-[var(--text-muted)]" : "text-[var(--text-faint)]"}`}>
                    {p.boutiques.length ? p.boutiques.map((b) => b.nom).join(", ") : t("noBoutique")}
                  </span>
                  <span className="text-sm text-[var(--text-faint)]" title={t("stockMissingHint")}>{t("stockMissing")}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {data && data.planLimited && <p className="text-xs text-[var(--text-faint)]">{t("planLimited")}</p>}

        {data && totalPages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => updateParams({ page: page - 1 })}
              disabled={page <= 1 || loading}
              className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("prev")}
            </button>
            <span className="text-xs tabular-nums text-[var(--text-faint)]">{t("pageOf", { page, totalPages })}</span>
            <button
              onClick={() => updateParams({ page: page + 1 })}
              disabled={page >= totalPages || loading}
              className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
