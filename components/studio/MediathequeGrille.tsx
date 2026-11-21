"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { MEDIA_MIMES, type Media } from "@/lib/media/constantes";
import { importerImage } from "@/lib/media/importer-client";
import { useApiErrorMessage } from "@/lib/use-api-error";
import { SELECTEUR, SELECTEUR_BOUTON } from "./styles";

export type VueMediatheque = "generation" | "import";

type Stockage = { utilise: number; max: number; vue: number | null };
type PageMedias = { medias: Media[]; stockage: Stockage; suivant: boolean };

async function lirePage(vue: VueMediatheque, numero: number): Promise<{ ok: boolean; json: PageMedias | null }> {
  const res = await fetch(`/api/media?origine=${vue}&page=${numero}`);
  return { ok: res.ok, json: await res.json().catch(() => null) };
}

function enMo(octets: number): string {
  return (octets / (1024 * 1024)).toFixed(octets < 1024 * 1024 * 10 ? 1 : 0).replace(".", ",");
}

// Médiathèque partagée par le Studio, le choix d'image du mode boutique et le Catalogue, en deux
// vues : images créées avec Dropvio (générées dans le Studio IA) et images importées (envoyées
// par l'utilisateur, utilisables comme référence). Avec onChoisir, un clic sur une image la
// sélectionne au lieu d'afficher seulement ses actions.
export default function MediathequeGrille({
  onChoisir,
  actualisation = 0,
  vueInitiale = "generation",
}: {
  onChoisir?: (media: Media) => void;
  actualisation?: number;
  vueInitiale?: VueMediatheque;
}) {
  const t = useTranslations("studio");
  const apiErrorMessage = useApiErrorMessage();
  const champFichier = useRef<HTMLInputElement>(null);

  const [vue, setVue] = useState<VueMediatheque>(vueInitiale);
  const [medias, setMedias] = useState<Media[]>([]);
  const [stockage, setStockage] = useState<Stockage | null>(null);
  const [suivant, setSuivant] = useState(false);
  const [page, setPage] = useState(1);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [information, setInformation] = useState<string | null>(null);

  // Une nouvelle image générée s'affiche dans la vue « créées avec Dropvio ».
  const derniereActualisation = useRef(actualisation);
  useEffect(() => {
    if (actualisation === derniereActualisation.current) return;
    derniereActualisation.current = actualisation;
    queueMicrotask(() => setVue("generation"));
  }, [actualisation]);

  const appliquer = useCallback(
    (numero: number, reponse: { ok: boolean; json: PageMedias | null }) => {
      const { ok, json } = reponse;
      if (!ok || !json) {
        setErreur(apiErrorMessage(json, t("chargementErreur")));
        return;
      }
      setMedias((actuels) => (numero === 1 ? json.medias : [...actuels, ...json.medias]));
      setStockage(json.stockage);
      setSuivant(json.suivant);
      setPage(numero);
    },
    [apiErrorMessage, t]
  );

  const charger = useCallback(async (numero: number) => appliquer(numero, await lirePage(vue, numero)), [appliquer, vue]);

  useEffect(() => {
    let annule = false;
    queueMicrotask(() => {
      if (annule) return;
      setChargement(true);
      setErreur(null);
      lirePage(vue, 1)
        .then((reponse) => {
          if (!annule) appliquer(1, reponse);
        })
        .catch(() => {
          if (!annule) setErreur(apiErrorMessage({ code: "network" }));
        })
        .finally(() => {
          if (!annule) setChargement(false);
        });
    });
    return () => {
      annule = true;
    };
  }, [appliquer, actualisation, apiErrorMessage, vue]);

  async function importer(fichier: File) {
    setErreur(null);
    setInformation(null);
    setEnvoi(true);
    const resultat = await importerImage(fichier);
    setEnvoi(false);
    if (resultat.ok) {
      await charger(1);
      return;
    }
    if (resultat.raison === "type") setErreur(t("importType"));
    else if (resultat.raison === "taille") setErreur(t("importTaille"));
    else if (resultat.raison === "api") setErreur(apiErrorMessage(resultat.json, t("importErreur")));
    else if (resultat.raison === "reseau") setErreur(apiErrorMessage({ code: "network" }));
    else setErreur(t("importErreur"));
  }

  async function supprimer(id: string) {
    setErreur(null);
    setInformation(null);
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setErreur(apiErrorMessage(json, t("suppressionErreur")));
      return;
    }
    if (json?.conserveeEnBoutique) setInformation(t("copieConservee"));
    await charger(1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t("vues")} className={`${SELECTEUR} self-start`}>
        {(["generation", "import"] as const).map((valeur) => (
          <button
            key={valeur}
            type="button"
            role="tab"
            aria-selected={vue === valeur}
            onClick={() => setVue(valeur)}
            className={SELECTEUR_BOUTON(vue === valeur)}
          >
            {t(valeur === "generation" ? "vueGenerees" : "vueImportees")}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-faint)]">
          {stockage
            ? t("stockageVue", { vue: enMo(stockage.vue ?? 0), utilise: enMo(stockage.utilise), max: enMo(stockage.max) })
            : "…"}
        </p>
        {vue === "import" && (
          <>
            <button
              type="button"
              disabled={envoi}
              onClick={() => champFichier.current?.click()}
              className="rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface)] disabled:opacity-50"
            >
              {envoi ? t("importEnCours") : t("importer")}
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
          </>
        )}
      </div>
      {vue === "import" && !onChoisir && <p className="-mt-2 text-xs text-[var(--text-faint)]">{t("aideImportees")}</p>}

      {erreur && <p role="alert" className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">{erreur}</p>}
      {information && <p role="status" className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-muted)]">{information}</p>}

      {chargement ? (
        <p className="py-8 text-center text-sm text-[var(--text-faint)]">{t("chargement")}</p>
      ) : medias.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-faint)]">{t(vue === "generation" ? "videGenerees" : "videImportees")}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {medias.map((media) => (
            <li key={media.id} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
              <button
                type="button"
                disabled={!onChoisir}
                aria-label={onChoisir ? t("choisir") : undefined}
                onClick={() => onChoisir?.(media)}
                className="relative block aspect-square w-full bg-[var(--bg-sunken)] enabled:hover:opacity-90"
              >
                {media.url && <Image src={media.url} alt={media.prompt ?? t("imageImportee")} fill unoptimized sizes="240px" className="object-cover" />}
              </button>
              <div className="flex items-center justify-between gap-2 p-2">
                <p className="truncate text-[11px] text-[var(--text-faint)]" title={media.prompt ?? undefined}>
                  {media.prompt ?? t("imageImportee")}
                </p>
                {!onChoisir && (
                  <button type="button" onClick={() => void supprimer(media.id)} className="shrink-0 text-xs font-semibold text-[var(--danger)]">
                    {t("supprimer")}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {suivant && (
        <button
          type="button"
          onClick={() => void charger(page + 1)}
          className="self-center rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)]"
        >
          {t("voirPlus")}
        </button>
      )}
    </div>
  );
}
