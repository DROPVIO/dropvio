"use client";

import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";

import { useEffect, useState } from "react";
import type { FicheStyle } from "@/lib/style-fiche";

// Dépôt de 1 à 3 captures de sites admirés → fiche de style à valeurs fermées
// (app/api/inspiration/route.ts). Utilisé par la barre de saisie de l'étape 1 du Site Builder
// (components/site-builder/ComposerSite.tsx) : les captures sont jointes comme des pièces
// jointes et analysées dès leur ajout. La fiche est gardée côté client et renvoyée avec la
// demande de génération ; les captures, elles, sont supprimées du serveur juste après
// l'analyse. La palette extraite est seulement affichée : la palette appliquée reste celle
// du builder. Toute image est acceptée ici : le serveur l'identifie par ses octets et la convertit.
export const MAX_FICHIERS_INSPIRATION = 3;
const COTE_MAX = 1600;

// Réduction avant envoi (aussi utilisée pour les captures d'avis) : Vercel refuse toute requête de plus de 4,5 Mo, alors qu'une photo
// de téléphone dépasse souvent 10 Mo. Ce que le navigateur sait décoder (dont le HEIC sur
// Safari/iPhone) est redessiné en JPEG 1600 px max ; sinon le fichier d'origine part tel
// quel et le serveur tranche (format illisible ou trop lourd, signalé par fichier).
export async function reduirePourEnvoi(fichier: File): Promise<Blob> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const echelle = Math.min(1, COTE_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * echelle));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * echelle));
    const ctx = canvas.getContext("2d");
    if (!ctx) return fichier;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    return jpeg ?? fichier;
  } catch {
    return fichier;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export type Inspiration = {
  // Miniatures des captures jointes (object URLs, libérées automatiquement).
  apercus: string[];
  analyse: boolean;
  erreurs: string[];
  ajouter: (liste: FileList | null) => void;
  retirer: () => void;
};

export function useInspiration(onChange: (fiche: FicheStyle | null) => void): Inspiration {
  const t = useTranslations("siteBuilder.inspiration");
  const apiErrorMessage = useApiErrorMessage();
  const [apercus, setApercus] = useState<string[]>([]);
  const [analyse, setAnalyse] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreursFichiers, setErreursFichiers] = useState<{ fichier: string; erreur: string; code?: string }[]>([]);

  // Libère les object URLs des miniatures quand elles sont remplacées ou au démontage.
  useEffect(() => () => apercus.forEach((u) => URL.revokeObjectURL(u)), [apercus]);

  async function analyser(choisis: File[]) {
    setAnalyse(true);
    setErreur(null);
    setErreursFichiers([]);
    try {
      const form = new FormData();
      for (const f of choisis) form.append("files", await reduirePourEnvoi(f), f.name);
      const res = await fetch("/api/inspiration", { method: "POST", body: form });
      // Une requête refusée par l'hébergeur (413 au-delà de 4,5 Mo) ne renvoie pas de JSON.
      const json = await res.json().catch(() => null);
      if (json && Array.isArray(json.erreursFichiers)) setErreursFichiers(json.erreursFichiers);
      if (!res.ok || !json) {
        setErreur(apiErrorMessage(json, res.status === 413 ? t("tropLourdes") : t("erreurAnalyse")));
        return;
      }
      onChange(json.fiche as FicheStyle);
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setAnalyse(false);
    }
  }

  // Les captures jointes remplacent les précédentes (une seule fiche à la fois) et sont
  // analysées tout de suite : plus d'étape « Analyser » séparée.
  function ajouter(liste: FileList | null) {
    const choisis = Array.from(liste ?? []);
    if (choisis.length === 0) return;
    if (choisis.length > MAX_FICHIERS_INSPIRATION) {
      setErreur(t("maximum", { max: MAX_FICHIERS_INSPIRATION }));
      return;
    }
    setApercus(choisis.map((f) => URL.createObjectURL(f)));
    void analyser(choisis);
  }

  function retirer() {
    onChange(null);
    setErreur(null);
    setErreursFichiers([]);
    setApercus([]);
  }

  const erreurs = [
    ...erreursFichiers.map((e) =>
      t("fichierErreur", {
        fichier: e.fichier,
        erreur: t.has(`fichiers.${e.code}`) ? t(`fichiers.${e.code}`) : t("fichiers.invalide"),
      })
    ),
    ...(erreur ? [erreur] : []),
  ];

  return { apercus, analyse, erreurs, ajouter, retirer };
}

// Résumé de la fiche extraite, en infobulle de la pièce jointe « style » de la barre.
export function useResumeFiche(fiche: FicheStyle | null): string | null {
  const t = useTranslations("siteBuilder.inspiration");
  if (!fiche) return null;
  return [
    `${t("fiche.typo")} ${fiche.typo}`,
    `${t("fiche.rayon")} ${fiche.rayon}`,
    `${t("fiche.densite")} ${fiche.densite}`,
    `${t("fiche.banniere")} ${fiche.banniere}`,
    `${t("fiche.cartes")} ${fiche.cartes}`,
    `${t("fiche.sections")} ${fiche.sections.length > 0 ? fiche.sections.join(" → ") : t("fiche.aucuneSection")}`,
  ].join("\n");
}
