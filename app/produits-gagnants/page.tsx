"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { slugify } from "@/lib/slugify";
import ProduitsSuggeres from "@/components/ProduitsSuggeres";
import { NICHES as NICHES_CATALOGUE, nicheI18nKey, nicheLabel } from "@/lib/niches";

// L'entrée "all" est propre à cette page ; les autres viennent de lib/niches, dont le
// libellé/description français ne sert que de repli — l'affichage passe par le namespace
// `niches` (voir nicheI18nKey).
function useNiches(t: (key: string) => string, tNiches: (key: string) => string) {
  return [
    { id: "all", label: t("nicheAll"), emoji: "🗂️", desc: t("nicheAllDesc") },
    ...NICHES_CATALOGUE.map((n) => {
      const labelKey = nicheI18nKey(n.id, "label");
      const descKey = nicheI18nKey(n.id, "desc");
      return {
        ...n,
        label: labelKey ? tNiches(labelKey) : n.label,
        desc: descKey ? tNiches(descKey) : n.desc,
      };
    }),
  ];
}

type Produit = {
  id: string;
  nom: string;
  image: string;
  prixFournisseur: number;
  prixVente: number;
  prixOriginal?: number;
  marge: number;
  commandes: number;
  note: number | null;
  commission: string;
  lienAliExpress: string;
  niche: string;
};

// Plage par défaut du "sweet spot" : ni invendable (trop peu de commandes), ni déjà saturé
const SWEET_SPOT_DEFAUT = { min: 500, max: 5000 };

// Envoyé explicitement (plutôt que de changer DEFAULT_LIMIT dans la route, partagée avec
// tout futur appelant) pour que ce réglage reste local à cette page — vérifié : /api/
// aliexpress/products n'est aujourd'hui appelée que d'ici, et le total/totalPages renvoyés
// par la route s'adaptent déjà à n'importe quel limit reçu, aucun changement serveur requis.
const PRODUITS_PAR_PAGE = 40;

