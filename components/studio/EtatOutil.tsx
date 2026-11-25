"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { OutilIa } from "@/lib/pauses-outils";
import { lireQuotaEtOutil, type EtatOutilClient, type QuotaImagesClient } from "@/lib/media/quota-images";

const FUSEAU_PAR_DEFAUT = "Europe/Paris";

/** Heure de reprise HH:MM dans le fuseau du navigateur (Europe/Paris s'il est illisible). */
export function heureReprise(ms: number, locale: string): string {
  let timeZone = FUSEAU_PAR_DEFAUT;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || FUSEAU_PAR_DEFAUT;
  } catch {
    // Fuseau illisible : Europe/Paris.
  }
  return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(ms));
}

/** Quota du mois et état de l'outil, relus à chaque `actualisation`. */
export function useEtatOutil(outil: OutilIa, actualisation = 0) {
  const [quota, setQuota] = useState<QuotaImagesClient | null>(null);
  const [etat, setEtat] = useState<EtatOutilClient | null>(null);
  const [lu, setLu] = useState(false);

  const recharger = useCallback(async () => {
    const resultat = await lireQuotaEtOutil(outil);
    setQuota(resultat.quota);
    setEtat(resultat.outil);
    setLu(true);
  }, [outil]);

  useEffect(() => {
    queueMicrotask(() => void recharger());
  }, [recharger, actualisation]);

  // Une pause se termine toute seule : l'état est relu à l'heure de reprise.
  useEffect(() => {
    if (etat?.statut !== "pause") return;
    const delai = Math.max(1000, etat.finPause - Date.now() + 1000);
    const minuteur = setTimeout(() => void recharger(), Math.min(delai, 2_147_000_000));
    return () => clearTimeout(minuteur);
  }, [etat, recharger]);

  return { quota, etat, lu, recharger };
}

/** L'outil peut générer (aucune pause, réglages complets, ou plan sans pause). */
export function outilDisponible(etat: EtatOutilClient | null): boolean {
  return etat === null || etat.statut === "actif";
}

/** Texte « Limite atteinte pour cet outil. Réessaie à HH:MM ». */
export function useMessagePause() {
  const t = useTranslations("outilsIa");
  const locale = useLocale();
  return useCallback((finPause: number) => t("pause", { heure: heureReprise(finPause, locale) }), [t, locale]);
}

/** Ligne d'état d'un outil : crédits restants de la période, pause ou réglages à définir. Rien
 *  pour un plan sans pause (Expert). */
export function MessageEtatOutil({ etat }: { etat: EtatOutilClient | null }) {
  const t = useTranslations("outilsIa");
  const messagePause = useMessagePause();
  if (!etat) return null;
  if (etat.statut === "pause") return <p role="status" className="text-xs font-semibold text-[var(--warning-text)]">{messagePause(etat.finPause)}</p>;
  if (etat.statut === "a_definir") return <p role="status" className="text-xs text-[var(--warning-text)]">{t("aDefinir")}</p>;
  if (etat.statut === "migration") return <p role="status" className="text-xs text-[var(--warning-text)]">{t("migration")}</p>;
  return (
    <p className="text-xs text-[var(--text-faint)]">
      {t("restants", { restants: etat.restants, max: etat.creditsMax, images: etat.imagesPossibles })}
    </p>
  );
}
