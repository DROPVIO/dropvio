import { slugify } from "./slugify";

// Helpers du téléchargement de l'audit, extraits de app/audit/page.tsx : fonctions pures
// (donc testables hors navigateur) + le déclencheur de téléchargement lui-même.

// slugify() (partagé avec les slugs produits en base) ne translittère pas les accents :
// [^a-z0-9] y remplace « é » par un tiret. On décompose donc les diacritiques avant de
// l'appeler, plutôt que de modifier une fonction dont dépendent des URLs existantes.
export function slugFichier(valeur: string): string {
  const sansAccents = valeur.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return slugify(sansAccents) || "landing-page";
}

/** dropvio-audit-{slug}-{AAAA-MM-JJ}.html */
export function nomFichierAudit(source: string, maintenant: Date = new Date()): string {
  const jour = [
    maintenant.getFullYear(),
    String(maintenant.getMonth() + 1).padStart(2, "0"),
    String(maintenant.getDate()).padStart(2, "0"),
  ].join("-");
  return `dropvio-audit-${slugFichier(source)}-${jour}.html`;
}

export function tailleLisible(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(1).replace(".", ",")} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`;
}

/** Télécharge une chaîne comme fichier. Deux contraintes navigateur qui cassaient la version
 *  précédente : l'ancre doit être DANS le document (Firefox ignore un clic synthétique sur une
 *  ancre détachée) et l'URL blob ne doit être révoquée qu'après que le navigateur a commencé à
 *  la lire — sinon le téléchargement avorte, d'autant plus sûrement que le fichier est gros. */
export function telechargerTexte(
  contenu: string,
  nomFichier: string,
  mime = "text/html;charset=utf-8"
): void {
  const blob = new Blob([contenu], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
