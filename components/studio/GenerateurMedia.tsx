"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MEDIA_FORMATS, MEDIA_PROMPT_MAX, type Media, type MediaFormat } from "@/lib/media/constantes";
import { generationDisponible, mentionGenerateur } from "@/lib/media/config";
import type { Plan } from "@/lib/plan-limits";
import type { OutilIa } from "@/lib/pauses-outils";
import { useApiErrorMessage } from "@/lib/use-api-error";
import { MessageEtatOutil, outilDisponible, useEtatOutil, useMessagePause } from "./EtatOutil";
import MediathequeGrille from "./MediathequeGrille";
import { BOUTON_FORMAT, BOUTON_PRIMAIRE, BOUTON_SECONDAIRE } from "./styles";

/** Lien d'action quand le quota du mois est épuisé : crédits pour Expert, plans sinon. */
export function LienQuotaEpuise({ code }: { code: unknown }) {
  const tNav = useTranslations("dashboard.nav");
  if (code === "expert_quota_images") return <Link href="/quota" className="ml-1 underline">{tNav("itemQuota")}</Link>;
  return null;
}

/** Mention « Généré avec … » sous un générateur : fournisseur et inclusion viennent de
 *  lib/media/config.ts, la même table que celle qui choisit le fournisseur appelé. */
export function MentionGenerateur({ plan }: { plan: Plan }) {
  const t = useTranslations("studio");
  const mention = mentionGenerateur(plan);
  if (!mention) return null;
  const cle = mention.inclus === null ? "mention" : mention.inclus ? "mentionInclus" : "mentionFacture";
  return <p className="text-xs text-[var(--text-faint)]">{t(cle, { fournisseur: mention.fournisseur })}</p>;
}

/** Générateur d'images commun (prompt, format, mention du fournisseur), utilisé par Studio IA et
 *  par la médiathèque de l'éditeur de boutique. Ne rend rien si ce plan n'a pas de générateur.
 *  `referenceAutorisee` (Studio IA) : une image de la médiathèque peut servir de référence. Elle
 *  s'ajoute ici, dans les Réglages : choisir une image dans la médiathèque seule ne lance rien. */
export default function GenerateurMedia({
  plan,
  onGenere,
  referenceAutorisee = false,
  outil = "studio_prompt_libre",
}: {
  plan: Plan;
  onGenere: (id: string) => void;
  referenceAutorisee?: boolean;
  /** Outil décompté (pauses par outil, lib/pauses-outils.ts). */
  outil?: OutilIa;
}) {
  const t = useTranslations("studio");
  const apiErrorMessage = useApiErrorMessage();
  const [prompt, setPrompt] = useState("");
  const [format, setFormat] = useState<MediaFormat>("carre");
  const [generation, setGeneration] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [codeErreur, setCodeErreur] = useState<unknown>(null);
  const [reference, setReference] = useState<Media | null>(null);
  const [choixReference, setChoixReference] = useState(false);
  const [actualisationOutil, setActualisationOutil] = useState(0);
  const { etat: etatOutil } = useEtatOutil(outil, actualisationOutil);
  const messagePause = useMessagePause();

  if (!generationDisponible(plan)) return null;

  async function generer() {
    setErreur(null);
    setCodeErreur(null);
    setGeneration(true);
    try {
      const res = await fetch("/api/media/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, format, outil, ...(reference ? { referenceMediaId: reference.id } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || typeof json?.id !== "string") {
        // Réponse sans code reconnu (délai dépassé, page d'erreur de l'hébergeur) : le service
        // n'a pas répondu, ce n'est pas le prompt.
        const reprise = Number(json?.values?.reprise);
        setErreur(
          json?.code === "outil_en_pause" && Number.isFinite(reprise)
            ? messagePause(reprise)
            : apiErrorMessage(json, apiErrorMessage({ code: "media_service_indisponible" }))
        );
        setCodeErreur(json?.code ?? null);
        return;
      }
      setPrompt("");
      onGenere(json.id);
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setGeneration(false);
      setActualisationOutil((n) => n + 1);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm text-[var(--text-muted)]">
        {t("prompt")}
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          maxLength={MEDIA_PROMPT_MAX}
          rows={4}
          placeholder={t("promptExemple")}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:border-[var(--accent)] focus:outline-none"
        />
      </label>
      {referenceAutorisee && (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-[var(--text-muted)]">{t("reference")}</span>
          {reference ? (
            <div className="flex items-center gap-3">
              <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-sunken)]">
                {reference.url && (
                  // URL signée de la médiathèque, aperçu ponctuel.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reference.url} alt="" className="h-full w-full object-cover" />
                )}
              </span>
              <button type="button" onClick={() => setReference(null)} className="text-xs font-semibold text-[var(--danger)]">
                {t("referenceRetirer")}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setChoixReference(true)} className={`${BOUTON_SECONDAIRE} self-start`}>
              {t("referenceAjouter")}
            </button>
          )}
          <p className="text-xs text-[var(--text-faint)]">{t("referenceAide")}</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("format")}>
        {(Object.keys(MEDIA_FORMATS) as MediaFormat[]).map((valeur) => (
          <button
            key={valeur}
            type="button"
            aria-pressed={format === valeur}
            onClick={() => setFormat(valeur)}
            className={BOUTON_FORMAT(format === valeur)}
          >
            {t(`format_${valeur}`)}
          </button>
        ))}
      </div>
      {erreur && (
        <p role="alert" className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {erreur}
          <LienQuotaEpuise code={codeErreur} />
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="button"
          disabled={generation || prompt.trim().length < 3 || !outilDisponible(etatOutil)}
          onClick={() => void generer()}
          className={BOUTON_PRIMAIRE}
        >
          {generation ? t("generationEnCours") : t("generer")}
        </button>
        <MentionGenerateur plan={plan} />
      </div>
      <MessageEtatOutil etat={etatOutil} />
      {choixReference && (
        <div role="dialog" aria-modal="true" aria-label={t("referenceAjouter")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("referenceAjouter")}</h2>
              <button type="button" onClick={() => setChoixReference(false)} className="text-sm text-[var(--text-muted)]">{t("fermer")}</button>
            </div>
            <MediathequeGrille
              vueInitiale="import"
              onChoisir={(media) => {
                setReference(media);
                setChoixReference(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
