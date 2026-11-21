"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import MediathequeModal from "@/components/studio/MediathequeModal";
import { MEDIA_MIMES } from "@/lib/media/constantes";
import { importerImage, publierImage } from "@/lib/media/importer-client";
import type { Plan } from "@/lib/plan-limits";
import { useApiErrorMessage } from "@/lib/use-api-error";

/** Choix des photos d'un produit, sans génération IA : médiathèque (images créées avec Dropvio
 *  et images importées) ou import direct depuis l'ordinateur. La première photo est la
 *  principale, les suivantes forment la galerie ; aucune limite de nombre. Rien n'est enregistré
 *  avant « Enregistrer les photos » (onEnregistrer). */
export default function PhotosProduit({
  initiales,
  plan,
  disponible,
  indisponibleMessage,
  onEnregistrer,
}: {
  initiales: string[];
  plan: Plan | null;
  disponible: boolean;
  indisponibleMessage?: string;
  onEnregistrer: (photos: string[]) => Promise<{ ok: true } | { ok: false; message: string }>;
}) {
  const t = useTranslations("catalogue.photos");
  const ts = useTranslations("studio");
  const apiErrorMessage = useApiErrorMessage();
  const champFichier = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<string[]>(initiales);
  const [mediatheque, setMediatheque] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);

  // Nouvelle portée (boutique ou catalogue) ou rechargement : on repart des photos enregistrées.
  const cleInitiales = initiales.join("\n");
  useEffect(() => {
    queueMicrotask(() => {
      setPhotos(cleInitiales ? cleInitiales.split("\n") : []);
      setMessage(null);
    });
  }, [cleInitiales]);

  const modifie = photos.join("\n") !== cleInitiales;

  function ajouter(url: string) {
    setPhotos((p) => (p.includes(url) ? p : [...p, url]));
  }

  function deplacer(index: number, sens: -1 | 1) {
    setPhotos((p) => {
      const cible = index + sens;
      if (cible < 0 || cible >= p.length) return p;
      const suivant = [...p];
      [suivant[index], suivant[cible]] = [suivant[cible], suivant[index]];
      return suivant;
    });
  }

  function definirPrincipale(index: number) {
    setPhotos((p) => [p[index], ...p.filter((_, i) => i !== index)]);
  }

  async function importer(fichier: File) {
    setMessage(null);
    setEnvoi(true);
    try {
      const resultat = await importerImage(fichier);
      if (!resultat.ok) {
        const texte =
          resultat.raison === "type" ? ts("importType")
          : resultat.raison === "taille" ? ts("importTaille")
          : resultat.raison === "api" ? apiErrorMessage(resultat.json, ts("importErreur"))
          : resultat.raison === "reseau" ? apiErrorMessage({ code: "network" })
          : ts("importErreur");
        setMessage({ ok: false, texte });
        return;
      }
      const publication = await publierImage(resultat.id);
      if (!publication.ok) {
        setMessage({ ok: false, texte: apiErrorMessage(publication.json, ts("publicationErreur")) });
        return;
      }
      ajouter(publication.url);
    } finally {
      setEnvoi(false);
    }
  }

  async function enregistrer() {
    setEnregistrement(true);
    setMessage(null);
    const resultat = await onEnregistrer(photos);
    setEnregistrement(false);
    setMessage(resultat.ok ? { ok: true, texte: t("enregistre") } : { ok: false, texte: resultat.message });
  }

  if (!disponible) {
    return <p className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-sm text-[var(--warning)]">{indisponibleMessage ?? t("indisponible")}</p>;
  }

  const bouton =
    "rounded-lg border border-[var(--border-strong)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-2)] disabled:opacity-50";
  const petitBouton =
    "rounded-md border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] transition hover:text-[var(--text-primary)] disabled:opacity-30";

  return (
    <div className="flex flex-col gap-3">
      {photos.length === 0 ? (
        <p className="text-sm text-[var(--text-faint)]">{t("vide")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((url, index) => (
            <li key={url} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-2)]">
              <div className="relative aspect-square bg-[var(--bg-sunken)]">
                {/* Copie publique (Dropvio) ou photo fournisseur : aperçu <img> volontaire. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                {index === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-semibold text-white">{t("principale")}</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 p-1.5">
                <button type="button" onClick={() => deplacer(index, -1)} disabled={index === 0} aria-label={t("monter")} className={petitBouton}>↑</button>
                <button type="button" onClick={() => deplacer(index, 1)} disabled={index === photos.length - 1} aria-label={t("descendre")} className={petitBouton}>↓</button>
                {index > 0 && (
                  <button type="button" onClick={() => definirPrincipale(index)} className={petitBouton}>{t("definirPrincipale")}</button>
                )}
                <button type="button" onClick={() => setPhotos((p) => p.filter((_, i) => i !== index))} className={`${petitBouton} ml-auto text-[var(--danger)]`}>
                  {t("retirer")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setMediatheque(true)} className={bouton}>{t("depuisMediatheque")}</button>
        <button type="button" onClick={() => champFichier.current?.click()} disabled={envoi} className={bouton}>
          {envoi ? ts("importEnCours") : t("depuisOrdinateur")}
        </button>
        <input
          ref={champFichier}
          type="file"
          accept={MEDIA_MIMES.join(",")}
          className="hidden"
          onChange={(event) => {
            const fichier = event.target.files?.[0];
            event.target.value = "";
            if (fichier) void importer(fichier);
          }}
        />
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={!modifie || enregistrement || envoi}
          className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
        >
          {enregistrement ? t("enregistrement") : t("enregistrer")}
        </button>
      </div>
      {modifie && <p className="text-[11px] text-[var(--text-faint)]">{t("nonEnregistre")}</p>}
      {message && <p className={`text-xs ${message.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{message.texte}</p>}

      {mediatheque && (
        <MediathequeModal
          plan={plan}
          onChoisir={(url) => {
            ajouter(url);
            setMediatheque(false);
          }}
          onFermer={() => setMediatheque(false)}
        />
      )}
    </div>
  );
}
