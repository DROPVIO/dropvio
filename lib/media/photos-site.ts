// Photos du site généré par le Site Builder : d'où elles viennent et combien en mettre.
// Remplace l'ancienne case « Générer des images avec OpenAI » : plus aucune génération
// automatique par défaut, l'utilisateur choisit la source et le nombre. Logique sans React.
import { ROLES_IMAGES_SITE } from "./images-site";

// Sources proposées, toutes déjà disponibles dans l'app :
// - produit : la photo du produit (import AliExpress / pré-remplissage), comme avant ;
// - mediatheque : images de la médiathèque, qui accepte aussi l'envoi de fichiers ;
// - liens : adresses d'images collées à la main ;
// - ia : génération OpenAI (plan Expert, quota d'images), seulement si choisie ;
// - aucune : emplacements laissés vides.
export const SOURCES_PHOTOS_SITE = ["produit", "mediatheque", "liens", "ia", "aucune"] as const;
export type SourcePhotosSite = (typeof SOURCES_PHOTOS_SITE)[number];

export const SOURCE_PHOTOS_DEFAUT: SourcePhotosSite = "produit";

// Plafond : le site généré a au plus ce nombre d'emplacements d'image hors fiches produit
// (hero, détail, mise en situation — ROLES_IMAGES_SITE). Au-delà, une photo n'aurait nulle
// part où aller.
export const NOMBRE_PHOTOS_SITE_MAX = ROLES_IMAGES_SITE.length;
export const NOMBRE_PHOTOS_SITE_DEFAUT = 1;

/** Le nombre ne concerne que les sources qui remplissent les emplacements du site. */
export function sourceAvecNombre(source: SourcePhotosSite): boolean {
  return source === "mediatheque" || source === "liens" || source === "ia";
}

export function bornerNombrePhotos(nombre: number): number {
  if (!Number.isFinite(nombre)) return NOMBRE_PHOTOS_SITE_DEFAUT;
  return Math.max(1, Math.min(NOMBRE_PHOTOS_SITE_MAX, Math.round(nombre)));
}

export function lienPhotoValide(url: string): boolean {
  try {
    const { protocol } = new URL(url.trim());
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Photos à placer dans le site pour les sources « médiathèque » et « liens » : adresses valides,
 *  sans doublon, dans la limite du nombre choisi. Vide pour les autres sources. */
export function photosFournies(
  source: SourcePhotosSite,
  nombre: number,
  choisies: readonly string[],
  liens: readonly string[]
): string[] {
  const brutes = source === "mediatheque" ? choisies : source === "liens" ? liens : [];
  const uniques = [...new Set(brutes.map((u) => u.trim()).filter(lienPhotoValide))];
  return uniques.slice(0, bornerNombrePhotos(nombre));
}

/** La photo du produit n'est envoyée à la génération (hero, galerie…) qu'avec la source
 *  « produit » : avec une autre source, le site garde ses emplacements libres pour les photos
 *  choisies. */
export function utiliserPhotoProduit(source: SourcePhotosSite): boolean {
  return source === "produit";
}
