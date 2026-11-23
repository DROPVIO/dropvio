"use client";

import { useTranslations } from "next-intl";

/** Mention visible « Contenu généré par IA » (AI Act, art. 50), placée sous un résultat produit
 *  par l'IA (audit, texte). Les sites générés portent la leur dans leur propre pied de page
 *  (lib/mention-ia-site.ts), dans la langue du site. */
export default function MentionIa({ className = "" }: { className?: string }) {
  const t = useTranslations("mentionIa");
  return (
    <p data-mention-ia="" className={`m-0 text-[11px] text-[var(--text-faint)] ${className}`}>
      {t("texte")}
    </p>
  );
}
