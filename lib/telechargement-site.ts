import { CLE_ACCUEIL, fichierPage } from "@/lib/site-builder-pages";
import { creerZip } from "@/lib/zip";
import { slugFichier, telechargerBlob } from "@/lib/audit-download";

// Site multi-pages (accueil, catalogue, collections, pages légales) téléchargé en un .zip :
// chaque page garde son nom de fichier (index.html, catalogue.html, collection-….html…), donc
// les liens de navigation entre pages, relatifs, fonctionnent une fois le dossier décompressé
// et index.html ouvert dans le navigateur. Renvoie le nom du fichier téléchargé.
export function telechargerSiteMultiPages(pages: Record<string, string>, nomSite: string): string {
  const cles = Object.keys(pages).sort((a, b) => (a === CLE_ACCUEIL ? -1 : b === CLE_ACCUEIL ? 1 : a.localeCompare(b)));
  const zip = creerZip(cles.map((cle) => ({ nom: fichierPage(cle), contenu: pages[cle] })));
  const nomFichier = `${slugFichier(nomSite) || "site"}.zip`;
  telechargerBlob(zip, nomFichier);
  return nomFichier;
}
