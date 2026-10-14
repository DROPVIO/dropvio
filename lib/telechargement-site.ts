import { liensInternesSansNouvelOnglet, siteEnUnFichier } from "@/lib/site-builder-pages";
import { slugFichier, telechargerTexte } from "@/lib/audit-download";

// Site multi-pages (accueil, catalogue, collections, pages légales) téléchargé en un seul
// fichier HTML qui contient toutes les pages (voir siteEnUnFichier) : ouvert dans n'importe
// quel navigateur, les boutons de navigation entre pages fonctionnent. Renvoie le nom du
// fichier téléchargé.
export function telechargerSiteMultiPages(pages: Record<string, string>, nomSite: string): string {
  const nomFichier = `${slugFichier(nomSite) || "site"}.html`;
  telechargerTexte(siteEnUnFichier(pages), nomFichier);
  return nomFichier;
}

// Site d'une seule page : même nettoyage des liens internes que pour un site multi-pages.
export function telechargerPageSeule(html: string, nomFichier: string): void {
  telechargerTexte(liensInternesSansNouvelOnglet(html), nomFichier);
}
