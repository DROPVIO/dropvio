"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  INTERVALLE_MAJ_MS,
  partAffichee,
  phaseChargement,
  secondesRestantes,
  texteRestant,
  type Avancement,
} from "@/lib/chargement";

/** Bloc gris aux dimensions d'un élément à venir (classe dv-squelette : pulsation légère,
 *  coupée si « réduire les animations », app/globals.css). */
export function Squelette({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`dv-squelette ${className}`} />;
}

/** Temps écoulé depuis le montage, rafraîchi INTERVALLE_MAJ_MS (2 fois par seconde). Le
 *  composant n'est monté que pendant l'attente : chaque attente repart de zéro. */
export function useTempsEcoule(): number {
  const [debut] = useState(() => Date.now());
  const [maintenant, setMaintenant] = useState(debut);
  useEffect(() => {
    const id = window.setInterval(() => setMaintenant(Date.now()), INTERVALLE_MAJ_MS);
    return () => window.clearInterval(id);
  }, []);
  return maintenant - debut;
}

/** Barre de progression et temps restant (au-delà de 10 s d'attente). */
export function BarreProgression({ ecouleMs, avancement, libelle }: { ecouleMs: number; avancement?: Avancement | null; libelle: string }) {
  const t = useTranslations("chargement");
  const part = partAffichee(ecouleMs, avancement);
  const restant = texteRestant(secondesRestantes(ecouleMs, avancement));
  const pourcent = Math.round(part * 100);
  return (
    <div className="flex flex-col gap-2" data-dv-progression="">
      <div
        role="progressbar"
        aria-label={libelle}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pourcent}
        aria-valuetext={t(restant.cle, restant.valeurs)}
        className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
      >
        <div className="dv-progression-barre h-full rounded-full bg-[var(--accent)]" style={{ width: `${pourcent}%` }} />
      </div>
      <p className="text-xs text-[var(--text-muted)]" aria-live="polite">
        {t(restant.cle, restant.valeurs)}
      </p>
    </div>
  );
}

/** Indicateur d'attente selon le temps écoulé (lib/chargement.ts) :
 *  - moins de 1 s : rien (l'écran précédent ou le contenu en cache reste affiché) ;
 *  - 1 à 10 s : le squelette fourni, aux dimensions du contenu final ;
 *  - au-delà : barre de progression (avancement réel si fourni) au-dessus du squelette.
 *  À monter seulement pendant l'attente : {enAttente ? <IndicateurChargement … /> : contenu}. */
export function IndicateurChargement({
  squelette,
  libelle,
  avancement,
  className = "",
}: {
  squelette: React.ReactNode;
  libelle?: string;
  avancement?: Avancement | null;
  className?: string;
}) {
  const t = useTranslations("chargement");
  const ecouleMs = useTempsEcoule();
  const phase = phaseChargement(ecouleMs);
  const texte = libelle ?? t("enCours");
  if (phase === "aucun") return null;
  return (
    <div role="status" aria-busy="true" data-dv-chargement={phase} className={`flex flex-col gap-4 ${className}`}>
      <span className="sr-only">{texte}</span>
      {phase === "progression" ? <BarreProgression ecouleMs={ecouleMs} avancement={avancement} libelle={texte} /> : null}
      {squelette}
    </div>
  );
}

/** Emplacement d'un graphique chargé à la demande (next/dynamic) : le cadre garde la taille
 *  finale dès le premier rendu (pas de décalage de la page) ; le squelette n'apparaît qu'après
 *  1 s d'attente, à la place de l'ancien spinner. */
export function EmplacementGraphique({ hauteur, cadre = true }: { hauteur: number; cadre?: boolean }) {
  return (
    <div
      className={cadre ? "rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6" : ""}
      style={{ height: hauteur }}
    >
      <IndicateurChargement className="h-full" squelette={<Squelette className="h-full w-full rounded-xl" />} />
    </div>
  );
}
