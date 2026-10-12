"use client";

import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";

import { useState } from "react";
import type { FicheStyle } from "@/lib/style-fiche";

// Dépôt de 1 à 3 captures de sites admirés → fiche de style à valeurs fermées
// (app/api/inspiration/route.ts). Rendu dans les deux variantes de l'étape 1 du Site Builder
// (produit unique et boutique). La fiche est gardée côté client et renvoyée avec la demande
// de génération ; les captures, elles, sont supprimées du serveur juste après l'analyse.
// La palette extraite est seulement affichée : la palette appliquée reste celle du builder.
// Toute image est acceptée ici : le serveur l'identifie par ses octets et la convertit.
const MAX_FICHIERS = 3;
const COTE_MAX = 1600;

// Réduction avant envoi : Vercel refuse toute requête de plus de 4,5 Mo, alors qu'une photo
// de téléphone dépasse souvent 10 Mo. Ce que le navigateur sait décoder (dont le HEIC sur
// Safari/iPhone) est redessiné en JPEG 1600 px max ; sinon le fichier d'origine part tel
// quel et le serveur tranche (format illisible ou trop lourd, signalé par fichier).
async function reduirePourEnvoi(fichier: File): Promise<Blob> {
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

export default function InspirationStyle({
  fiche,
  onChange,
}: {
  fiche: FicheStyle | null;
  onChange: (fiche: FicheStyle | null) => void;
}) {
  const t = useTranslations("siteBuilder.inspiration");
  const apiErrorMessage = useApiErrorMessage();
  const [fichiers, setFichiers] = useState<File[]>([]);
  const [analyse, setAnalyse] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [corrections, setCorrections] = useState<string[]>([]);
  const [erreursFichiers, setErreursFichiers] = useState<{ fichier: string; erreur: string; code?: string }[]>([]);

  function choisirFichiers(liste: FileList | null) {
    setErreur(null);
    const choisis = Array.from(liste ?? []);
    if (choisis.length > MAX_FICHIERS) {
      setErreur(t("maximum", { max: MAX_FICHIERS }));
      return;
    }
    setFichiers(choisis);
  }

  async function analyser() {
    if (fichiers.length === 0) return;
    setAnalyse(true);
    setErreur(null);
    setErreursFichiers([]);
    try {
      const form = new FormData();
      for (const f of fichiers) form.append("files", await reduirePourEnvoi(f), f.name);
      const res = await fetch("/api/inspiration", { method: "POST", body: form });
      // Une requête refusée par l'hébergeur (413 au-delà de 4,5 Mo) ne renvoie pas de JSON.
      const json = await res.json().catch(() => null);
      if (json && Array.isArray(json.erreursFichiers)) setErreursFichiers(json.erreursFichiers);
      if (!res.ok || !json) {
        setErreur(apiErrorMessage(json, res.status === 413 ? t("tropLourdes") : t("erreurAnalyse")));
        return;
      }
      onChange(json.fiche as FicheStyle);
      setCorrections(Array.isArray(json.corrections) ? json.corrections : []);
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setAnalyse(false);
    }
  }

  function retirer() {
    onChange(null);
    setCorrections([]);
    setErreursFichiers([]);
    setFichiers([]);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--text-muted)]">
        {t("titre")}{" "}
        <span className="text-[var(--text-faint)] font-normal">{t("aide", { max: MAX_FICHIERS })}</span>
      </label>

      {!fiche ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => choisirFichiers(e.target.files)}
            disabled={analyse}
            className="text-sm text-[var(--text-muted)] file:mr-3 file:rounded-lg file:border file:border-[var(--border-strong)] file:bg-[var(--surface-2)] file:px-3 file:py-2 file:text-xs file:font-semibold file:text-[var(--text-primary)]"
          />
          <button
            type="button"
            onClick={() => void analyser()}
            disabled={analyse || fichiers.length === 0}
            className="rounded-xl border border-[var(--border-strong)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyse ? t("analyse") : t("analyser")}
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3 text-xs text-[var(--text-muted)] flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t("fiche.typo")} <strong className="text-[var(--text-primary)]">{fiche.typo}</strong></span>
            <span>{t("fiche.rayon")} <strong className="text-[var(--text-primary)]">{fiche.rayon}</strong></span>
            <span>{t("fiche.densite")} <strong className="text-[var(--text-primary)]">{fiche.densite}</strong></span>
            <span>{t("fiche.banniere")} <strong className="text-[var(--text-primary)]">{fiche.banniere}</strong></span>
            <span>{t("fiche.cartes")} <strong className="text-[var(--text-primary)]">{fiche.cartes}</strong></span>
          </div>
          <div>
            {t("fiche.sections")}{" "}
            <strong className="text-[var(--text-primary)]">
              {fiche.sections.length > 0 ? fiche.sections.join(" → ") : t("fiche.aucuneSection")}
            </strong>
          </div>
          <div className="flex items-center gap-2">
            {t("fiche.palette")}
            {(["fond", "encre", "accent"] as const).map((k) =>
              fiche.palette[k] ? (
                <span
                  key={k}
                  title={`${k} ${fiche.palette[k]}`}
                  className="inline-block h-4 w-4 rounded border border-[var(--border-strong)]"
                  style={{ background: fiche.palette[k] }}
                />
              ) : null
            )}
          </div>
          {/* Le détail des ajustements (lib/style-fiche.ts) est une note technique en
              français, gardée pour les logs ; l'interface n'en affiche que le nombre. */}
          {corrections.length > 0 && (
            <p className="text-[var(--text-faint)]">{t("fiche.corrections", { count: corrections.length })}</p>
          )}
          <button
            type="button"
            onClick={retirer}
            className="self-start text-[11px] text-[var(--accent)] hover:opacity-80 transition"
          >
            {t("retirer")}
          </button>
        </div>
      )}

      {erreursFichiers.length > 0 && (
        <ul className="list-disc pl-4 text-xs text-[var(--danger)]">
          {erreursFichiers.map((e, i) => (
            <li key={`${e.fichier}-${i}`}>
              {t("fichierErreur", { fichier: e.fichier, erreur: t.has(`fichiers.${e.code}`) ? t(`fichiers.${e.code}`) : t("fichiers.invalide") })}
            </li>
          ))}
        </ul>
      )}
      {erreur && <p className="text-xs text-[var(--danger)]">{erreur}</p>}
    </div>
  );
}
