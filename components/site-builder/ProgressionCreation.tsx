"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { BarreProgression, Squelette, useTempsEcoule } from "@/components/chargement/IndicateurChargement";
import {
  INTERVALLE_SONDAGE_MS,
  avancementCreation,
  phaseChargement,
  type EtapeCreation,
} from "@/lib/chargement";

type EtatServeur = { etat: "connu"; etape: EtapeCreation; caracteres: number } | { etat: "inconnu" };

/** Progression réelle de la création d'un site (écran « Génération » du Site Builder).
 *  Interroge GET /api/generate-site/progression toutes les 1,5 s : étape en cours et caractères
 *  de HTML déjà écrits par l'IA (lib/progression-site.ts). Affichage selon le temps écoulé :
 *  rien avant 1 s, l'étape et un squelette d'aperçu jusqu'à 10 s, puis la barre de progression
 *  avec le temps restant (ou « encore quelques secondes » si l'estimation n'est pas fiable).
 *  Si l'avancement réel est indisponible (migration 071 absente), la barre est estimée. */
export default function ProgressionCreation({ suiviId }: { suiviId: string }) {
  const t = useTranslations("chargement");
  const format = useFormatter();
  const ecouleMs = useTempsEcoule();
  const [etat, setEtat] = useState<EtatServeur>({ etat: "inconnu" });

  useEffect(() => {
    let actif = true;
    const sonder = () =>
      fetch(`/api/generate-site/progression?id=${encodeURIComponent(suiviId)}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json: EtatServeur | null) => {
          if (actif && json?.etat === "connu") setEtat(json);
        })
        .catch(() => {});
    const id = window.setInterval(sonder, INTERVALLE_SONDAGE_MS);
    return () => {
      actif = false;
      window.clearInterval(id);
    };
  }, [suiviId]);

  const phase = phaseChargement(ecouleMs);
  if (phase === "aucun") return null;

  const avancement = etat.etat === "connu" ? avancementCreation(etat.etape, etat.caracteres) : null;
  const texteEtape =
    etat.etat === "connu" && etat.etape !== "erreur"
      ? t(`creation.${etat.etape}`, { caracteres: format.number(etat.caracteres) })
      : null;

  return (
    <div role="status" aria-busy="true" data-dv-chargement={phase} className="flex w-full max-w-md flex-col gap-4">
      {texteEtape ? (
        <p className="text-sm text-[var(--text-muted)]" aria-live="polite">
          {texteEtape}
        </p>
      ) : (
        <span className="sr-only">{t("creation.libelle")}</span>
      )}
      {phase === "progression" ? <BarreProgression ecouleMs={ecouleMs} avancement={avancement} libelle={t("creation.libelle")} /> : null}
      {/* Squelette de l'aperçu du site à venir : bandeau, titre, texte et bouton. */}
      <div aria-hidden="true" className="flex flex-col gap-3 rounded-xl border border-[var(--border)] p-4">
        <Squelette className="h-24 w-full" />
        <Squelette className="h-4 w-2/3" />
        <Squelette className="h-3 w-full" />
        <Squelette className="h-3 w-5/6" />
        <Squelette className="h-9 w-32 self-center" />
      </div>
    </div>
  );
}
