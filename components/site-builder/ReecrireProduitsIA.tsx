"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";

type Ancien = { id: string; nom: string; description: string | null };
type Resultat = { modifies: number; ignores: number; anciens: Ancien[] };

type Props = {
  boutiqueId: string;
  produitsCount: number;
  // Recharge la liste des produits après la réécriture ou son annulation.
  onTermine: () => Promise<void> | void;
};

// Bouton unique de la section Produits : réécrit par l'IA le titre et la description de tous
// les produits (route /api/boutiques/[id]/reecrire-produits). La dernière réécriture peut être
// annulée tant que la page reste ouverte.
export default function ReecrireProduitsIA({ boutiqueId, produitsCount, onTermine }: Props) {
  const t = useTranslations("siteBuilder.boutique.gestion.reecriture");
  const apiErrorMessage = useApiErrorMessage();

  const [enCours, setEnCours] = useState(false);
  const [annulation, setAnnulation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  async function reecrire() {
    if (enCours || produitsCount === 0) return;
    if (!confirm(t("confirmer", { count: produitsCount }))) return;
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    try {
      const res = await fetch(`/api/boutiques/${boutiqueId}/reecrire-produits`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setErreur(apiErrorMessage(json, t("erreur")));
        return;
      }
      setResultat(json as Resultat);
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
      const res = await fetch(`/api/boutiques/${boutiqueId}/reecrire-produits`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anciens: resultat.anciens }),
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

  return (
    <div className="mb-6 space-y-3">
      <button
        type="button"
        onClick={() => void reecrire()}
        disabled={enCours || annulation || produitsCount === 0}
        className="w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
      >
        {enCours ? t("enCours") : t("bouton")}
      </button>
      {enCours ? <p className="text-sm text-[var(--text-muted)]">{t("patience")}</p> : null}
      {erreur ? <p className="text-sm text-[var(--danger)]">{erreur}</p> : null}
      {resultat ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
          <p className="text-[var(--text-primary)]">
            {t("resultat", { count: resultat.modifies })}
            {resultat.ignores > 0 ? ` ${t("ignores", { count: resultat.ignores })}` : ""}
          </p>
          <button
            type="button"
            onClick={() => void annuler()}
            disabled={annulation}
            className="rounded-2xl border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 disabled:opacity-50"
          >
            {annulation ? t("annulationEnCours") : t("annuler")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
