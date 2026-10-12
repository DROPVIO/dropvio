"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";

export type BoutiqueReglable = {
  id: string;
  nom: string;
  slug: string;
  est_publique: boolean;
};

type Props = {
  boutique: BoutiqueReglable;
  produitsCount: number;
  onUpdated: (patch: Partial<BoutiqueReglable>) => void;
};

// Réglages de la boutique : visibilité publique.
export default function BoutiqueReglages({ boutique, produitsCount, onUpdated }: Props) {
  const t = useTranslations("siteBuilder.boutique.reglages");
  const apiErrorMessage = useApiErrorMessage();

  const [visibiliteEnCours, setVisibiliteEnCours] = useState(false);
  const [visibiliteErreur, setVisibiliteErreur] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const res = await fetch(`/api/boutiques/${boutique.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, message: apiErrorMessage(json) };
      return { ok: true };
    } catch {
      return { ok: false, message: apiErrorMessage(null, "network") };
    }
  }

  async function basculerVisibilite() {
    const rendrePublique = !boutique.est_publique;
    setVisibiliteErreur(null);
    if (rendrePublique) {
      if (produitsCount < 1) {
        setVisibiliteErreur(t("visibilite.produitRequis"));
        return;
      }
      if (!window.confirm(t("visibilite.confirmerPublier", { slug: boutique.slug }))) return;
    } else if (!window.confirm(t("visibilite.confirmerMasquer"))) {
      return;
    }
    setVisibiliteEnCours(true);
    const res = await patch({ est_publique: rendrePublique });
    setVisibiliteEnCours(false);
    if (!res.ok) {
      setVisibiliteErreur(res.message);
      return;
    }
    onUpdated({ est_publique: rendrePublique });
  }

  return (
    <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("visibilite.titre")}</h3>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={boutique.est_publique}
          onClick={() => void basculerVisibilite()}
          disabled={visibiliteEnCours}
          className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${
            boutique.est_publique ? "bg-[var(--success)]" : "bg-[var(--surface-3)]"
          }`}
        >
          <span className="sr-only">{t("visibilite.titre")}</span>
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
              boutique.est_publique ? "left-6" : "left-1"
            }`}
          />
        </button>
        <span className="text-sm font-semibold text-[var(--text-primary)]">
          {boutique.est_publique ? t("visibilite.publique") : t("visibilite.privee")}
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {boutique.est_publique ? t("visibilite.aidePublique") : t("visibilite.aidePrivee")}
      </p>
      {visibiliteErreur ? <p className="mt-2 text-sm text-[var(--danger)]">{visibiliteErreur}</p> : null}
    </div>
  );
}
