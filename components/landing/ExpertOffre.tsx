"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useLibelleModele } from "@/components/expert/useLibelleModele";
import {
  EXPERT_BASE_EUR,
  EXPERT_MEDIAS_EN_VENTE,
  EXPERT_MODELE_DEFAUT,
  EXPERT_MODELS,
  IMAGES_MAX,
  IMAGE_PRICE_EUR,
  calculerPrixExpert,
  lignesRecapExpert,
  changerModele,
  clampSelection,
  plafondSites,
  siteUnitPriceEur,
  type ExpertMode,
  type ExpertModel,
  type ExpertSelection,
} from "@/lib/expert-pricing";

// Plan Expert : carte de la grille tarifaire (landing) et configurateur (page /expert). Aucun
// tarif ni nom de modèle n'est écrit ici : tout vient de lib/expert-pricing.ts, le module que le
// Checkout utilise aussi. Les CTA mènent à l'inscription avec ?plan=expert ; aucun paiement
// n'est lancé depuis ces pages.

const MODELES = Object.keys(EXPERT_MODELS) as ExpertModel[];
const SELECTION_INITIALE: ExpertSelection = { model: EXPERT_MODELE_DEFAUT, sites: 10, images: 0 };

function useEuros() {
  const format = useFormatter();
  return (montant: number) =>
    format.number(montant, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: Number.isInteger(montant) ? 0 : 2,
      maximumFractionDigits: 2,
    });
}

