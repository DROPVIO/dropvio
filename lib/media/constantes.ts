// Limites partagées entre le navigateur et le serveur (sans dépendance serveur).
export const MEDIA_MAX_OCTETS = 10 * 1024 * 1024;
export const MEDIA_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type MediaMime = (typeof MEDIA_MIMES)[number];

export const MEDIA_FORMATS = {
  carre: "1024x1024",
  portrait: "1024x1536",
  paysage: "1536x1024",
} as const;
export type MediaFormat = keyof typeof MEDIA_FORMATS;

export const MEDIA_PROMPT_MAX = 4000;

export type Media = {
  id: string;
  // Type tel qu'en base (contrainte de la table medias, migration 046) ; seul "image" est produit.
  type: "image" | "video";
  origine: "generation" | "import";
  prompt: string | null;
  modele: string | null;
  format: MediaFormat | null;
  taille_octets: number;
  mime: string;
  created_at: string;
  url: string | null;
};