export default function ProduitsGagnants() {
  const t = useTranslations("dashboard.produits");
  const tNiches = useTranslations("niches");
  const NICHES = useNiches(t, tNiches);
  const [nicheActive, setNicheActive] = useState<string>("all");
  const isHalloweenNiche = nicheActive === "halloween";
  const [tiroirOpen, setTiroirOpen] = useState(false);
  const [filtresPrix, setFiltresPrix] = useState<string>("tous");
  const [filtreMarge, setFiltreMarge] = useState<number>(0);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Bloc 1 — filtres avancés
  const [commandesMin, setCommandesMin] = useState<string>("");
  const [noteMin, setNoteMin] = useState<number>(0);
  const [sweetSpotActif, setSweetSpotActif] = useState(false);
  const [sweetMin, setSweetMin] = useState<number>(SWEET_SPOT_DEFAUT.min);
  const [sweetMax, setSweetMax] = useState<number>(SWEET_SPOT_DEFAUT.max);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalProduits, setTotalProduits] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const resultatsRef = useRef<HTMLDivElement>(null);

  // Annule la requête précédente à chaque nouvel appel — sans ça, des clics rapides sur
  // "Suivant"/"Précédent" (page 1→2→3) peuvent voir leurs réponses arriver hors-ordre et
  // afficher une grille qui ne correspond pas au numéro de page affiché.
  const chargementEnCoursRef = useRef<AbortController | null>(null);

  const chargerProduits = useCallback(async () => {
    chargementEnCoursRef.current?.abort();
    const controller = new AbortController();
    chargementEnCoursRef.current = controller;

    setLoading(true);
    setErreur(null);

    try {
      const params = new URLSearchParams();
      if (nicheActive !== "all") params.set("niche", nicheActive);
      if (filtresPrix === "0-20") params.set("priceMax", "20");
      else if (filtresPrix === "20-50") { params.set("priceMin", "20"); params.set("priceMax", "50"); }
      else if (filtresPrix === "50+") params.set("priceMin", "50");

      const baseMin = parseInt(commandesMin) || 0;
      const effectiveMin = sweetSpotActif ? Math.max(baseMin, sweetMin) : baseMin;
      if (effectiveMin > 0) params.set("commandesMin", String(effectiveMin));
      if (sweetSpotActif) params.set("commandesMax", String(sweetMax));
      if (noteMin > 0) params.set("noteMin", String(noteMin));
      if (filtreMarge > 0) params.set("margeMin", String(filtreMarge));
      params.set("page", String(page));
      params.set("limit", String(PRODUITS_PAR_PAGE));

      const url = `/api/aliexpress/products?${params.toString()}`;
      const res = await fetch(url, { signal: controller.signal });
      const data = await res.json();

      if (data.error) {
        setErreur(data.error);
        setProduits([]);
        setTotalProduits(0);
        setTotalPages(1);
      } else {
        setProduits(data.products || []);
        setTotalProduits(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setErreur(t("errorLoad"));
    } finally {
      if (chargementEnCoursRef.current === controller) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nicheActive, filtresPrix, filtreMarge, commandesMin, noteMin, sweetSpotActif, sweetMin, sweetMax, page]);

  useEffect(() => {
    // Défère l'appel (donc ses setState internes) hors du corps synchrone de
    // l'effet — évite le rendu en cascade tout en gardant le déclenchement
    // immédiat au changement de dépendances.
    void Promise.resolve().then(() => chargerProduits());
  }, [chargerProduits]);

  function allerPage(nouvellePage: number) {
    setPage(nouvellePage);
    resultatsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Bloc 2 — score de croissance basé sur l'historique des snapshots quotidiens
  const [croissance, setCroissance] = useState<Record<string, number>>({});

  useEffect(() => {
    if (produits.length === 0) return;

    let annule = false;
    const supabase = createSupabaseBrowserClient();

    supabase
      .from("snapshots_produits")
      .select("product_id, volume_commandes, date")
      .in("product_id", produits.map((p) => p.id))
      .order("date", { ascending: true })
      .then(({ data, error }) => {
        if (annule || error || !data) return;

        const parProduit: Record<string, { volume_commandes: number; date: string }[]> = {};
        for (const row of data) {
          (parProduit[row.product_id] ??= []).push(row);
        }

        const resultat: Record<string, number> = {};
        for (const [id, points] of Object.entries(parProduit)) {
          if (points.length < 2) continue;
          const premier = points[0].volume_commandes;
          const dernier = points[points.length - 1].volume_commandes;
          if (!premier) continue;
          resultat[id] = ((dernier - premier) / premier) * 100;
        }
        setCroissance(resultat);
      });

    return () => { annule = true; };
  }, [produits]);

  const nicheSelectionnee = NICHES.find(n => n.id === nicheActive);

  // Bloc 4 — Ajouter à une boutique
  const [ajouterBoutiqueProduit, setAjouterBoutiqueProduit] = useState<Produit | null>(null);

  // Bloc 5 — Alternatives fiables
  const [alternativesProduit, setAlternativesProduit] = useState<Produit | null>(null);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-['Inter',-apple-system,sans-serif]">

      {/* Décoration toile d'araignée — coin supérieur droit de la FENÊTRE (position: fixed,
          jamais absolute : ancrée au viewport, pas à un conteneur interne). Placée en tout
          premier enfant de la racine (qui n'a ni overflow-hidden ni transform/filter — ces
          propriétés créeraient un nouveau containing block et casseraient l'ancrage viewport
          de fixed) pour ne dépendre d'aucun conteneur parent. z-50 explicite : ni le header ni
          les filtres ci-dessous ne posent de z-index, donc rien ne peut passer devant sans
          valeur supérieure explicite (les modals de cette page utilisent z-[100], au-dessus).
          pointer-events-none : purement décoratif, ne doit intercepter aucun clic. */}
      {isHalloweenNiche && (
        <svg
          aria-hidden="true"
          className="pointer-events-none fixed top-0 right-0 z-50 opacity-25"
          width="160"
          height="160"
          viewBox="0 0 160 160"
          fill="none"
          stroke="#e5e5e5"
          strokeWidth="1"
        >
          <path d="M160,0 L10,0 M160,0 L17.4,46.4 M160,0 L38.6,88.2 M160,0 L71.8,121.4 M160,0 L113.6,142.6 M160,0 L160,150" />
          <path d="M115,0 L117.2,13.9 L123.6,26.5 L133.5,36.4 L146.1,42.8 L160,45" />
          <path d="M70,0 L74.4,27.8 L87.2,52.9 L107.1,72.8 L132.2,85.6 L160,90" />
          <path d="M30,0 L36.4,40.2 L54.8,76.4 L83.6,105.2 L119.8,123.6 L160,130" />
        </svg>
      )}

      {/* Header */}
      <div className="bg-[var(--bg-sunken)] border-b border-[var(--border-strong)] px-8 py-6">
        <div className="max-w-[1200px] mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-[28px] font-bold m-0 text-[var(--text-primary)]">{t("title")}</h1>
            <p className="text-[var(--text-faint)] mt-1.5 mb-0 text-sm">{t("subtitle")}</p>
            <div className="bg-amber-500/10 border border-amber-500/25 text-[var(--warning)] rounded-lg px-3 py-2.5 text-[12.5px] mt-3">
              {t("warning")}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-6 py-8">

        {/* Bouton choisir niche */}
        <div className="mb-6">
          <button
            onClick={() => setTiroirOpen(!tiroirOpen)}
            className={`px-6 py-3.5 rounded-xl text-[15px] font-semibold cursor-pointer flex items-center gap-2.5 transition-all border ${
              tiroirOpen ? "bg-violet-600 border-violet-600 text-white" : "bg-[var(--surface)] border-[var(--border-strong)] text-[var(--text-primary)]"
            }`}
          >
            <span>🎯</span>
            {nicheSelectionnee
              ? t("nicheButton", { emoji: nicheSelectionnee.emoji, label: nicheSelectionnee.label })
              : t("nicheChoose")}
            <span className="ml-auto text-xs opacity-70">{tiroirOpen ? "▲" : "▼"}</span>
          </button>

          {/* Tiroir niches */}
          {tiroirOpen && (
            <div className="mt-2 bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl p-6 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}>
              {NICHES.map(niche => (
                <button
                  key={niche.id}
                  onClick={() => { setNicheActive(niche.id); setTiroirOpen(false); setPage(1); }}
                  className={`px-4 py-3 rounded-[10px] text-[13px] font-medium cursor-pointer text-left transition-all border ${
                    nicheActive === niche.id
                      ? niche.id === "halloween"
                        ? "bg-[#e07b2e] border-[#e07b2e] text-white shadow-[0_0_16px_rgba(224,123,46,0.45)]"
                        : "bg-violet-600 border-violet-600 text-white"
                      : "bg-[var(--bg-sunken)] border-[var(--border-strong)] text-[var(--text-primary)]"
                  }`}
                >
                  <div className="text-lg mb-1">{niche.emoji}</div>
                  <div className="font-semibold">{niche.label}</div>
                  <div className="text-[11px] text-[var(--text-faint)] mt-0.5">{niche.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filtres */}
        <div className="flex gap-3 mb-7 flex-wrap items-center">
          <span className="text-[13px] text-[var(--text-faint)]">{t("filters")}</span>

          {[
            { label: t("priceAll"), val: "tous" },
            { label: t("price020"), val: "0-20" },
            { label: t("price2050"), val: "20-50" },
            { label: t("price50"), val: "50+" },
          ].map(f => (
            <button
              key={f.val}
              onClick={() => { setFiltresPrix(f.val); setPage(1); }}
              className={`px-3.5 py-[7px] rounded-lg text-xs font-medium cursor-pointer border ${
                filtresPrix === f.val
                  ? isHalloweenNiche
                    ? "bg-[#e07b2e] border-[#e07b2e] text-white"
                    : "bg-violet-600 border-violet-600 text-white"
                  : "bg-[var(--surface)] border-[var(--border-strong)] text-[var(--text-primary)]"
              }`}
            >
              {f.label}
            </button>
          ))}

          {[
            { label: t("margeAll"), val: 0 },
            { label: t("marge50"), val: 50 },
            { label: t("marge70"), val: 70 },
          ].map(f => (
            <button
              key={f.val}
              onClick={() => { setFiltreMarge(f.val); setPage(1); }}
              className={`px-3.5 py-[7px] rounded-lg text-xs font-medium cursor-pointer border ${
                filtreMarge === f.val ? "bg-emerald-600 border-emerald-600 text-white" : "bg-[var(--surface)] border-[var(--border-strong)] text-[var(--text-primary)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Filtres avancés */}
        <div className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-[14px] p-5 mb-7 grid gap-4.5">
          <div className="text-xs font-semibold text-[var(--text-faint)] uppercase tracking-[0.06em]">
            {t("advanced")}
          </div>

          <div className="grid grid-cols-2 gap-5">
            {/* Commandes minimum */}
            <div>
              <label className="block text-[12.5px] text-[var(--text-muted)] mb-2">
                {t("ordersMinLabel")}
              </label>
              <input
                type="number"
                min={0}
                placeholder={t("ordersMinPlaceholder")}
                value={commandesMin}
                onChange={(e) => { setCommandesMin(e.target.value); setPage(1); }}
                className="w-full box-border bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-lg px-3 py-2.5 text-[13.5px] text-[var(--text-primary)] outline-none"
              />
            </div>

            {/* Note minimum */}
            <div>
              <label className="flex justify-between text-[12.5px] text-[var(--text-muted)] mb-2">
                <span>{t("noteMinLabel")}</span>
                <span className="text-[var(--warning)] font-semibold">
                  {noteMin > 0 ? `⭐ ${noteMin.toFixed(1)}+` : t("noteAll")}
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={noteMin}
                onChange={(e) => { setNoteMin(parseFloat(e.target.value)); setPage(1); }}
                className="w-full accent-[var(--warning)]"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6 items-center">
            {/* Sweet spot */}
            <label className="flex items-center gap-2.5 text-[13px] text-[var(--text-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={sweetSpotActif}
                onChange={(e) => { setSweetSpotActif(e.target.checked); setPage(1); }}
                className="w-4 h-4 accent-[var(--success)]"
              />
              {t("sweetSpot")}
            </label>
          </div>

          {sweetSpotActif && (
            <div className="bg-[var(--bg-sunken)] rounded-[10px] p-4 border border-emerald-500/20 flex items-center gap-4 flex-wrap">
              <span className="text-xs text-[var(--text-faint)]">{t("sweetSpotHint")}</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  value={sweetMin}
                  onChange={(e) => { setSweetMin(parseInt(e.target.value) || 0); setPage(1); }}
                  className="w-[90px] bg-[var(--bg)] border border-[var(--border-strong)] rounded-[7px] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
                />
                <span className="text-[var(--text-faint)] text-xs">{t("and")}</span>
                <input
                  type="number"
                  min={0}
                  value={sweetMax}
                  onChange={(e) => { setSweetMax(parseInt(e.target.value) || 0); setPage(1); }}
                  className="w-[90px] bg-[var(--bg)] border border-[var(--border-strong)] rounded-[7px] px-2.5 py-1.5 text-[13px] text-[var(--text-primary)] outline-none"
                />
                <span className="text-[var(--text-faint)] text-xs">{t("ordersUnit")}</span>
              </div>
              <button
                onClick={() => { setSweetMin(SWEET_SPOT_DEFAUT.min); setSweetMax(SWEET_SPOT_DEFAUT.max); setPage(1); }}
                className="ml-auto bg-transparent border border-[var(--border-strong)] text-[var(--text-faint)] px-3 py-1.5 rounded-[7px] text-[11.5px] cursor-pointer"
              >
                {t("reset")}
              </button>
            </div>
          )}
        </div>

        {/* Résultats */}
        <div ref={resultatsRef}>
        {loading ? (
          <div className="text-center py-20">
            <div className="text-[32px] mb-4">⏳</div>
            <div className="text-[var(--text-faint)] text-[15px]">{t("loadingProducts")}</div>
          </div>
        ) : erreur ? (
          <div className="bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-xl p-8 text-center text-[var(--danger)]">
            <div className="text-2xl mb-2">⚠️</div>
            <div className="text-sm">{erreur}</div>
            <button
              onClick={chargerProduits}
              className="mt-4 bg-violet-600 text-white border-none px-5 py-2.5 rounded-lg cursor-pointer text-[13px] font-semibold"
            >
              {t("retry")}
            </button>
          </div>
        ) : (
          <>
            <div className="text-[13px] text-[var(--text-faint)] mb-4">
              {t("countFound", { count: totalProduits })}
              {nicheSelectionnee && nicheActive !== "all" &&
                t("inNiche", { emoji: nicheSelectionnee.emoji, label: nicheSelectionnee.label })}
              {totalPages > 1 && t("pageSuffix", { page, total: totalPages })}
            </div>

            {produits.length === 0 ? (
              <div className="text-center py-16 text-[var(--text-faint)] text-[15px]">
                {t("emptyFilters")}
              </div>
            ) : (
              <>
                <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" }}>
                  {produits.map(p => (
                    <CarteProduit
                      key={p.id}
                      produit={p}
                      t={t}
                      croissancePct={croissance[p.id]}
                      isHalloweenNiche={isHalloweenNiche}
                      onAjouterBoutique={() => setAjouterBoutiqueProduit(p)}
                      onVoirAlternatives={() => setAlternativesProduit(p)}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex justify-center items-center gap-2 mt-8">
                    <button
                      onClick={() => allerPage(page - 1)}
                      disabled={page <= 1 || loading}
                      className={`bg-[var(--surface)] border border-[var(--border-strong)] px-4 py-2.5 rounded-lg text-[13px] font-semibold ${
                        page <= 1 ? "text-[var(--text-faint)] cursor-not-allowed opacity-50" : "text-[var(--text-primary)] cursor-pointer"
                      }`}
                    >
                      {t("prev")}
                    </button>

                    <span className="text-[13px] text-[var(--text-faint)] px-2.5">
                      {t("pageLabel", { page, total: totalPages })}
                    </span>

                    <button
                      onClick={() => allerPage(page + 1)}
                      disabled={page >= totalPages || loading}
                      className={`bg-[var(--surface)] border border-[var(--border-strong)] px-4 py-2.5 rounded-lg text-[13px] font-semibold ${
                        page >= totalPages ? "text-[var(--text-faint)] cursor-not-allowed opacity-50" : "text-[var(--text-primary)] cursor-pointer"
                      }`}
                    >
                      {t("next")}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        </div>
      </div>

      {ajouterBoutiqueProduit && (
        <AjouterBoutiqueModal produit={ajouterBoutiqueProduit} onClose={() => setAjouterBoutiqueProduit(null)} />
      )}
      {alternativesProduit && (
        <AlternativesModal produit={alternativesProduit} onClose={() => setAlternativesProduit(null)} />
      )}
    </div>
  );
}

/** Traducteur du namespace dashboard.produits, passé en prop aux sous-composants de ce
 *  fichier plutôt que ré-obtenu par hook dans chacun. */
type ProduitsT = ReturnType<typeof useTranslations<"dashboard.produits">>;

function CarteProduit({
  produit,
  t,
  croissancePct,
  isHalloweenNiche,
  onAjouterBoutique,
  onVoirAlternatives,
}: {
  produit: Produit;
  t: ProduitsT;
  croissancePct?: number;
  isHalloweenNiche?: boolean;
  onAjouterBoutique: () => void;
  onVoirAlternatives: () => void;
}) {
  const hasPrixOriginal =
    produit.prixOriginal !== undefined && produit.prixOriginal > produit.prixFournisseur;

  return (
    <div
      className={`bg-[var(--surface)] border border-[var(--border-strong)] rounded-[14px] overflow-hidden transition-all duration-200 hover:-translate-y-0.5 ${
        isHalloweenNiche ? "hover:border-[#e07b2e]" : "hover:border-violet-500"
      }`}
    >
      {/* Image */}
      <div className="h-[150px] overflow-hidden bg-[var(--bg-sunken)] relative">
        {produit.image ? (
          <Image
            src={produit.image}
            alt={produit.nom}
            fill
            sizes="(max-width: 640px) 45vw, 220px"
            className="object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-5xl">🛍️</div>
        )}
        {produit.commission && (
          <span className={`absolute top-2.5 right-2.5 text-white text-[11px] font-bold px-2 py-[3px] rounded-full ${isHalloweenNiche ? "bg-[#e07b2e]/80" : "bg-violet-600/80"}`}>
            {t("cardCommission", { rate: produit.commission })}
          </span>
        )}
      </div>

      <div className="px-3.5 py-3">
        <h3 className="text-[13px] font-semibold mt-0 mb-2.5 text-[var(--text-primary)] leading-snug h-10 overflow-hidden">
          {produit.nom}
        </h3>

        {/* Pricing block */}
        <div className="mb-2.5 flex flex-col gap-1.5">
          {/* Prix AliExpress */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-[0.04em]">
              {t("cardPriceAli")}
            </span>
            <div className="flex items-center gap-1.5">
              {hasPrixOriginal && (
                <span className="text-[11px] text-[var(--text-faint)] line-through">
                  {produit.prixOriginal!.toFixed(2)}€
                </span>
              )}
              <span className="text-[13px] font-semibold text-[var(--text-muted)]">
                {produit.prixFournisseur.toFixed(2)}€
              </span>
            </div>
          </div>

          {/* Prix de vente suggéré */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-[0.04em]">
              {t("cardPriceSuggested")}
            </span>
            <span className="text-[13px] font-bold text-[var(--accent)]">
              {produit.prixVente.toFixed(2)}€
            </span>
          </div>
        </div>

        {/* Marge */}
        <div className="bg-[var(--bg-sunken)] rounded-lg px-2.5 py-1.5 mb-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-[0.04em]">{t("cardMarge")}</span>
            <span className="text-[15px] font-bold text-[var(--success)]">{produit.marge}%</span>
          </div>
        </div>

        <div className="flex justify-between items-center text-xs text-[var(--text-faint)] mb-3.5">
          <span>
            ⭐ {(produit.note ?? 0).toFixed(1)} ·{" "}
            {produit.commandes > 1000 ? `${(produit.commandes / 1000).toFixed(0)}k` : produit.commandes}{" "}
            {t("cardOrdersUnit")}
          </span>
          {croissancePct !== undefined && (
            <span className={`text-[11px] font-bold flex items-center gap-0.5 ${croissancePct >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
              {croissancePct >= 0 ? "↑" : "↓"} {Math.abs(croissancePct).toFixed(0)}%
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <a
            href={produit.lienAliExpress}
            target="_blank"
            rel="noopener noreferrer"
            className={`block text-white text-center py-2.5 rounded-lg text-[13px] font-semibold no-underline ${isHalloweenNiche ? "bg-[#e07b2e]" : "bg-violet-600"}`}
          >
            {t("cardViewAli")}
          </a>
          <a
            href={`/site-builder?name=${encodeURIComponent(produit.nom)}&description=${encodeURIComponent(produit.nom)}&image=${encodeURIComponent(produit.image ?? "")}&rating=${(produit.note ?? 0).toFixed(1)}&orders=${produit.commandes}`}
            className={`block text-center py-2 rounded-lg text-xs font-semibold no-underline transition-colors ${
              isHalloweenNiche
                ? "bg-[#e07b2e]/10 border border-[#e07b2e]/30 text-[#e07b2e] hover:bg-[#e07b2e]/20"
                : "bg-violet-500/10 border border-violet-500/30 text-[var(--accent)] hover:bg-violet-500/20"
            }`}
          >
            {t("cardCreateLanding")}
          </a>
          <a
            href={`/tools/calculateur-marge?cout=${produit.prixFournisseur.toFixed(2)}`}
            className="block bg-transparent border border-[var(--border-strong)] text-[var(--text-muted)] text-center py-2 rounded-lg text-xs font-semibold no-underline transition-colors hover:bg-[var(--surface-2)]"
          >
            {t("cardCalcMarge")}
          </a>
          <button
            onClick={onAjouterBoutique}
            className="block w-full bg-emerald-500/10 border border-emerald-500/25 text-[var(--success)] text-center py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors hover:bg-emerald-500/20"
          >
            {t("cardAddBoutique")}
          </button>
          <button
            onClick={onVoirAlternatives}
            className="block w-full bg-transparent border border-[var(--border-strong)] text-[var(--text-muted)] text-center py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors hover:bg-[var(--surface-2)]"
          >
            {t("cardAlternatives")}
          </button>
        </div>
      </div>
    </div>
  );
}

type Alternative = {
  productId: string;
  title: string;
  image: string;
  shopId: number | null;
  shopUrl: string | null;
  shopName: string | null;
  evaluateRate: string | null;
  orders: number;
  priceEUR: number;
  similarityScore: number;
  reliabilityScore: number;
  link: string | null;
};

function AlternativesModal({ produit, onClose }: { produit: Produit; onClose: () => void }) {
  const t = useTranslations("dashboard.produits");
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);

  useEffect(() => {
    // Pas de setLoading(true)/setErreur(null) ici : le modal est démonté à la fermeture
    // (rendu conditionnel dans le parent), donc chaque ouverture est un montage neuf où
    // useState(true)/useState(null) ci-dessus jouent déjà ce rôle.
    let annule = false;

    fetch("/api/finder/alternatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: produit.id, nom: produit.nom }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (annule) return;
        if (!res.ok) {
          setErreur(json.error ?? t("altErrorLoad"));
          return;
        }
        setAlternatives(json.alternatives ?? []);
      })
      .catch(() => {
        if (!annule) setErreur(t("altErrorServer"));
      })
      .finally(() => {
        if (!annule) setLoading(false);
      });

    return () => { annule = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produit.id, produit.nom]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl p-7 max-w-[640px] w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-4 gap-3">
          <div>
            <div className="text-xs text-[var(--text-faint)] uppercase tracking-[0.06em] mb-1">
              {t("altTitle")}
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] m-0 leading-snug">
              {produit.nom}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border border-[var(--border-strong)] text-[var(--text-faint)] w-7 h-7 rounded-lg cursor-pointer shrink-0 text-sm"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="text-center py-10 text-[var(--text-faint)] text-[13.5px]">
            {t("altLoading")}
          </div>
        ) : erreur ? (
          <div className="text-[var(--danger)] text-[13px] text-center py-5">
            ⚠️ {erreur}
          </div>
        ) : !alternatives || alternatives.length === 0 ? (
          <div className="text-[var(--text-muted)] text-[13px] text-center py-5 leading-relaxed">
            {t("altEmpty")}
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {alternatives.map((alt) => {
              const hasLink = Boolean(alt.link);
              const cardContent = (
                <>
                  {alt.image ? (
                    <Image
                      src={alt.image}
                      alt={alt.title}
                      width={56}
                      height={56}
                      className="w-14 h-14 rounded-lg object-cover shrink-0 bg-[var(--surface)]"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-[var(--surface)] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] text-[var(--text-primary)] font-semibold mb-1 overflow-hidden text-ellipsis whitespace-nowrap">
                      {alt.title}
                    </div>
                    <div className="text-[11.5px] text-[var(--text-faint)] mb-1.5">
                      {alt.shopName ?? t("altShopFallback")}
                    </div>
                    <div className="flex gap-3 flex-wrap text-[11.5px] text-[var(--text-muted)]">
                      <span>💶 {alt.priceEUR.toFixed(2)}€</span>
                      <span>⭐ {alt.evaluateRate ?? "—"}</span>
                      <span>
                        📦 {alt.orders > 1000 ? `${(alt.orders / 1000).toFixed(0)}k` : alt.orders}{" "}
                        {t("cardOrdersUnit")}
                      </span>
                      <span className="text-[var(--accent)]">
                        {t("altSimilar", { pct: Math.round(alt.similarityScore * 100) })}
                      </span>
                      {!hasLink && <span className="text-[var(--danger)]">{t("altNoLink")}</span>}
                    </div>
                  </div>
                </>
              );

              // Sans lien AliExpress résolu, on ne rend pas un <a href="#"> cliquable sans
              // effet : un <div> visuellement grisé, non cliquable, avec le motif explicite
              // ci-dessus plutôt qu'une action qui ne fait rien.
              return hasLink ? (
                <a
                  key={alt.productId}
                  href={alt.link ?? undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex gap-3 bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-[10px] p-3 no-underline text-inherit"
                >
                  {cardContent}
                </a>
              ) : (
                <div
                  key={alt.productId}
                  aria-disabled="true"
                  title={t("altNoLinkTitle")}
                  className="flex gap-3 bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-[10px] p-3 text-inherit opacity-60 cursor-not-allowed"
                >
                  {cardContent}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type BoutiqueOption = { id: string; nom: string; settings: { niche?: string } | null };

function AjouterBoutiqueModal({ produit, onClose }: { produit: Produit; onClose: () => void }) {
  const t = useTranslations("dashboard.produits");
  const tNiches = useTranslations("niches");

  // Traduction si la niche fait partie du catalogue, sinon libellé FR de repli (un id
  // libre peut venir de boutiques.settings.niche).
  const labelNiche = (id: string | null | undefined) => {
    const key = nicheI18nKey(id, "label");
    return key ? tNiches(key) : nicheLabel(id) ?? id ?? "";
  };

  const [boutiques, setBoutiques] = useState<BoutiqueOption[] | null>(null);
  const [boutiquesError, setBoutiquesError] = useState<string | null>(null);
  const [selectedBoutiqueId, setSelectedBoutiqueId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetch("/api/boutiques")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setBoutiquesError(json.error ?? t("addErrorBoutiques"));
          return;
        }
        const list: BoutiqueOption[] = json.boutiques ?? [];
        setBoutiques(list);
        if (list.length > 0) setSelectedBoutiqueId(list[0].id);
      })
      .catch(() => setBoutiquesError(t("addErrorServer")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAdd() {
    if (!selectedBoutiqueId) return;
    setAdding(true);
    setAddError(null);
    try {
      const response = await fetch(`/api/boutiques/${selectedBoutiqueId}/produits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: produit.nom,
          slug: slugify(produit.nom),
          image_urls: produit.image ? [produit.image] : [],
          prix_vente: produit.prixVente,
          prix_original: null,
          source_produit_id: produit.id,
          meta: {},
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setAddError(json.error ?? t("addErrorAdd"));
        return;
      }
      setAdded(true);
    } catch {
      setAddError(t("addErrorServer"));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-[var(--surface)] border border-[var(--border-strong)] rounded-2xl p-7 max-w-[560px] w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-4 gap-3">
          <div>
            <div className="text-xs text-[var(--text-faint)] uppercase tracking-[0.06em] mb-1">
              {t("addTitle")}
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] m-0 leading-snug">
              {produit.nom}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="bg-transparent border border-[var(--border-strong)] text-[var(--text-faint)] w-7 h-7 rounded-lg cursor-pointer shrink-0 text-sm"
          >
            ✕
          </button>
        </div>

        {boutiquesError ? (
          <div className="text-[var(--danger)] text-[13px]">{boutiquesError}</div>
        ) : boutiques === null ? (
          <p className="text-[13px] text-[var(--text-faint)]">{t("addLoadingBoutiques")}</p>
        ) : boutiques.length === 0 ? (
          <div className="text-[13px] text-[var(--text-muted)] leading-relaxed">
            {t("addNoBoutique")}
            <Link href="/site-builder/boutique" className="text-[var(--accent)]">{t("addCreateLink")}</Link>
          </div>
        ) : !added ? (
          <>
            <label className="block text-[11.5px] text-[var(--text-faint)] mb-1.5">
              {t("addTargetLabel")}
            </label>
            <select
              value={selectedBoutiqueId}
              onChange={(e) => setSelectedBoutiqueId(e.target.value)}
              className="w-full box-border bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-lg px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none mb-2"
            >
              {boutiques.map((b) => (
                <option key={b.id} value={b.id}>{b.nom}</option>
              ))}
            </select>

            {(() => {
              const cible = boutiques.find((b) => b.id === selectedBoutiqueId);
              const nicheCible = cible?.settings?.niche;
              if (!nicheCible || nicheCible === produit.niche) return null;
              return (
                <div className="bg-amber-500/10 border border-amber-500/25 text-[var(--warning)] rounded-lg px-3 py-2.5 text-[12.5px] mb-4">
                  {t("addNicheWarning", {
                    nicheCible: labelNiche(nicheCible),
                    nicheProduit: labelNiche(produit.niche),
                  })}
                </div>
              );
            })()}

            {addError && (
              <div className="text-[var(--danger)] text-[12.5px] mb-3">{addError}</div>
            )}

            <button
              onClick={handleAdd}
              disabled={adding}
              className={`block w-full box-border text-center bg-violet-600 text-white px-5 py-3.5 rounded-[10px] text-sm font-bold border-none ${adding ? "cursor-default opacity-60" : "cursor-pointer"}`}
            >
              {adding ? t("addSubmitting") : t("addSubmit")}
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="bg-emerald-500/10 border border-emerald-500/25 text-[var(--success)] rounded-[10px] px-4 py-3 text-[13px] font-semibold">
              {t("addSuccess")}
            </div>
            <ProduitsSuggeres boutiqueId={selectedBoutiqueId} />
          </div>
        )}
      </div>
    </div>
  );
}
