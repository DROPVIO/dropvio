"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

// Message d'erreur à afficher pour une réponse d'API en échec : la traduction de son `code`
// (namespace apiErrors, voir lib/api-errors.ts) quand elle existe, sinon `repli` (message
// déjà traduit par l'appelant, propre à l'action), sinon un message générique. Le texte brut
// `error` du serveur n'est jamais affiché tel quel : il est en français et n'est là que pour
// les logs. Les valeurs du message viennent de `values` dans la réponse (voir apiError).
// Erreur réseau (fetch rejeté) : apiErrorMessage({ code: "network" }).
export function useApiErrorMessage() {
  const t = useTranslations("apiErrors");
  return useCallback(
    (json: unknown, repli?: string): string => {
      const corps = typeof json === "object" && json !== null ? (json as { code?: unknown; values?: unknown }) : {};
      const valeurs =
        typeof corps.values === "object" && corps.values !== null ? (corps.values as Record<string, string | number>) : {};
      if (typeof corps.code === "string" && t.has(corps.code)) return t(corps.code, valeurs);
      return repli ?? t("generic");
    },
    [t]
  );
}
