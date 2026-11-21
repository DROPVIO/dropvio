"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { IMAGE_PRICE_EUR } from "@/lib/expert-pricing";
import { coutImagesSite, etatCaseImages } from "@/lib/media/images-site";
import type { Plan } from "@/lib/plan-limits";

/** Case « Générer des images avec OpenAI » du Site Builder. Cochable seulement si le plan a un
 *  générateur d'images (lib/media/config.ts) et que le quota restant couvre toutes les images. */
export default function CaseImagesOpenAI({
  plan,
  imagesRestantes,
  coche,
  onChange,
}: {
  plan: Plan;
  imagesRestantes: number | null;
  coche: boolean;
  onChange: (coche: boolean) => void;
}) {
  const t = useTranslations("siteBuilder.builder.imagesOpenAI");
  const format = useFormatter();
  const etat = etatCaseImages(plan, imagesRestantes);
  const cout = coutImagesSite(IMAGE_PRICE_EUR);

  return (
    <div className="mb-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm">
      <label className={`flex min-h-[32px] items-center gap-3 ${etat.active ? "cursor-pointer" : "cursor-not-allowed"}`}>
        <input
          type="checkbox"
          checked={etat.active && coche}
          disabled={!etat.active}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby="images-openai-aide"
          className="h-5 w-5 shrink-0 accent-violet-600"
        />
        <span className={etat.active ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-faint)]"}>{t("libelle")}</span>
      </label>
      <p id="images-openai-aide" className="mt-1 pl-8 text-xs text-[var(--text-faint)]" aria-live="polite">
        {!etat.active && etat.raison === "plan" && t("planExpert")}
        {!etat.active && etat.raison === "quota" && (
          <>
            {t("quotaInsuffisant", { images: etat.images, restantes: etat.restantes })}{" "}
            <Link href="/quota" className="underline">{t("recharger")}</Link>
          </>
        )}
        {etat.active && !coche && t("aide", { images: cout.images })}
        {etat.active && coche && (
          <span className="text-[var(--text-muted)]">
            {t("cout", { images: cout.images, eur: format.number(cout.eur, { style: "currency", currency: "EUR" }) })}
            {etat.restantes !== null && ` ${t("restantes", { restantes: etat.restantes })}`}
          </span>
        )}
      </p>
    </div>
  );
}
