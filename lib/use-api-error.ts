"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

// Message d'erreur à afficher pour une réponse d'API en échec : la traduction de son `code`
// (namespace apiErrors, voir lib/api-errors.ts) quand elle existe, sinon le message générique
// `fallbackKey` du même namespace. Le texte brut `error` du serveur n'est jamais affiché tel
// quel : il est en français et n'est là que pour les logs.
export function useApiErrorMessage() {
  const t = useTranslations("apiErrors");
  return useCallback(
    (json: unknown, fallbackKey: string = "generic", values?: Record<string, string | number>): string => {
      const code = typeof json === "object" && json !== null ? (json as { code?: unknown }).code : undefined;
      if (typeof code === "string" && t.has(code)) return t(code, values);
      return t(fallbackKey, values);
    },
    [t]
  );
}
