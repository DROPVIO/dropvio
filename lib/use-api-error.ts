"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

// Message d'erreur à afficher pour une réponse d'API en échec : la traduction de son `code`
// (namespace apiErrors, voir lib/api-errors.ts) quand elle existe, sinon le message générique
// `fallbackKey` du même namespace. Le texte brut `error` du serveur n'est jamais affiché tel
// quel : il est en français et n'est là que pour les logs. Les valeurs du message viennent de
// `values` dans la réponse (voir apiError), complétées par celles passées en argument.
export function useApiErrorMessage() {
  const t = useTranslations("apiErrors");
  return useCallback(
    (json: unknown, fallbackKey: string = "generic", values?: Record<string, string | number>): string => {
      const corps = typeof json === "object" && json !== null ? (json as { code?: unknown; values?: unknown }) : {};
      const valeursServeur =
        typeof corps.values === "object" && corps.values !== null ? (corps.values as Record<string, string | number>) : {};
      if (typeof corps.code === "string" && t.has(corps.code)) return t(corps.code, { ...valeursServeur, ...values });
      return t(fallbackKey, values);
    },
    [t]
  );
}
