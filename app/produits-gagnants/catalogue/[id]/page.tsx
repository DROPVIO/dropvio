"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import PhotosProduit from "@/components/catalogue/PhotosProduit";
import { nicheI18nKey, nicheLabel } from "@/lib/niches";
import { toIntlTag, type AppLocale } from "@/lib/locale";
import { slugify } from "@/lib/slugify";
import type { Plan } from "@/lib/plan-limits";
import { useApiErrorMessage } from "@/lib/use-api-error";

type Produit = {
  id: string;
  nom: string;
  image: string | null;
  imageCatalogue: string | null;
  prixVente: number | null;
  niche: string | null;
  lienAliExpress: string | null;
};

type Copie = {
  id: string;
  boutiqueId: string;
  categoryId: string | null;
  categoryNom: string | null;
  prixVente: number;
  prixOriginal: number | null;
  stock: number;
  imageUrls: string[];
};

type Detail = {
  produit: Produit;
  photos: string[];
  photosDisponibles: boolean;
  boutiques: { id: string; nom: string }[];
  copies: Copie[];
};

type Categorie = { id: string; nom: string };

const NOUVELLE_CATEGORIE = "__nouvelle__";

export default function CatalogueDetailPage() {
  return (
    <Suspense fallback={null}>
      <CatalogueDetail />
    </Suspense>
  );
}

