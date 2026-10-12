import { toIntlTag, type AppLocale } from "@/lib/locale";

// Prix affiché sur les pages publiques d'une boutique, au format de sa langue (« 19,90 € »
// en français, « €19.90 » en anglais). Les prix des boutiques sont en euros.
export const DEVISE_BOUTIQUE = "EUR";

export function formatPrix(valeur: number | string, langue: AppLocale): string {
  return new Intl.NumberFormat(toIntlTag(langue), { style: "currency", currency: DEVISE_BOUTIQUE }).format(Number(valeur));
}
