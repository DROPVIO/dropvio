"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";
import { CLE_ACCUEIL } from "@/lib/site-builder-pages";
import { libellePage, ordonner } from "@/components/site-builder/ApercuPages";

const TOUTES = "*";

type Version = { html: string; pages: Record<string, string> | null };

type Props = {
  html: string;
  pages: Record<string, string> | null;
  // Site enregistré dans « Mes sites » : chaque modification y est sauvegardée.
  siteId: string | null;
  onChange: (version: Version) => void;
};

// Demande de modification en langage naturel, appliquée par l'IA sur toutes les pages du site
// ou sur une seule (route /api/modifier-site) : textes, sections, styles, en-tête et pied de
// page compris — pas seulement la grille produit. La dernière modification peut être annulée.
export default function ModifierSiteIA({ html, pages, siteId, onChange }: Props) {
  const t = useTranslations("siteBuilder.modifier");
  const tApercu = useTranslations("siteBuilder.apercu");
  const tPages = (cle: string) => (tApercu.has(`pages.${cle}`) ? tApercu(`pages.${cle}`) : undefined);
  const apiErrorMessage = useApiErrorMessage();

  const [demande, setDemande] = useState("");
  const [cible, setCible] = useState(TOUTES);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ resume: string; pages: string[]; enregistre: boolean } | null>(null);
  const [precedente, setPrecedente] = useState<Version | null>(null);

  const cles = pages ? ordonner(Object.keys(pages)) : [CLE_ACCUEIL];
  const nomPage = (cle: string) => libellePage(cle, tPages);

  async function enregistrer(version: Version): Promise<boolean> {
    if (!siteId) return false;
    try {
      const res = await fetch(`/api/sites-generes/${siteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html_content: version.html, ...(version.pages && { pages: version.pages }) }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function appliquer() {
    if (enCours || demande.trim().length < 3) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const res = await fetch("/api/modifier-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demande, cible: pages ? cible : TOUTES, ...(pages ? { pages } : { html }) }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErreur(apiErrorMessage(json, t("erreur")));
        return;
      }
      const nouvellesPages = json.pages as Record<string, string>;
      const version: Version = pages
        ? { html: nouvellesPages[CLE_ACCUEIL] ?? html, pages: nouvellesPages }
        : { html: nouvellesPages[CLE_ACCUEIL] ?? html, pages: null };
      setPrecedente({ html, pages });
      onChange(version);
      const enregistre = await enregistrer(version);
      setResultat({ resume: json.resume ?? "", pages: json.pagesModifiees ?? [], enregistre });
      setDemande("");
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setEnCours(false);
    }
  }

  async function annuler() {
    if (!precedente) return;
    onChange(precedente);
    await enregistrer(precedente);
    setPrecedente(null);
    setResultat(null);
  }

  return (
    <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-base">✨</div>
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("titre")}</h2>
          <p className="text-xs text-[var(--text-faint)] mt-0.5">{t("aide")}</p>
        </div>
      </div>

      {pages ? (
        <label className="flex flex-col gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          {t("cible")}
          <select
            value={cible}
            onChange={(e) => setCible(e.target.value)}
            className="w-full sm:w-72 bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-violet-500"
          >
            <option value={TOUTES}>{t("toutesLesPages", { count: cles.length })}</option>
            {cles.map((cle) => (
              <option key={cle} value={cle}>
                {nomPage(cle)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <textarea
        value={demande}
        onChange={(e) => setDemande(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder={t("placeholder")}
        className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-y"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void appliquer()}
          disabled={enCours || demande.trim().length < 3}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {enCours ? t("enCours") : t("appliquer")}
        </button>
        {enCours ? <p className="text-xs text-[var(--text-faint)]">{t("patience")}</p> : null}
      </div>

      {erreur ? <p className="text-sm text-[var(--danger)]">{erreur}</p> : null}

      {resultat ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 flex flex-col gap-2 text-sm">
          <p className="text-[var(--success)] font-medium">{t("succes")}</p>
          {resultat.resume ? <p className="text-[var(--text-muted)]">{resultat.resume}</p> : null}
          {resultat.pages.length > 0 ? (
            <p className="text-xs text-[var(--text-faint)]">{t("pagesModifiees", { pages: resultat.pages.map(nomPage).join(", ") })}</p>
          ) : null}
          <p className="text-xs text-[var(--text-faint)]">{resultat.enregistre ? t("enregistre") : t("nonEnregistre")}</p>
          {precedente ? (
            <button
              type="button"
              onClick={() => void annuler()}
              className="self-start rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:border-violet-500/40"
            >
              {t("annuler")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