function CatalogueDetail() {
  const t = useTranslations("catalogue");
  const tNiches = useTranslations("niches");
  const apiErrorMessage = useApiErrorMessage();
  const intlTag = toIntlTag(useLocale() as AppLocale);
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const retour = searchParams.get("retour");
  // Fiche ouverte depuis une boutique (lien de la section Produits) : les photos peuvent alors
  // s'appliquer à ce produit de la boutique, ou à l'ensemble de l'utilisateur.
  const boutiqueProduitId = searchParams.get("boutiqueProduit");
  const backHref = `/produits-gagnants/catalogue${retour ? `?${retour}` : ""}`;

  const [detail, setDetail] = useState<Detail | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [portee, setPortee] = useState<"boutique" | "utilisateur">(boutiqueProduitId ? "boutique" : "utilisateur");

  // ── Bloc « boutique » : prix barré, catégorie, envoi ──
  const [boutiqueId, setBoutiqueId] = useState("");
  const [categories, setCategories] = useState<Categorie[] | null>(null);
  const [prixBarreActif, setPrixBarreActif] = useState(false);
  const [prixBarre, setPrixBarre] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [nouvelleCategorie, setNouvelleCategorie] = useState("");
  const [creatingCategorie, setCreatingCategorie] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/catalogue/${encodeURIComponent(id)}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(apiErrorMessage(json, t("errorLoad")));
        return null;
      }
      setError(null);
      setDetail(json as Detail);
      return json as Detail;
    } catch {
      setError(apiErrorMessage({ code: "network" }));
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    queueMicrotask(() => {
      load().then((d) => {
        if (!d) return;
        const depuisBoutique = boutiqueProduitId ? d.copies.find((c) => c.id === boutiqueProduitId) : undefined;
        setBoutiqueId(depuisBoutique?.boutiqueId ?? d.copies[0]?.boutiqueId ?? d.boutiques[0]?.id ?? "");
      });
      fetch("/api/plan")
        .then((res) => res.json())
        .then((json) => setPlan((json?.plan as Plan) ?? null))
        .catch(() => setPlan(null));
    });
  }, [load, boutiqueProduitId]);

  const copie = detail?.copies.find((c) => c.boutiqueId === boutiqueId) ?? null;
  const copieOrigine = boutiqueProduitId ? detail?.copies.find((c) => c.id === boutiqueProduitId) ?? null : null;

  useEffect(() => {
    queueMicrotask(() => {
      setPrixBarreActif(copie?.prixOriginal != null);
      setPrixBarre(copie?.prixOriginal != null ? String(copie.prixOriginal) : "");
      setCategoryId(copie?.categoryId ?? "");
      setNouvelleCategorie("");
    });
  }, [copie?.id, copie?.prixOriginal, copie?.categoryId, boutiqueId]);

  useEffect(() => {
    queueMicrotask(() => setMessage(null));
  }, [boutiqueId]);

  const categoriesFor = useRef("");
  const loadCategories = useCallback(async (bid: string) => {
    categoriesFor.current = bid;
    let list: Categorie[] = [];
    if (bid) {
      try {
        const res = await fetch(`/api/boutiques/${bid}/categories`);
        const json = await res.json();
        list = res.ok ? json.categories ?? [] : [];
      } catch {
        list = [];
      }
    }
    if (categoriesFor.current === bid) setCategories(list);
    return list;
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setCategories(null);
      loadCategories(boutiqueId);
    });
  }, [boutiqueId, loadCategories]);

  const formatPrix = (value: number | null | undefined) =>
    value == null ? null : new Intl.NumberFormat(intlTag, { style: "currency", currency: "EUR" }).format(value);

  const labelNiche = (nicheId: string | null) => {
    if (!nicheId) return null;
    const key = nicheI18nKey(nicheId, "label");
    return key ? tNiches(key) : nicheLabel(nicheId) ?? nicheId;
  };

  const boutiqueNom = (bid: string) => detail?.boutiques.find((b) => b.id === bid)?.nom ?? "";

  function prixOriginalAEnregistrer(): { ok: true; value: number | null } | { ok: false } {
    if (!prixBarreActif) return { ok: true, value: null };
    const value = parseFloat(prixBarre.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) return { ok: false };
    return { ok: true, value: Math.round(value * 100) / 100 };
  }

  async function patchCopie(c: Copie, body: Record<string, unknown>) {
    const res = await fetch(`/api/boutiques/${c.boutiqueId}/produits/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(apiErrorMessage(json, t("errorSave")));
  }

  async function handleSave() {
    if (!detail || !boutiqueId) return;
    const prix = prixOriginalAEnregistrer();
    if (!prix.ok) {
      setMessage({ ok: false, text: t("errorPrixBarre") });
      return;
    }
    const category_id = categoryId && categoryId !== NOUVELLE_CATEGORIE ? categoryId : null;
    setSaving(true);
    setMessage(null);
    try {
      if (copie) {
        await patchCopie(copie, { prix_original: prix.value, category_id });
        setMessage({ ok: true, text: t("saved") });
      } else {
        const { produit, photos } = detail;
        if (typeof produit.prixVente !== "number") {
          setMessage({ ok: false, text: t("errorPrixManquant") });
          return;
        }
        // Le lien AliExpress n'est jamais envoyé à la boutique. Photos : celles choisies par
        // l'utilisateur pour ce produit, sinon la photo du catalogue.
        const image_urls = photos.length > 0 ? photos : produit.imageCatalogue ? [produit.imageCatalogue] : [];
        const res = await fetch(`/api/boutiques/${boutiqueId}/produits`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nom: produit.nom,
            slug: slugify(produit.nom),
            image_urls,
            prix_vente: produit.prixVente,
            prix_original: prix.value,
            category_id,
            source_produit_id: produit.id,
            meta: {},
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage({ ok: false, text: apiErrorMessage(json, t("errorSend")) });
          return;
        }
        setMessage({ ok: true, text: t("sent", { boutique: boutiqueNom(boutiqueId) }) });
      }
      await load();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : apiErrorMessage({ code: "network" }) });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCategorie() {
    const nom = nouvelleCategorie.trim();
    if (!nom || !boutiqueId) return;
    setCreatingCategorie(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/boutiques/${boutiqueId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, slug: slugify(nom), position: categories?.length ?? 0 }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.id !== "string") {
        setMessage({ ok: false, text: apiErrorMessage(json, t("errorCategorie")) });
        return;
      }
      await loadCategories(boutiqueId);
      setCategoryId(json.id);
      setNouvelleCategorie("");
      if (copie) {
        await patchCopie(copie, { category_id: json.id });
        await load();
        setMessage({ ok: true, text: t("categorieAssigned", { nom }) });
      } else {
        setMessage({ ok: true, text: t("categorieCreated", { nom }) });
      }
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : apiErrorMessage({ code: "network" }) });
    } finally {
      setCreatingCategorie(false);
    }
  }

  // ── Photos : enregistrement selon la portée choisie ──
  async function enregistrerPhotos(photos: string[]): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      if (portee === "boutique" && copieOrigine) {
        const res = await fetch(`/api/boutiques/${copieOrigine.boutiqueId}/produits/${copieOrigine.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_urls: photos }),
        });
        if (!res.ok) return { ok: false, message: apiErrorMessage(await res.json().catch(() => null), t("photos.erreur")) };
      } else {
        const res = await fetch(`/api/catalogue/${encodeURIComponent(id)}/photos`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photos }),
        });
        if (!res.ok) return { ok: false, message: apiErrorMessage(await res.json().catch(() => null), t("photos.erreur")) };
      }
      await load();
      return { ok: true };
    } catch {
      return { ok: false, message: apiErrorMessage({ code: "network" }) };
    }
  }

  const backLink = (
    <Link
      href={backHref}
      aria-label={t("backToList")}
      title={t("backToList")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
    >
      ←
    </Link>
  );

  if (loading) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)] px-8 py-10">
        {backLink}
        <p className="py-16 text-center text-sm text-[var(--text-faint)]">{t("loading")}</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg)] px-8 py-10">
        {backLink}
        <div className="mt-6 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger-text)]">{error ?? t("errorLoad")}</div>
      </div>
    );
  }

  const { produit, boutiques, copies } = detail;
  const nonRenseigne = <span className="text-[var(--text-faint)]">{t("notSet")}</span>;
  const inputCls =
    "rounded-lg border border-[var(--border-strong)] bg-[var(--bg-sunken)] px-3 py-2 text-[13.5px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:opacity-50";
  const photosPortee = portee === "boutique" && copieOrigine ? copieOrigine.imageUrls : detail.photos;

  return (
    <div className="min-h-screen w-full bg-[var(--bg)] px-8 py-10">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          {backLink}
          <Link
            href={`/studio?mode=produits&catalogue=${encodeURIComponent(produit.id)}`}
            className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]"
          >
            ✨ {t("envoyerStudio")}
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {produit.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={produit.image} alt="" className="h-20 w-20 shrink-0 rounded-xl bg-[var(--surface-2)] object-cover" />
          ) : (
            <div className="h-20 w-20 shrink-0 rounded-xl bg-[var(--surface-2)]" />
          )}
          <h1 className="text-2xl font-bold leading-snug text-[var(--text-primary)]">{produit.nom}</h1>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            {/* ── Fiche produit ── */}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("sectionFiche")}</h2>
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm">
                <dt className="text-[var(--text-faint)]">{t("fieldNom")}</dt>
                <dd className="text-[var(--text-primary)]">{produit.nom}</dd>

                <dt className="text-[var(--text-faint)]">{t("fieldTitre")}</dt>
                <dd title={t("titreMissingHint")}>{nonRenseigne}</dd>

                <dt className="text-[var(--text-faint)]">{t("fieldDescription")}</dt>
                <dd title={t("descriptionMissingHint")}>{nonRenseigne}</dd>

                <dt className="text-[var(--text-faint)]">{t("fieldPrix")}</dt>
                <dd className="font-semibold tabular-nums text-[var(--text-primary)]">{formatPrix(produit.prixVente) ?? nonRenseigne}</dd>

                <dt className="text-[var(--text-faint)]">{t("fieldAncienPrix")}</dt>
                <dd>
                  {copies.some((c) => c.prixOriginal != null) ? (
                    <ul className="flex flex-col gap-1">
                      {copies
                        .filter((c) => c.prixOriginal != null)
                        .map((c) => (
                          <li key={c.id} className="tabular-nums">
                            <span className="text-[var(--text-muted)] line-through">{formatPrix(c.prixOriginal)}</span>
                            <span className="text-[var(--text-faint)]"> · {boutiqueNom(c.boutiqueId)}</span>
                          </li>
                        ))}
                    </ul>
                  ) : (
                    nonRenseigne
                  )}
                </dd>

                <dt className="text-[var(--text-faint)]">{t("fieldCategorie")}</dt>
                <dd className="text-[var(--text-primary)]">{labelNiche(produit.niche) ?? nonRenseigne}</dd>

                <dt className="text-[var(--text-faint)]">{t("fieldBoutiques")}</dt>
                <dd>
                  {copies.length === 0 ? (
                    <span className="text-[var(--text-faint)]">{t("noBoutique")}</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {copies.map((c) => (
                        <li key={c.id} className="text-[var(--text-primary)]">
                          {boutiqueNom(c.boutiqueId)}
                          <span className="text-[var(--text-faint)]">
                            {" · "}
                            {c.categoryNom ?? t("noBoutiqueCategory")}
                            {" · "}
                            {t("stockBoutique", { stock: c.stock })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </dd>

                <dt className="text-[var(--text-faint)]">{t("fieldStock")}</dt>
                <dd title={t("stockMissingHint")}>{nonRenseigne}</dd>

                <dt className="text-[var(--text-faint)]">{t("fieldLienAliExpress")}</dt>
                <dd className="min-w-0">
                  {produit.lienAliExpress ? (
                    <a href={produit.lienAliExpress} target="_blank" rel="noopener noreferrer" className="break-all text-[var(--accent-text)] hover:underline">
                      {produit.lienAliExpress}
                    </a>
                  ) : (
                    nonRenseigne
                  )}
                </dd>
              </dl>
            </section>

            {/* ── Photos ── */}
            <section className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div>
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("photos.titre")}</h2>
                <p className="mt-1.5 text-xs text-[var(--text-faint)]">{t("photos.aide")}</p>
              </div>
              {copieOrigine ? (
                <div role="radiogroup" aria-label={t("photos.porteeTitre")} className="flex flex-col gap-1.5 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3 text-sm">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">{t("photos.porteeTitre")}</span>
                  <label className="flex items-center gap-2 text-[var(--text-primary)]">
                    <input type="radio" checked={portee === "boutique"} onChange={() => setPortee("boutique")} className="accent-violet-600" />
                    {t("photos.porteeBoutique", { boutique: boutiqueNom(copieOrigine.boutiqueId) })}
                  </label>
                  <label className="flex items-center gap-2 text-[var(--text-primary)]">
                    <input type="radio" checked={portee === "utilisateur"} onChange={() => setPortee("utilisateur")} className="accent-violet-600" />
                    {t("photos.porteeUtilisateur")}
                  </label>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">{t("photos.porteeUtilisateurSeule")}</p>
              )}
              {portee === "utilisateur" && detail.photos.length === 0 && produit.imageCatalogue && (
                <p className="text-xs text-[var(--text-faint)]">{t("photos.parDefaut")}</p>
              )}
              <PhotosProduit
                initiales={photosPortee}
                plan={plan}
                disponible={portee === "boutique" ? true : detail.photosDisponibles}
                indisponibleMessage={t("photos.migration")}
                onEnregistrer={enregistrerPhotos}
              />
            </section>
          </div>

          {/* ── Boutique : prix barré, catégorie, envoi ── */}
          <section className="flex flex-col gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div>
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("sectionBoutique")}</h2>
              <p className="mt-1.5 text-xs text-[var(--text-faint)]">{t("sectionBoutiqueHint")}</p>
            </div>

            {boutiques.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-[var(--text-faint)]">{t("noBoutiqueYet")}</p>
                <Link href="/site-builder/boutique" className="text-xs text-[var(--accent-text)] hover:underline">{t("createBoutique")}</Link>
              </div>
            ) : (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-muted)]">{t("fieldBoutique")}</span>
                  <select value={boutiqueId} onChange={(e) => setBoutiqueId(e.target.value)} className={inputCls}>
                    {boutiques.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nom}
                        {copies.some((c) => c.boutiqueId === b.id) ? ` · ${t("alreadyIn")}` : ""}
                      </option>
                    ))}
                  </select>
                  <span className={`text-[11px] ${copie ? "text-[var(--success-text)]" : "text-[var(--text-faint)]"}`}>{copie ? t("statusIn") : t("statusNotIn")}</span>
                </label>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-[var(--text-muted)]">{t("fieldPrixBarre")}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={prixBarreActif}
                      aria-label={t("fieldPrixBarre")}
                      onClick={() => setPrixBarreActif((v) => !v)}
                      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${
                        prixBarreActif ? "bg-[var(--accent)]" : "border border-[var(--border-strong)] bg-[var(--surface-3)]"
                      }`}
                    >
                      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${prixBarreActif ? "translate-x-[18px]" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={prixBarre}
                      onChange={(e) => setPrixBarre(e.target.value)}
                      disabled={!prixBarreActif}
                      placeholder={t("prixBarrePlaceholder")}
                      aria-label={t("fieldPrixBarre")}
                      className={`${inputCls} w-32 tabular-nums`}
                    />
                    <span className="text-sm text-[var(--text-faint)]">€</span>
                  </div>
                  <span className="text-[11px] text-[var(--text-faint)]">{prixBarreActif ? t("prixBarreOnHint") : t("prixBarreOffHint")}</span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-[var(--text-muted)]">{t("fieldCategorieBoutique")}</span>
                  <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={categories === null} aria-label={t("fieldCategorieBoutique")} className={inputCls}>
                    <option value="">{t("noBoutiqueCategory")}</option>
                    {(categories ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.nom}</option>
                    ))}
                    <option value={NOUVELLE_CATEGORIE}>{t("createCategory")}</option>
                  </select>
                  {categoryId === NOUVELLE_CATEGORIE && (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={nouvelleCategorie}
                        onChange={(e) => setNouvelleCategorie(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleCreateCategorie();
                          }
                        }}
                        placeholder={t("newCategoryPlaceholder")}
                        aria-label={t("newCategoryPlaceholder")}
                        autoFocus
                        className={`${inputCls} min-w-0 flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() => void handleCreateCategorie()}
                        disabled={!nouvelleCategorie.trim() || creatingCategorie}
                        className="rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {creatingCategorie ? t("creating") : t("create")}
                      </button>
                    </div>
                  )}
                </div>

                {message && (
                  <div
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      message.ok ? "border-[var(--success)]/20 bg-[var(--success)]/10 text-[var(--success-text)]" : "border-[var(--danger)]/20 bg-[var(--danger)]/10 text-[var(--danger-text)]"
                    }`}
                  >
                    {message.text}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || !boutiqueId || categoryId === NOUVELLE_CATEGORIE}
                  className="w-full rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 px-4 py-2.5 text-sm font-semibold text-white transition-all hover:from-violet-500 hover:to-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? t("saving") : copie ? t("save") : t("send", { boutique: boutiqueNom(boutiqueId) })}
                </button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
