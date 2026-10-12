import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/locale";

// Code PostgreSQL « undefined_column » : boutiques.langue n'existe pas tant que la migration
// 042_boutiques_langue.sql n'est pas appliquée.
export const UNDEFINED_COLUMN = "42703";

type ResultatRequete<T> = { data: T | null; error: { code?: string; message: string } | null };

// Exécute une lecture de boutique avec la colonne langue, puis sans elle si la migration 042
// manque : les pages publiques et la gestion restent fonctionnelles, en français.
export async function avecRepliLangue<T>(
  executer: (avecLangue: boolean) => PromiseLike<ResultatRequete<T>>
): Promise<ResultatRequete<T> & { langueDisponible: boolean }> {
  const premier = await executer(true);
  if (premier.error?.code !== UNDEFINED_COLUMN) return { ...premier, langueDisponible: true };
  const repli = await executer(false);
  return { ...repli, langueDisponible: false };
}

// Langue d'une boutique lue en base ; fr si absente ou inconnue.
export function langueBoutique(row: { langue?: unknown } | null | undefined): AppLocale {
  const valeur = row?.langue;
  return typeof valeur === "string" && isAppLocale(valeur) ? valeur : DEFAULT_LOCALE;
}
