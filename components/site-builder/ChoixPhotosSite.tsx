"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import MediathequeModal from "@/components/studio/MediathequeModal";
import { MessageEtatOutil, useEtatOutil } from "@/components/studio/EtatOutil";
import { IMAGE_PRICE_EUR } from "@/lib/expert-pricing";
import { generationDisponible } from "@/lib/media/config";
import { coutImagesSite, etatCaseImages } from "@/lib/media/images-site";
import {
  NOMBRE_PHOTOS_SITE_MAX,
  SOURCES_PHOTOS_SITE,
  bornerNombrePhotos,
  sourceAvecNombre,
  type SourcePhotosSite,
} from "@/lib/media/photos-site";
import type { Plan } from "@/lib/plan-limits";

export type ChoixPhotos = {
  source: SourcePhotosSite;
  nombre: number;
  /** URLs publiques choisies dans la médiathèque. */
  choisies: string[];
  /** Adresses saisies pour la source « liens », une par photo. */
  liens: string[];
};

/** Choix des photos du site (Site Builder) : source et nombre. Remplace la case « Générer des
 *  images avec OpenAI » — la génération IA n'est plus qu'une source parmi d'autres, jamais
 *  sélectionnée par défaut. */
export default function ChoixPhotosSite({
  plan,
  imagesRestantes,
  valeur,
  onChange,
  modeBoutique,
  aPhotoProduit,
}: {
  plan: Plan | null;
  imagesRestantes: number | null;
  valeur: ChoixPhotos;
  onChange: (valeur: ChoixPhotos) => void;
  modeBoutique: boolean;
  aPhotoProduit: boolean;
}) {
  const t = useTranslations("siteBuilder.builder.photos");
  const tIa = useTranslations("siteBuilder.builder.imagesOpenAI");
  const format = useFormatter();
  const [mediathequeOuverte, setMediathequeOuverte] = useState(false);
  // Pauses par outil : images générées avec le site = outil « landing_page ».
  const { etat: etatOutil } = useEtatOutil("landing_page");

  const { source, choisies, liens } = valeur;
  const nombre = bornerNombrePhotos(valeur.nombre);
  const iaPossible = plan !== null && generationDisponible(plan);
  const etatIa = plan !== null ? etatCaseImages(plan, imagesRestantes, nombre) : null;
  const champ =
    "rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-violet-500";

  function maj(patch: Partial<ChoixPhotos>) {
    onChange({ ...valeur, ...patch });
  }

  function aide(): string {
    switch (source) {
      case "produit":
        if (modeBoutique) return t("aideProduitBoutique");
        return aPhotoProduit ? t("aideProduit") : t("aideProduitAbsente");
      case "mediatheque":
        return t("aideMediatheque", { max: nombre });
      case "liens":
        return t("aideLiens");
      case "aucune":
        return t("aideAucune");
      case "ia":
        return "";
    }
  }

  return (
    <div className="mb-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-semibold text-[var(--text-primary)]">📷 {t("titre")}</span>
        <select
          value={source}
          onChange={(e) => maj({ source: e.target.value as SourcePhotosSite })}
          aria-label={t("source")}
          className={champ}
        >
          {SOURCES_PHOTOS_SITE.map((s) => (
            <option key={s} value={s} disabled={s === "ia" && !iaPossible}>
              {s === "ia" && !iaPossible ? t("sources.iaPlan") : t(`sources.${s}`)}
            </option>
          ))}
        </select>
        {sourceAvecNombre(source) && (
          <label className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            {t("nombre")}
            <select
              value={nombre}
              onChange={(e) => {
                const n = bornerNombrePhotos(Number(e.target.value));
                maj({ nombre: n, choisies: choisies.slice(0, n), liens: liens.slice(0, n) });
              }}
              className={champ}
            >
              {Array.from({ length: NOMBRE_PHOTOS_SITE_MAX }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="text-[var(--text-faint)]">{t("max", { max: NOMBRE_PHOTOS_SITE_MAX })}</span>
          </label>
        )}
      </div>

      {source === "mediatheque" && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {choisies.map((url) => (
            <span key={url} className="relative h-10 w-10 overflow-hidden rounded-lg border border-[var(--border)]">
              {/* Copie publique de la médiathèque, aperçu ponctuel : <img> suffit. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => maj({ choisies: choisies.filter((u) => u !== url) })}
                aria-label={t("retirer")}
                className="absolute right-0 top-0 h-4 w-4 rounded-full bg-black/70 text-[10px] leading-4 text-white"
              >
                ×
              </button>
            </span>
          ))}
          {choisies.length < nombre && (
            <button
              type="button"
              onClick={() => setMediathequeOuverte(true)}
              className="rounded-lg border border-dashed border-[var(--border-strong)] px-2 py-1 text-xs font-semibold text-[var(--text-muted)] transition hover:border-violet-500/50 hover:text-[var(--text-primary)]"
            >
              {t("choisir", { count: choisies.length, max: nombre })}
            </button>
          )}
        </div>
      )}

      {source === "liens" && (
        <div className="mt-1.5 grid gap-1.5 sm:grid-cols-3">
          {Array.from({ length: nombre }, (_, i) => (
            <input
              key={i}
              type="url"
              value={liens[i] ?? ""}
              onChange={(e) => {
                const suivants = [...liens];
                suivants[i] = e.target.value;
                maj({ liens: suivants.slice(0, nombre) });
              }}
              placeholder={t("lienPlaceholder", { index: i + 1 })}
              aria-label={t("lienPlaceholder", { index: i + 1 })}
              className={`${champ} w-full`}
            />
          ))}
        </div>
      )}

      <p className="mt-1 text-[11px] leading-snug text-[var(--text-faint)]" aria-live="polite">
        {source === "ia" && etatIa ? (
          !etatIa.active && etatIa.raison === "plan" ? (
            tIa("planExpert")
          ) : !etatIa.active && etatIa.raison === "quota" ? (
            <>
              {tIa("quotaInsuffisant", { images: etatIa.images, restantes: etatIa.restantes })}{" "}
              <Link href="/quota" className="underline">{tIa("recharger")}</Link>
            </>
          ) : (
            <>
              {tIa("cout", {
                images: nombre,
                eur: format.number(coutImagesSite(IMAGE_PRICE_EUR, nombre).eur, { style: "currency", currency: "EUR" }),
              })}
              {etatIa.active && etatIa.restantes !== null && ` ${tIa("restantes", { restantes: etatIa.restantes })}`}
            </>
          )
        ) : (
          aide()
        )}
      </p>
      {source === "ia" && <MessageEtatOutil etat={etatOutil} />}
      <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-muted)]">ℹ️ {t("mentionCatalogue")}</p>

      {mediathequeOuverte && (
        <MediathequeModal
          plan={plan}
          onChoisir={(url) => {
            if (!choisies.includes(url)) maj({ choisies: [...choisies, url].slice(0, nombre) });
            setMediathequeOuverte(false);
          }}
          onFermer={() => setMediathequeOuverte(false)}
        />
      )}
    </div>
  );
}