/** Carte Expert de la grille tarifaire, sur le modèle des cartes Pro et Agency. */
export function ExpertCarte({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  const t = useTranslations("landing.pricing.expert");
  const tp = useTranslations("landing.pricing");
  const euros = useEuros();

  return (
    <div data-rv="up" style={style} className={`flex flex-col rounded-2xl border border-[#111] bg-[#111] p-6 text-white ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="m-0 text-lg font-semibold text-white">{t("nom")}</h3>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs font-semibold text-[#c4b5fd]">{t("badge")}</span>
      </div>
      <p className="m-0 mt-3 flex flex-wrap items-baseline gap-x-1.5 text-white">
        <span className="text-sm text-white/60">{t("aPartirDe")}</span>
        <span className="text-[34px] font-[650] tracking-[-0.03em]">{euros(EXPERT_BASE_EUR)}</span>
        <span className="text-sm text-white/60">{tp("perMonth")}</span>
      </p>
      <p className="m-0 mt-1 text-[13px] text-white/60">{t("note")}</p>

      <ul className="m-0 mt-5 flex list-none flex-col gap-2.5 p-0 text-sm leading-[1.45] text-white/85">
        {(t.raw("features") as string[]).map((f) => (
          <li key={f} className="flex gap-2.5">
            <span aria-hidden className="mt-[3px] text-[#a78bfa]">✓</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <Link
          href="/register?plan=expert"
          className="rounded-[10px] bg-white px-4 py-3 text-center text-sm font-semibold text-[#111] no-underline transition-colors hover:bg-[#ede9fe] hover:text-[#111]"
        >
          {t("cta")}
        </Link>
        <Link
          href="/expert"
          className="rounded-[10px] px-4 py-2 text-center text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline"
        >
          {t("decouvrir")}
        </Link>
      </div>
    </div>
  );
}

function Curseur({
  label,
  aide,
  valeur,
  ariaValeur,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  aide: string;
  valeur?: string;
  ariaValeur?: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const rempli = max > min ? ((value - min) / (max - min)) * 100 : 100;
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="text-sm font-semibold text-[#111]">
          {label}
        </label>
        <span className="dv-mono whitespace-nowrap text-sm font-semibold tabular-nums text-[#111]">{valeur ?? value}</span>
      </div>
      <input
        id={id}
        type="range"
        data-dv-range
        min={min}
        max={max}
        step={1}
        value={value}
        aria-valuetext={ariaValeur}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--rempli": `${rempli}%` } as React.CSSProperties}
      />
      <div className="flex justify-between text-xs text-[#777]">
        <span>{aide}</span>
        <span className="dv-mono tabular-nums">{max}</span>
      </div>
    </div>
  );
}

function Configurateur({ mode }: { mode: ExpertMode }) {
  const t = useTranslations("landing.pricing.expert");
  // Libellé sans nom de modèle (« Qualité standard », « Qualité avancée »).
  const libelleModele = useLibelleModele();
  const euros = useEuros();
  const nomRadio = useId();
  const [selection, setSelection] = useState<ExpertSelection>(SELECTION_INITIALE);
  const { total } = calculerPrixExpert(selection, mode);
  const abonnement = mode === "abonnement";
  const modifier = (changement: Partial<ExpertSelection>) => setSelection((s) => clampSelection({ ...s, ...changement }));

  const libelles = {
    agency: () => t("config.ligneAgency"),
    supplement: () => t("config.ligneSupplement"),
    sites: (quantite = 0) => t("config.ligneQuantite", { label: t("config.sites"), quantite }),
    images: (quantite = 0) => t("config.ligneQuantite", { label: t("config.images"), quantite }),
  };
  const lignes = lignesRecapExpert(selection, mode).map((ligne) => ({ label: libelles[ligne.cle](ligne.quantite), montant: ligne.montant }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-3 p-0 text-sm font-semibold text-[#111]">{t("config.modele")}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODELES.map((model) => {
              const actif = selection.model === model;
              return (
                <label
                  key={model}
                  className={`flex min-h-[56px] cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[#7c3aed] ${actif ? "border-[#7c3aed] bg-[#7c3aed]/[0.05]" : "border-[#e6e6e6] bg-white hover:border-[#c4b5fd]"}`}
                >
                  <input
                    type="radio"
                    name={nomRadio}
                    value={model}
                    checked={actif}
                    onChange={() => setSelection((s) => changerModele(s, model))}
                    className="mt-0.5 h-[18px] w-[18px] flex-none accent-[#7c3aed]"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-[#111]">{libelleModele(model)}</span>
                    <span className="text-xs text-[#666]">{t("config.plafond", { max: plafondSites(model) })}</span>
                  </span>
                </label>
              );
            })}
          </div>
          {abonnement ? (
            <p className="m-0 mt-3 flex items-start gap-2 text-xs leading-[1.5] text-[#555]">
              <span aria-hidden className="mt-px">🔒</span>
              <span>
                <strong className="font-semibold text-[#111]">{t("config.verrou")}.</strong> {t("config.verrouTexte")}
              </span>
            </p>
          ) : null}
        </fieldset>

        <Curseur
          label={t("config.sitesLibelle", { modele: libelleModele(selection.model) })}
          valeur={t("config.sitesValeur", { n: selection.sites, max: plafondSites(selection.model) })}
          ariaValeur={t("config.sitesAria", { n: selection.sites, max: plafondSites(selection.model), modele: libelleModele(selection.model) })}
          aide={t("config.sitesAide", { max: plafondSites(selection.model), prix: euros(siteUnitPriceEur(selection.model)) })}
          value={selection.sites}
          min={1}
          max={plafondSites(selection.model)}
          onChange={(sites) => modifier({ sites })}
        />
        {EXPERT_MEDIAS_EN_VENTE ? (
          <Curseur
            label={t("config.images")}
            aide={t("config.parUnite", { prix: euros(IMAGE_PRICE_EUR) })}
            value={selection.images}
            min={0}
            max={IMAGES_MAX}
            onChange={(images) => modifier({ images })}
          />
        ) : null}
      </div>

      <div className="flex flex-col rounded-xl border border-[#e6e6e6] bg-white p-5 lg:self-start">
        <h3 className="m-0 text-sm font-semibold text-[#111]">{abonnement ? t("config.recap") : t("quota.recap")}</h3>
        <dl className="m-0 mt-3 flex flex-col gap-2 text-sm">
          {lignes.map((l) => (
            <div key={l.label} className="flex justify-between gap-4 text-[#444]">
              <dt>{l.label}</dt>
              {/* Une seule ligne : son montant est le total affiché juste dessous, pas deux fois. */}
              {lignes.length > 1 ? <dd className="m-0 tabular-nums">{euros(l.montant)}</dd> : null}
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-baseline justify-between gap-3 border-t border-[#eee] pt-4">
          <span className="text-sm font-semibold text-[#111]">{abonnement ? t("config.total") : t("quota.total")}</span>
          <span aria-live="polite" className="flex items-baseline gap-1 text-[#111]">
            <span className="text-[28px] font-[650] tabular-nums tracking-[-0.03em]">{euros(total)}</span>
            {abonnement ? <span className="text-sm text-[#666]">{t("config.parMois")}</span> : null}
          </span>
        </div>
        <p className="m-0 mt-2 text-xs leading-[1.5] text-[#777]">{t("config.apercu")}</p>
        <Link
          href={abonnement ? "/register?plan=expert" : "/register?plan=expert&mode=quota"}
          className={`mt-4 rounded-[10px] px-4 py-3 text-center text-sm font-semibold no-underline transition-colors ${abonnement ? "bg-[#7c3aed] text-white hover:bg-[#6d28d9] hover:text-white" : "border border-[#d9d9d9] text-[#111] hover:border-[#7c3aed] hover:text-[#7c3aed]"}`}
        >
          {abonnement ? t("config.cta") : t("quota.cta")}
        </Link>
      </div>
    </div>
  );
}

/** Configurateur du mois Expert, puis la recharge de crédits (Quota) avec le même configurateur.
 *  Affiché sur la page /expert (app/expert/page.tsx). */
export function ExpertConfigurateur() {
  const t = useTranslations("landing.pricing.expert");

  return (
    <div
      data-rv="up"
      style={{ "--dl": "120ms" } as React.CSSProperties}
      className="rounded-2xl border border-[#e6e6e6] bg-[#fafafa] p-5 sm:p-6"
    >
      <h2 className="m-0 text-[22px] font-[650] leading-[1.2] tracking-[-0.02em] text-[#111]">{t("config.titre")}</h2>
      <div className="mt-6">
        <Configurateur mode="abonnement" />
      </div>

      <div className="mt-8 border-t border-[#e6e6e6] pt-6">
        <div className="max-w-[640px]">
          <div className="dv-mono text-xs uppercase tracking-[0.1em] text-[#555]">{t("quota.eyebrow")}</div>
          <h2 className="m-0 mt-2 text-lg font-semibold text-[#111]">{t("quota.titre")}</h2>
          <p className="m-0 mt-2 text-sm leading-[1.55] text-[#444]">{t("quota.texte")}</p>
        </div>
        <div className="mt-5">
          <Configurateur mode="recharge" />
        </div>
      </div>
    </div>
  );
}
