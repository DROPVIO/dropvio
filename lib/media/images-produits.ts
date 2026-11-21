// Images produits (Studio IA, page boutique) : règles partagées par le navigateur et la route
// app/api/media/generer (sans dépendance serveur). Chaque image passe par la même génération que
// le Studio (même réservation de quota, même fournisseur). Aucune limite de produits ni d'images
// par produit : seul le quota du mois limite (lib/media/quota-images-regles.ts, planifierLot).
import type { MediaFormat } from "./constantes";

// [FORMAT_DEFAUT_IMAGES_PRODUITS À CONFIRMER] : carré, le format des fiches produit.
export const FORMAT_DEFAUT_IMAGES_PRODUITS: MediaFormat = "carre";

// Photos de référence acceptées : seuls ces hôtes sont téléchargés par le serveur, pour qu'une
// URL saisie dans une fiche produit ne lui fasse pas appeler n'importe quelle adresse.
const HOTES_PHOTO = ["aliexpress-media.com", "alicdn.com", "supabase.co"];

export type ProduitStudio = {
  id: string;
  nom: string | null;
  description: string | null;
  image_urls: unknown;
};

export type RaisonIneligible = "sans_nom" | "sans_photo";

export function photoProduit(produit: Pick<ProduitStudio, "image_urls">): string | null {
  const urls = Array.isArray(produit.image_urls) ? produit.image_urls : [];
  const premiere = urls.find((url): url is string => typeof url === "string" && photoAutorisee(url));
  return premiere ?? null;
}

export function photoAutorisee(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && HOTES_PHOTO.some((hote) => hostname === hote || hostname.endsWith(`.${hote}`));
  } catch {
    return false;
  }
}

/** Un produit sans nom ou sans photo ne peut pas être sélectionné : l'image est générée à partir
 *  des deux. */
export function eligibiliteProduit(produit: ProduitStudio): { ok: true; photo: string } | { ok: false; raison: RaisonIneligible } {
  if (!produit.nom?.trim()) return { ok: false, raison: "sans_nom" };
  const photo = photoProduit(produit);
  if (!photo) return { ok: false, raison: "sans_photo" };
  return { ok: true, photo };
}

const DESCRIPTION_MAX = 1200;

/** Prompt envoyé au générateur, construit côté serveur à partir de la fiche produit. */
export function promptImageProduit(nom: string, description: string | null): string {
  const texte = (description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, DESCRIPTION_MAX);
  return [
    `Professional e-commerce product photo of "${nom.trim()}".`,
    texte ? `Product description: ${texte}` : "",
    "Use the attached photo as the reference: keep the exact same product (shape, colours, materials, details).",
    "Clean studio lighting, neutral background, sharp focus, no text, no logo, no watermark.",
  ]
    .filter(Boolean)
    .join("\n");
}
