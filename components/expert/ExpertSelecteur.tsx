"use client";

import { useTranslations } from "next-intl";
import { useLibelleModele } from "./useLibelleModele";
import {
  EXPERT_MEDIAS_EN_VENTE,
  EXPERT_MODELS,
  IMAGES_MAX,
  clampSelection,
  expertRechargePrice,
  plafondSites,
  type ExpertModel,
  type ExpertSelection,
} from "@/lib/expert-pricing";

function Curseur({ label, value, max, prix, onChange }: { label: string; value: number; max: number; prix: string; onChange: (value: number) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm text-[var(--text-primary)]">
      <span className="flex items-center justify-between gap-4">
        <span>{label} : <strong>{value}</strong></span>
        <span className="text-xs text-[var(--text-muted)]">{prix}</span>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-[var(--accent)]"
      />
    </label>
  );
}

// Curseurs et prix en direct des crédits. Le montant affiché n'est qu'un aperçu : le serveur
// le recalcule à partir de la sélection.
export default function ExpertSelecteur({ selection, onChange }: { selection: ExpertSelection; onChange: (selection: ExpertSelection) => void }) {
  const t = useTranslations("quota");
  const libelleModele = useLibelleModele();
  const prix = expertRechargePrice(selection);
  const euros = (montant: number) => `${montant.toFixed(2).replace(".", ",")} €`;
  const modifier = (changement: Partial<ExpertSelection>) => onChange(clampSelection({ ...selection, ...changement }));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(Object.keys(EXPERT_MODELS) as ExpertModel[]).map((model) => (
          <button
            key={model}
            type="button"
            aria-pressed={selection.model === model}
            onClick={() => modifier({ model })}
            className={`rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${
              selection.model === model
                ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
            }`}
          >
            {libelleModele(model)}
          </button>
        ))}
      </div>
      <Curseur label={t("sites")} value={selection.sites} max={plafondSites(selection.model)} prix={euros(prix.sites)} onChange={(sites) => modifier({ sites })} />
      {EXPERT_MEDIAS_EN_VENTE && (
        <Curseur label={t("images")} value={selection.images} max={IMAGES_MAX} prix={euros(prix.images)} onChange={(images) => modifier({ images })} />
      )}
      <p className="flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm font-semibold text-[var(--text-primary)]">
        <span>{t("total")}</span>
        <span>{euros(prix.total)}</span>
      </p>
    </div>
  );
}
