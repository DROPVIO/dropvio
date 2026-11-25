"use client";

import { useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { LienQuotaEpuise } from "@/components/studio/GenerateurMedia";
import { MessageEtatOutil, outilDisponible, useEtatOutil, useMessagePause } from "@/components/studio/EtatOutil";
import { useLotImages } from "@/components/studio/useLotImages";
import { MEDIA_FORMATS, type MediaFormat } from "@/lib/media/constantes";
import { generationDisponible } from "@/lib/media/config";
import { FORMAT_DEFAUT_IMAGES_PRODUITS, eligibiliteProduit } from "@/lib/media/images-produits";
import { planifierLot, type PlanLot } from "@/lib/media/quota-images-regles";
import { imagesPossibles, lireQuotaEtOutil, type EtatOutilClient, type QuotaImagesClient } from "@/lib/media/quota-images";
import { associerAuProduitBoutique } from "@/lib/media/associer-client";
import type { Plan } from "@/lib/plan-limits";
import { useApiErrorMessage } from "@/lib/use-api-error";

export type ProduitGeneration = { id: string; nom: string | null; description?: string | null; image_urls: unknown };

type Preparation = {
  eligibles: ProduitGeneration[];
  ignores: number;
  quota: QuotaImagesClient | null;
  outil: EtatOutilClient | null;
  lot: PlanLot;
};

// Outil décompté pour les pauses par outil (lib/pauses-outils.ts).
const OUTIL = "boutique_images_produits" as const;

/** Génération des images de tous les produits d'une boutique à partir d'une consigne (même
 *  génération que le Studio IA : chaque image est rattachée à son produit dans la médiathèque).
 *  Le coût estimé est comparé au quota du mois AVANT de commencer ; la génération s'arrête dès que
 *  le quota est épuisé, et le serveur refuse toute image au-delà. */
export default function GenerationImagesBoutique({
  boutiqueId,
  plan,
  chargerProduits,
  onTermine,
}: {
  boutiqueId: string;
  plan: Plan | null;
  chargerProduits: () => Promise<ProduitGeneration[]>;
  onTermine: () => Promise<void> | void;
}) {
  const t = useTranslations("siteBuilder.boutique.gestion.imagesIa");
  const tNav = useTranslations("dashboard.nav");
  const format = useFormatter();
  const apiErrorMessage = useApiErrorMessage();
  const lot = useLotImages();

  const [consigne, setConsigne] = useState("");
  const [formatImage, setFormatImage] = useState<MediaFormat>(FORMAT_DEFAUT_IMAGES_PRODUITS);
  const [preparation, setPreparation] = useState<Preparation | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [produitsLances, setProduitsLances] = useState<ProduitGeneration[]>([]);
  const [ajout, setAjout] = useState<{ faits: number; total: number; erreurs: number } | null>(null);
  const [ajoutEnCours, setAjoutEnCours] = useState(false);
  const [actualisationOutil, setActualisationOutil] = useState(0);
  const { etat: etatOutil } = useEtatOutil(OUTIL, actualisationOutil);
  const messagePause = useMessagePause();

  if (plan === null) return null;
  if (!generationDisponible(plan)) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
        <p className="font-semibold text-[var(--text-primary)]">{t("titre")}</p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          {t("reservePayant")}{" "}
          <Link href="/abonnement" className="font-semibold text-[var(--accent-text)] hover:underline">{t("voirPlans")}</Link>
        </p>
      </div>
    );
  }

  async function preparer() {
    setErreur(null);
    setAjout(null);
    setChargement(true);
    try {
      const [produits, { quota, outil }] = await Promise.all([chargerProduits(), lireQuotaEtOutil(OUTIL)]);
      const eligibles = produits.filter((p) => eligibiliteProduit({ id: p.id, nom: p.nom, description: p.description ?? null, image_urls: p.image_urls }).ok);
      setPreparation({
        eligibles,
        ignores: produits.length - eligibles.length,
        quota,
        outil,
        // Images possibles : le plus petit du quota du mois et des crédits de l'outil.
        lot: planifierLot(eligibles.length, 1, imagesPossibles(quota, outil), quota?.coutImageEur ?? 0),
      });
    } catch {
      setErreur(t("erreurChargement"));
    } finally {
      setChargement(false);
    }
  }

  async function lancer(nombre: number) {
    if (!preparation) return;
    const cibles = preparation.eligibles.slice(0, nombre);
    setProduitsLances(cibles);
    setPreparation(null);
    await lot.lancer(
      cibles.map((p) => ({
        cle: p.id,
        corps: { produitId: p.id, format: formatImage, outil: OUTIL, ...(consigne.trim() ? { consigne: consigne.trim() } : {}) },
      })),
      1
    );
    setActualisationOutil((n) => n + 1);
  }

  const produitsAvecImages = produitsLances.filter((p) => (lot.images[p.id] ?? []).length > 0);
  const imagesGenerees = produitsAvecImages.reduce((n, p) => n + (lot.images[p.id]?.length ?? 0), 0);

  async function ajouterAuxFiches() {
    setAjoutEnCours(true);
    let faits = 0;
    let erreurs = 0;
    setAjout({ faits, total: produitsAvecImages.length, erreurs });
    for (const produit of produitsAvecImages) {
      const ids = (lot.images[produit.id] ?? []).map((i) => i.id);
      const actuelles = Array.isArray(produit.image_urls) ? (produit.image_urls as unknown[]).filter((u): u is string => typeof u === "string") : [];
      const resultat = await associerAuProduitBoutique(boutiqueId, produit.id, actuelles, ids);
      if (resultat.ok) {
        lot.oublierImages(produit.id, ids);
        faits++;
      } else {
        erreurs++;
        if (erreurs === 1) setErreur(apiErrorMessage(resultat.json, t("erreurAjout")));
      }
      setAjout({ faits, total: produitsAvecImages.length, erreurs });
    }
    setAjoutEnCours(false);
    await onTermine();
  }

  const champ = "rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500";

  return (
    <div className="flex w-full flex-col gap-2.5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm">
      <div>
        <p className="font-semibold text-[var(--text-primary)]">{t("titre")}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{t("aide")}</p>
      </div>

      <fieldset disabled={lot.enCours || chargement || ajoutEnCours} className="flex flex-col gap-2">
        <textarea
          value={consigne}
          onChange={(e) => setConsigne(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={t("consignePlaceholder")}
          aria-label={t("consigne")}
          className={`${champ} resize-none`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <select value={formatImage} onChange={(e) => setFormatImage(e.target.value as MediaFormat)} aria-label={t("format")} className={champ}>
            {(Object.keys(MEDIA_FORMATS) as MediaFormat[]).map((f) => (
              <option key={f} value={f}>{t(`format_${f}`)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void preparer()}
            className="rounded-xl bg-violet-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
          >
            {chargement ? t("calcul") : t("preparer")}
          </button>
        </div>
      </fieldset>

      {preparation && !lot.enCours && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs" aria-live="polite">
          <p className="text-[var(--text-primary)]">
            {t("estimation", {
              produits: preparation.eligibles.length,
              images: preparation.lot.images,
              eur: format.number(preparation.lot.coutEur, { style: "currency", currency: "EUR" }),
            })}
            {preparation.quota && ` ${t("restantes", { restantes: preparation.quota.imagesRestantes })}`}
          </p>
          {preparation.ignores > 0 && <p className="text-[var(--text-faint)]">{t("ignores", { count: preparation.ignores })}</p>}
          {!outilDisponible(preparation.outil) ? (
            <MessageEtatOutil etat={preparation.outil} />
          ) : preparation.eligibles.length === 0 ? (
            <p className="text-[var(--warning-text)]">{t("aucunEligible")}</p>
          ) : preparation.lot.couvert ? (
            <button type="button" onClick={() => void lancer(preparation.eligibles.length)} className="self-start rounded-lg bg-violet-600 px-3 py-1.5 font-semibold text-white transition hover:bg-violet-500">
              {t("lancer", { produits: preparation.eligibles.length })}
            </button>
          ) : preparation.lot.produitsPossibles > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-[var(--warning-text)]">
              <span>{t("depasse", { possibles: preparation.lot.imagesPossibles, total: preparation.lot.images })}</span>
              <button
                type="button"
                onClick={() => void lancer(preparation.lot.produitsPossibles)}
                className="rounded-lg border border-[var(--warning)]/40 px-2.5 py-1 font-semibold transition hover:bg-[var(--warning)]/10"
              >
                {t("genererSeulement", { produits: preparation.lot.produitsPossibles })}
              </button>
            </div>
          ) : (
            <p className="text-[var(--warning-text)]">
              {t("quotaEpuise")}
              {preparation.quota?.source === "expert" && <Link href="/quota" className="ml-1 underline">{tNav("itemQuota")}</Link>}
            </p>
          )}
        </div>
      )}

      {!preparation && !lot.enCours && <MessageEtatOutil etat={etatOutil} />}

      {lot.enCours && (
        <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]" aria-live="polite">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          <span className="font-semibold text-[var(--text-primary)]">{t("progression", { faits: lot.traites, total: lot.total })}</span>
          <button type="button" onClick={lot.arreter} className="rounded-lg border border-[var(--border-strong)] px-2.5 py-1 font-semibold text-[var(--text-primary)]">
            {t("arreter")}
          </button>
        </div>
      )}

      {!lot.enCours && produitsLances.length > 0 && (
        <div className="flex flex-col gap-1.5 text-xs" aria-live="polite">
          {lot.arret ? (
            <p role="alert" className="text-[var(--danger-text)]">
              {lot.arret.raison === "pause"
                ? `${lot.arret.finPause ? messagePause(lot.arret.finPause) : ""} ${t("arretUtilisateur", { traites: lot.arret.traites, total: lot.arret.total })}`
                : lot.arret.raison === "quota"
                ? t("arretQuota", { traites: lot.arret.traites, total: lot.arret.total })
                : lot.arret.raison === "utilisateur"
                  ? t("arretUtilisateur", { traites: lot.arret.traites, total: lot.arret.total })
                  : t("arretBloquant", { traites: lot.arret.traites, total: lot.arret.total, message: lot.arret.message ?? "" })}
              <LienQuotaEpuise code={lot.codeArret} />
            </p>
          ) : (
            <p className="text-[var(--success-text)]">{t("termine", { traites: lot.traites, total: lot.total })}</p>
          )}
          {imagesGenerees > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[var(--text-muted)]">{t("generees", { images: imagesGenerees, produits: produitsAvecImages.length })}</span>
              <button
                type="button"
                onClick={() => void ajouterAuxFiches()}
                disabled={ajoutEnCours}
                className="rounded-lg bg-violet-600 px-3 py-1.5 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-50"
              >
                {ajoutEnCours ? t("ajoutEnCours") : t("ajouterAuxFiches")}
              </button>
            </div>
          )}
          {ajout && (
            <p className="text-[var(--text-muted)]">
              {t("ajoutProgression", { faits: ajout.faits, total: ajout.total })}
              {ajout.erreurs > 0 && ` ${t("ajoutErreurs", { count: ajout.erreurs })}`}
            </p>
          )}
        </div>
      )}

      {erreur && <p className="text-xs text-[var(--danger-text)]">{erreur}</p>}
    </div>
  );
}
