"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { isAppLocale, DEFAULT_LOCALE } from "@/lib/locale";
import { TEXTES_CONSENTEMENT, type ConsentementsEnvoyes, type FamilleConsentement } from "@/lib/consentements";

export type EtatConsentement = { accesImmediat: boolean; renonciation: boolean };
export const CONSENTEMENT_VIDE: EtatConsentement = { accesImmediat: false, renonciation: false };

export function consentementDonne(etat: EtatConsentement): boolean {
  return etat.accesImmediat && etat.renonciation;
}

/** Corps à joindre à la requête de paiement (la langue fixe le texte enregistré). */
export function corpsConsentement(etat: EtatConsentement, locale: string): ConsentementsEnvoyes {
  return { ...etat, langue: isAppLocale(locale) ? locale : DEFAULT_LOCALE };
}

/** Deux cases distinctes, non cochées par défaut, obligatoires avant le paiement Stripe. */
export default function ConsentementAchat({
  famille,
  valeur,
  onChange,
}: {
  famille: FamilleConsentement;
  valeur: EtatConsentement;
  onChange: (etat: EtatConsentement) => void;
}) {
  const t = useTranslations("consentement");
  const locale = useLocale();
  const [case1, case2] = TEXTES_CONSENTEMENT[famille][isAppLocale(locale) ? locale : DEFAULT_LOCALE];

  return (
    <fieldset className="m-0 flex flex-col gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--text-muted)]">
      <legend className="px-1 text-xs font-semibold text-[var(--text-primary)]">{t("titre")}</legend>
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          required
          checked={valeur.accesImmediat}
          onChange={(e) => onChange({ ...valeur, accesImmediat: e.target.checked })}
          className="mt-1 shrink-0"
        />
        <span>{case1}</span>
      </label>
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          required
          checked={valeur.renonciation}
          onChange={(e) => onChange({ ...valeur, renonciation: e.target.checked })}
          className="mt-1 shrink-0"
        />
        <span>{case2}</span>
      </label>
      <p className="m-0 text-xs text-[var(--text-faint)]">
        {t("aide")}{" "}
        <Link href="/cgv" className="underline">{t("cgv")}</Link>
        {" · "}
        <Link href="/confidentialite" className="underline">{t("confidentialite")}</Link>
      </p>
    </fieldset>
  );
}
