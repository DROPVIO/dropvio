export type VideoEmbed =
  | { type: "youtube"; embedUrl: string }
  | { type: "vimeo"; embedUrl: string }
  | { type: "direct"; url: string };

// Détecte YouTube/Vimeo par pattern d'URL et les convertit en URL d'embed — toute autre
// URL est traitée comme un fichier vidéo direct (<video>). Pas de champ "type" à saisir
// par le marchand : une seule case URL dans les Paramètres, la détection se fait à
// l'affichage (voir app/components/boutique/SecondaryBanner.tsx).
export function resolveVideoEmbed(url: string): VideoEmbed {
  const trimmed = url.trim();

  const youtubeMatch = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (youtubeMatch) {
    return { type: "youtube", embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}` };
  }

  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return { type: "vimeo", embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}` };
  }

  return { type: "direct", url: trimmed };
}
