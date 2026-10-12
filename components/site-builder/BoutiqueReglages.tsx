"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";
import { isValidSlug, slugify } from "@/lib/slugify";
import { SUPPORTED_LOCALES, type AppLocale } from "@/lib/locale";

export type BoutiqueReglable = {
  id: string;
  nom: string;
  slug: string;
  est_publique: boolean;
  langue: AppLocale;
};

type Props = {
  boutique: BoutiqueReglable;
  produitsCount: number;
  categoriesCount: number;
  sitesCount: number;
  // false tant que la migration 042 (boutiques.langue) n'est pas appliquée.
  langueDisponible: boolean;
  onUpdated: (patch: Partial<BoutiqueReglable>) => void;
  onDeleted: () => void;
};

// Réglages de la boutique : nom et slug, langue, visibilité publique, suppression.
export default function BoutiqueReglages({
  boutique,
  produitsCount,
  categoriesCount,
  sitesCount,
  langueDisponible,
  onUpdated,
  onDeleted,
}: Props) {
  const t = useTranslations("siteBuilder.boutique.reglages");
  const apiErrorMessage = useApiErrorMessage();

  const [nom, setNom] = useState(boutique.nom);
  const [slug, setSlug] = useState(boutique.slug);
  const [identiteEnCours, setIdentiteEnCours] = useState(false);
  const [identiteErreur, setIdentiteErreur] = useState<string | null>(null);
  const [identiteSucces, setIdentiteSucces] = useState(false);

  const [langueEnCours, setLangueEnCours] = useState(false);
  const [langueErreur, setLangueErreur] = useState<string | null>(null);

  const [suppressionEnCours, setSuppressionEnCours] = useState(false);
  const [suppressionErreur, setSuppressionErreur] = useState<string | null>(null);

  const [visibiliteEnCours, setVisibiliteEnCours] = useState(false);
  const [visibiliteErreur, setVisibiliteErreur] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const res = await fetch(`/api/boutiques/${boutique.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: apiErrorMessage(json) };
      return { ok: true };
    } catch {
      return { ok: false, message: apiErrorMessage({ code: "network" }) };
    }
  }

  async function enregistrerIdentite() {
    const nomFinal = nom.trim();
    const slugFinal = slugify(slug);
    setIdentiteErreur(null);
    setIdentiteSucces(false);
    if (!nomFinal) {
      setIdentiteErreur(t("identite.nomRequis"));
      return;
    }
    if (!isValidSlug(slugFinal)) {
      setIdentiteErreur(apiErrorMessage({ code: "slug_invalid" }));
      return;
    }
    const slugChange = slugFinal !== boutique.slug;
    if (slugChange && boutique.est_publique && !window.confirm(t("identite.confirmerSlugPublic", { ancien: boutique.slug, nouveau: slugFinal }))) {
      return;
    }
    setIdentiteEnCours(true);
    const res = await patch({ nom: nomFinal, ...(slugChange && { slug: slugFinal }) });
    setIdentiteEnCours(false);
    if (!res.ok) {
      setIdentiteErreur(res.message);
      return;
    }
    setNom(nomFinal);
    setSlug(slugFinal);
    onUpdated({ nom: nomFinal, slug: slugFinal });
    setIdentiteSucces(true);
    window.setTimeout(() => setIdentiteSucces(false), 2500);
  }

  async function changerLangue(langue: AppLocale) {
    if (langue === boutique.langue) return;
    setLangueErreur(null);
    setLangueEnCours(true);
    const res = await patch({ langue });
    setLangueEnCours(false);
    if (!res.ok) {
      setLangueErreur(res.message);
      return;
    }
    onUpdated({ langue });
  }

  async function basculerVisibilite() {
    const rendrePublique = !boutique.est_publique;
    setVisibiliteErreur(null);
    if (rendrePublique) {
      if (produitsCount < 1) {
        setVisibiliteErreur(t("visibilite.produitRequis"));
        return;
      }
      if (!window.confirm(t("visibilite.confirmerPublier", { slug: boutique.slug }))) return;
    } else if (!window.confirm(t("visibilite.confirmerMasquer"))) {
      return;
    }
    setVisibiliteEnCours(true);
    const res = await patch({ est_publique: rendrePublique });
    setVisibiliteEnCours(false);
    if (!res.ok) {
      setVisibiliteErreur(res.message);
      return;
    }
    onUpdated({ est_publique: rendrePublique });
  }

  // Suppression définitive : produits et catégories partent en cascade, les sites générés
  // restent dans « Mes sites » sans lien vers la boutique (sites_generes.boutique_id → null).
  async function supprimer() {
    setSuppressionErreur(null);
    const saisie = window.prompt(
      t("suppression.confirmer", {
        nom: boutique.nom,
        produits: produitsCount,
        categories: categoriesCount,
        sites: sitesCount,
      })
    );
    if (saisie === null) return;
    if (saisie.trim() !== boutique.nom) {
      setSuppressionErreur(t("suppression.nomIncorrect"));
      return;
    }
    setSuppressionEnCours(true);
    try {
      const res = await fetch(`/api/boutiques/${boutique.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSuppressionErreur(apiErrorMessage(json));
        return;
      }
      onDeleted();
    } catch {
      setSuppressionErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setSuppressionEnCours(false);
    }
  }

  const champ =
    "mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500";
  const identiteModifiee = nom.trim() !== boutique.nom || slugify(slug) !== boutique.slug;

  return (
    <>
      <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("identite.titre")}</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm text-[var(--text-muted)]">
            {t("identite.nom")}
            <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} className={champ} />
          </label>
          <label className="block text-sm text-[var(--text-muted)]">
            {t("identite.slug")}
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              onBlur={() => setSlug(slugify(slug))}
              className={champ}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">{t("identite.aideSlug")}</p>
        {boutique.est_publique && slugify(slug) !== boutique.slug ? (
          <p className="mt-2 text-xs text-[var(--warning)]">{t("identite.avertissementSlug")}</p>
        ) : null}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void enregistrerIdentite()}
            disabled={identiteEnCours || !identiteModifiee}
            className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
          >
            {identiteEnCours ? t("enregistrement") : t("enregistrer")}
          </button>
          {identiteSucces ? <span className="text-sm text-[var(--success)]">{t("enregistre")}</span> : null}
          {identiteErreur ? <span className="text-sm text-[var(--danger)]">{identiteErreur}</span> : null}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("langue.titre")}</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">{t("langue.aide")}</p>
        <select
          value={boutique.langue}
          onChange={(e) => void changerLangue(e.target.value as AppLocale)}
          disabled={langueEnCours || !langueDisponible}
          className="mt-3 w-full max-w-xs rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
        >
          {SUPPORTED_LOCALES.map((locale) => (
            <option key={locale} value={locale}>
              {t(`langue.options.${locale}`)}
            </option>
          ))}
        </select>
        {!langueDisponible ? <p className="mt-2 text-xs text-[var(--warning)]">{t("langue.indisponible")}</p> : null}
        {langueErreur ? <p className="mt-2 text-sm text-[var(--danger)]">{langueErreur}</p> : null}
      </div>

      <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("visibilite.titre")}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={boutique.est_publique}
            onClick={() => void basculerVisibilite()}
            disabled={visibiliteEnCours}
            className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
              boutique.est_publique ? "bg-[var(--success)]" : "bg-[var(--surface-3)]"
            }`}
          >
            <span className="sr-only">{t("visibilite.titre")}</span>
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
                boutique.est_publique ? "left-6" : "left-1"
              }`}
            />
          </button>
          <span className="text-sm font-semibold text-[var(--text-primary)]">
            {boutique.est_publique ? t("visibilite.publique") : t("visibilite.privee")}
          </span>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          {boutique.est_publique ? t("visibilite.aidePublique") : t("visibilite.aidePrivee")}
        </p>
        {visibiliteErreur ? <p className="mt-2 text-sm text-[var(--danger)]">{visibiliteErreur}</p> : null}
      </div>

      <div className="mt-6 rounded-3xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4">
        <h3 className="text-sm font-semibold text-[var(--danger)]">{t("suppression.titre")}</h3>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {t("suppression.aide", { produits: produitsCount, categories: categoriesCount, sites: sitesCount })}
        </p>
        <button
          type="button"
          onClick={() => void supprimer()}
          disabled={suppressionEnCours}
          className="mt-3 rounded-2xl bg-[var(--danger)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {suppressionEnCours ? t("suppression.enCours") : t("suppression.bouton")}
        </button>
        {suppressionErreur ? <p className="mt-2 text-sm text-[var(--danger)]">{suppressionErreur}</p> : null}
      </div>
    </>
  );
}
