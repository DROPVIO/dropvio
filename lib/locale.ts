// Constantes de résolution de langue partagées entre middleware.ts (Edge), i18n/request.ts
// (RSC) et les composants client qui déclenchent un changement de langue (ParametresModal) —
// une seule source de vérité plutôt que des littéraux dupliqués comme THEME_STORAGE_KEY
// (voir lib/theme.ts, dupliqué là uniquement parce qu'un script inline ne peut pas importer).

export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "fr";

// Cookie de préférence pour les visiteurs non connectés (et fallback pour un utilisateur
// connecté qui se déconnecte) — lu en priorité par le middleware avant l'Accept-Language.
export const LOCALE_COOKIE = "NEXT_LOCALE";

// En-tête interne posé par le middleware sur la requête sortante pour transmettre la langue
// déjà résolue (cookie/Accept-Language/profils.langue) à i18n/request.ts, qui tourne dans un
// contexte RSC sans accès direct à la logique de résolution du middleware.
export const LOCALE_HEADER = "x-dropvio-locale";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return value === "fr" || value === "en";
}

// Écrit le cookie de préférence de langue côté client — utilisé par ParametresModal après un
// changement explicite, pour que le choix survive même après déconnexion (une fois déconnecté,
// profils.langue ne joue plus, seul ce cookie reste).
export function setLocaleCookie(locale: AppLocale): void {
  try {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
  } catch {
    // document indisponible ou cookies bloqués : le choix reste actif pour la session en
    // cours via profils.langue (utilisateur connecté), juste non persisté après déconnexion.
  }
}
