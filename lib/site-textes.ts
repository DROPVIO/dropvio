import type fr from "@/messages/fr.json";
import { DEFAULT_LOCALE, isAppLocale, toIntlTag, type AppLocale } from "@/lib/locale";

// Textes livrés aux clients finaux dans les sites générés (templates, grille produits,
// panier, pages légales…), dans la langue du site : celle de la boutique quand le site en
// vient, sinon celle choisie dans le Site Builder. Ils vivent dans le namespace siteContenu
// de messages/*.json (mêmes clés dans les 4 langues, vérifié par scripts/verifier-messages.ts)
// et ne passent pas par next-intl : un site généré n'est pas forcément dans la langue de
// l'interface. Côté client, GET /api/site-textes?langue=… les sert.
export type TextesSite = (typeof fr)["siteContenu"];

// Contexte de rendu d'un site : textes et langue (attribut lang, format des prix).
export type SiteCtx = { t: TextesSite; langue: AppLocale };

export function langueSite(valeur: unknown): AppLocale {
  return typeof valeur === "string" && isAppLocale(valeur) ? valeur : DEFAULT_LOCALE;
}

export async function chargerTextesSite(langue: AppLocale): Promise<TextesSite> {
  const messages = (await import(`@/messages/${langue}.json`)).default as typeof fr;
  return messages.siteContenu;
}

export async function contexteSite(langue: AppLocale): Promise<SiteCtx> {
  return { t: await chargerTextesSite(langue), langue };
}

// Remplace les {variables} d'un texte (pas d'ICU : les textes de site n'ont pas de pluriel).
export function tx(modele: string, valeurs?: Record<string, string | number>): string {
  return modele.replace(/\{(\w+)\}/g, (tout, cle: string) => (valeurs && cle in valeurs ? String(valeurs[cle]) : tout));
}

// Prix au format de la langue du site (« 29,99 € », « €29.99 »). Une valeur non numérique est
// rendue telle quelle.
export function prixSite(valeur: string | number, langue: AppLocale): string {
  const n = typeof valeur === "number" ? valeur : parseFloat(valeur);
  if (!Number.isFinite(n)) return String(valeur);
  return new Intl.NumberFormat(toIntlTag(langue), { style: "currency", currency: "EUR" }).format(n);
}

// Langue d'un site déjà généré, lue dans l'attribut lang de sa balise <html> (fr si absente) :
// les sites n'enregistrent pas leur langue à part.
export function langueDuHtml(html: string): AppLocale {
  return langueSite(/<html\b[^>]*\blang=["']?([a-z]{2})/i.exec(html)?.[1]?.toLowerCase());
}
