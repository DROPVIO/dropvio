// Données lues par les pages principales, par URL de route /api. La clé du cache client est
// l'URL elle-même : une page et le préchargement au survol de la barre latérale partagent donc
// la même entrée (lib/cache-client.ts).

import { chargerCache, lireJson } from "./cache-client";

export const URL_DONNEES = {
  plan: "/api/plan",
  shopifyStatus: "/api/shopify/status",
  sitesGeneres: "/api/sites-generes",
  usage: "/api/usage",
  quotaExpert: "/api/expert/quota",
  ventesPremierePage: "/api/ventes?page=1",
} as const;

/** Données utiles à chaque page, préchargées au survol (ou au focus) de son lien. */
export const DONNEES_PAR_PAGE: Record<string, readonly string[]> = {
  "/mes-sites": [URL_DONNEES.sitesGeneres, URL_DONNEES.plan, URL_DONNEES.shopifyStatus],
  "/dashboard/utilisation": [URL_DONNEES.usage],
  "/quota": [URL_DONNEES.quotaExpert],
  "/ventes": [URL_DONNEES.ventesPremierePage],
};

/** Charge en arrière-plan les données d'une page (sans effet si elles sont déjà fraîches). */
export function prechargerDonneesPage(href: string): void {
  for (const url of DONNEES_PAR_PAGE[href] ?? []) void chargerCache(url, () => lireJson(url));
}
