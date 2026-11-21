"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import GenerateurMedia from "./GenerateurMedia";
import MediathequeGrille from "./MediathequeGrille";
import type { Media } from "@/lib/media/constantes";
import { generationDisponible } from "@/lib/media/config";
import type { Plan } from "@/lib/plan-limits";
import { useApiErrorMessage } from "@/lib/use-api-error";

// Choix d'une image pour une boutique : la copie publique est créée ici, seule URL stable
// utilisable sur une page publique. Si le plan le permet, un visuel peut aussi être généré ici
// (même générateur que Studio IA) : il est publié et inséré directement.
export default function MediathequeModal({ plan, onChoisir, onFermer }: { plan?: Plan | null; onChoisir: (url: string) => void; onFermer: () => void }) {
  const t = useTranslations("studio");
  const apiErrorMessage = useApiErrorMessage();
  const [erreur, setErreur] = useState<string | null>(null);
  const [publication, setPublication] = useState(false);

  async function choisir(media: Pick<Media, "id">) {
    setErreur(null);
    setPublication(true);
    try {
      const res = await fetch(`/api/media/${media.id}/publier`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setErreur(apiErrorMessage(json, t("publicationErreur")));
        setPublication(false);
        return;
      }
      onChoisir(json.url);
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
      setPublication(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t("titreModal")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-4 overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg)] p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{t("titreModal")}</h2>
          <button type="button" onClick={onFermer} className="text-sm text-[var(--text-muted)]">{t("fermer")}</button>
        </div>
        {erreur && <p role="alert" className="text-sm text-[var(--danger)]">{erreur}</p>}
        {publication ? (
          <p className="py-8 text-center text-sm text-[var(--text-faint)]">{t("publication")}</p>
        ) : (
          <>
            {plan && generationDisponible(plan) ? (
              <section className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("genererTitre")}</h3>
                <GenerateurMedia plan={plan} onGenere={(id) => void choisir({ id })} />
              </section>
            ) : null}
            {plan && generationDisponible(plan) ? <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("choisirTitre")}</h3> : null}
            <MediathequeGrille onChoisir={(media) => void choisir(media)} />
          </>
        )}
      </div>
    </div>
  );
}
