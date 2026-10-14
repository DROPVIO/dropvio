"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";

type Ligne = { nom: string; description: string };

type Resultat = {
  deplaces: { id: string; ancien: string | null }[];
  creees: string[];
  sansCollection: number;
  collections: { id: string; nom: string; produits: number }[];
};

type Props = {
  boutiqueId: string;
  categories: { id: string; nom: string }[];
  // Recharge catégories et produits après un tri ou son annulation.
  onTermine: () => Promise<void> | void;
};

const LIGNE_VIDE: Ligne = { nom: "", description: "" };

// Tri automatique des produits dans des collections (route /api/boutiques/[id]/trier-produits) :
// l'utilisateur saisit le nom des collections, une description s'il veut, et l'IA range chaque
// produit d'après son titre. Le dernier tri peut être annulé.
export default function TriCollectionsIA({ boutiqueId, categories, onTermine }: Props) {
  const t = useTranslations("siteBuilder.boutique.gestion.tri");
  const apiErrorMessage = useApiErrorMessage();

  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);
  const [inclureExistantes, setInclureExistantes] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [annulation, setAnnulation] = useState(false);

  const saisies = lignes.filter((l) => l.nom.trim());
  const peutTrier = !enCours && (saisies.length > 0 || (inclureExistantes && categories.length > 0));

  function modifier(index: number, champ: keyof Ligne, valeur: string) {
    setLignes((avant) => avant.map((l, i) => (i === index ? { ...l, [champ]: valeur } : l)));
  }

  async function trier() {
    if (!peutTrier) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const res = await fetch(`/api/boutiques/${boutiqueId}/trier-produits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collections: saisies, inclureExistantes }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErreur(apiErrorMessage(json, t("erreur")));
        return;
      }
      setResultat(json as Resultat);
      setLignes([{ ...LIGNE_VIDE }]);
      await onTermine();
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setEnCours(false);
    }
  }

  async function annuler() {
    if (!resultat || annulation) return;
    setAnnulation(true);
    setErreur(null);
    try {
      const res = await fetch(`/api/boutiques/${boutiqueId}/trier-produits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deplaces: resultat.deplaces, creees: resultat.creees }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErreur(apiErrorMessage(json, t("erreurAnnulation")));
        return;
      }
      setResultat(null);
      await onTermine();
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setAnnulation(false);
    }
  }

  const champ =
    "mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500";

  return (
    <div className="mt-6 space-y-4 rounded-3xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div>
        <p className="font-semibold text-[var(--text-primary)]">{t("titre")}</p>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{t("aide")}</p>
      </div>

      {lignes.map((ligne, index) => (
        <div key={index} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <div className="flex items-start gap-2">
            <label className="block flex-1 text-sm text-[var(--text-muted)]">
              {t("nom")}
              <input
                type="text"
                value={ligne.nom}
                maxLength={80}
                onChange={(e) => modifier(index, "nom", e.target.value)}
                className={champ}
                placeholder={t("nomPlaceholder")}
              />
            </label>
            {lignes.length > 1 ? (
              <button
                type="button"
                onClick={() => setLignes((avant) => avant.filter((_, i) => i !== index))}
                aria-label={t("retirer")}
                title={t("retirer")}
                className="mt-7 rounded-xl px-3 py-3 text-sm text-[var(--text-faint)] transition hover:text-[var(--danger)]"
              >
                ✕
              </button>
            ) : null}
          </div>
          <label className="block text-sm text-[var(--text-muted)]">
            {t("description")}
            <textarea
              value={ligne.description}
              maxLength={500}
              rows={2}
              onChange={(e) => modifier(index, "description", e.target.value)}
              className={`${champ} resize-none`}
              placeholder={t("descriptionPlaceholder")}
            />
          </label>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setLignes((avant) => [...avant, { ...LIGNE_VIDE }])}
        disabled={lignes.length >= 30}
        className="text-sm font-semibold text-violet-400 transition hover:text-violet-300 disabled:opacity-50"
      >
        {t("ajouter")}
      </button>

      {categories.length > 0 ? (
        <label className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
          <input
            type="checkbox"
            checked={inclureExistantes}
            onChange={(e) => setInclureExistantes(e.target.checked)}
            className="mt-1"
          />
          <span>{t("inclureExistantes", { noms: categories.map((c) => c.nom).join(", ") })}</span>
        </label>
      ) : null}

      <button
        type="button"
        onClick={() => void trier()}
        disabled={!peutTrier}
        className="w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {enCours ? t("enCours") : t("trier")}
      </button>

      {erreur ? <p className="text-sm text-[var(--danger)]">{erreur}</p> : null}

      {resultat ? (
        <div className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <p className="font-semibold text-[var(--text-primary)]">{t("resultat", { count: resultat.deplaces.length })}</p>
          <ul className="space-y-1 text-[var(--text-muted)]">
            {resultat.collections.map((c) => (
              <li key={c.id}>{t("parCollection", { nom: c.nom, count: c.produits })}</li>
            ))}
          </ul>
          {resultat.sansCollection > 0 ? (
            <p className="text-[var(--text-faint)]">{t("sansCollection", { count: resultat.sansCollection })}</p>
          ) : null}
          <button
            type="button"
            onClick={() => void annuler()}
            disabled={annulation}
            className="rounded-2xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 disabled:opacity-50"
          >
            {annulation ? t("annulationEnCours") : t("annulerTri")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
