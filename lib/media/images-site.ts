// Images générées avec le site (case « Générer des images avec OpenAI » du Site Builder).
// Logique sans dépendance serveur ni React, testée par lib/media/images-site.test.ts. Chaque
// image passe par /api/media/generer : même fournisseur, même réservation du quota Expert.
import type { Plan, PlanOuAucun } from "@/lib/plan-limits";
import { generationDisponible } from "./config";
import type { MediaFormat } from "./constantes";

// [NOMBRE_IMAGES_PAR_SITE À CONFIRMER] : valeur de départ 3.
export const NOMBRE_IMAGES_PAR_SITE = 3;

export const FORMAT_IMAGES_SITE: MediaFormat = "carre";

// Rôle de chaque image, dans l'ordre des emplacements du site généré : le hero, puis la
// section description (app/api/generate-site, EMPLACEMENT_IMAGE_VIDE). Au-delà, l'image va
// seulement dans la médiathèque.
export const ROLES_IMAGES_SITE = ["hero", "detail", "situation"] as const;
export type RoleImageSite = (typeof ROLES_IMAGES_SITE)[number];

export type ContenuSite = {
  /** Titre du site : nom du produit, ou de la boutique en mode boutique. */
  titre: string;
  description?: string | null;
  /** Brief saisi dans la barre du Site Builder. */
  brief?: string | null;
  /** Produits mis en avant (mode boutique) ; le premier est le produit principal. */
  produits?: string[];
};

const TEXTE_MAX = 600;

function nettoyer(texte: string | null | undefined): string {
  return (texte ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, TEXTE_MAX);
}

const CONSIGNE_ROLE: Record<RoleImageSite, string> = {
  hero: "Hero image for the top of the landing page: the product as the clear focal point, appealing and premium.",
  detail: "Close-up detail shot highlighting the product's materials, finish and key features.",
  situation: "Lifestyle shot of the product in use in a realistic everyday setting.",
};

/** Prompts des images du site, un par rôle, dérivés du contenu envoyé à la génération : titre,
 *  produit principal, description et brief. Les sections sont connues d'avance (hero, détail,
 *  mise en situation) : le site et les images sont générés en parallèle, sans attendre le HTML. */
export function promptsImagesSite(contenu: ContenuSite, nombre = NOMBRE_IMAGES_PAR_SITE): { role: RoleImageSite; prompt: string }[] {
  const titre = nettoyer(contenu.titre);
  const principal = nettoyer(contenu.produits?.find((p) => p.trim())) || titre;
  const description = nettoyer(contenu.description);
  const brief = nettoyer(contenu.brief);
  return ROLES_IMAGES_SITE.slice(0, Math.max(0, Math.min(nombre, ROLES_IMAGES_SITE.length))).map((role) => ({
    role,
    prompt: [
      `Professional e-commerce photo for the website "${titre}".`,
      `Main product: ${principal}.`,
      description ? `Product description: ${description}` : "",
      brief ? `Site brief: ${brief}` : "",
      CONSIGNE_ROLE[role],
      "Clean studio lighting, sharp focus, no text, no logo, no watermark.",
    ]
      .filter(Boolean)
      .join("\n"),
  }));
}

export type EtatCaseImages =
  | { active: true; images: number; restantes: number | null }
  | { active: false; raison: "plan" }
  | { active: false; raison: "quota"; images: number; restantes: number };

/** La case n'est cochable que si le plan a un générateur d'images et que le quota restant couvre
 *  toutes les images du site. `imagesRestantes` null : quota pas encore lu. */
export function etatCaseImages(plan: PlanOuAucun, imagesRestantes: number | null, nombre = NOMBRE_IMAGES_PAR_SITE): EtatCaseImages {
  if (!generationDisponible(plan)) return { active: false, raison: "plan" };
  if (imagesRestantes !== null && imagesRestantes < nombre) return { active: false, raison: "quota", images: nombre, restantes: imagesRestantes };
  return { active: true, images: nombre, restantes: imagesRestantes };
}

/** Coût estimé : une image du quota par image (règle du plan Expert), et son équivalent au prix
 *  unitaire des crédits images. */
export function coutImagesSite(prixImageEur: number, nombre = NOMBRE_IMAGES_PAR_SITE): { images: number; eur: number } {
  return { images: nombre, eur: Math.round(nombre * prixImageEur * 100) / 100 };
}

const EMPLACEMENT = /<div\b[^>]*\bdata-placeholder="image"[^>]*>[^<]*<\/div>/g;

function echapperAttribut(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Remplace les emplacements d'image vides du site, dans l'ordre, par les images obtenues. Une
 *  image null (échec) laisse son emplacement vide. Les emplacements des fiches produit ne sont
 *  jamais remplis. */
export function remplacerEmplacements(html: string, images: ({ url: string; alt: string } | null)[]): { html: string; remplaces: number; emplacements: number } {
  let index = 0;
  let remplaces = 0;
  const resultat = html.replace(EMPLACEMENT, (emplacement) => {
    // Fiche produit sans photo (grille du mode boutique) : elle attend la photo de CE produit,
    // jamais une image générée pour le site.
    if (emplacement.includes("grille-img-placeholder")) return emplacement;
    const image = images[index++];
    if (!image) return emplacement;
    remplaces++;
    return `<img src="${echapperAttribut(image.url)}" alt="${echapperAttribut(image.alt)}" data-media-genere="1" style="width:100%;max-width:420px;border-radius:12px;object-fit:cover;display:block">`;
  });
  return { html: resultat, remplaces, emplacements: index };
}

export type ResultatImage = { role: RoleImageSite; mediaId: string; url: string } | { role: RoleImageSite; erreur: string };

/** Génère le site et ses images en parallèle. Une image en échec ne fait pas échouer le site.
 *  `dejaGenerees` : images d'un essai précédent pour le même contenu (site en échec) ; elles
 *  sont réutilisées au lieu d'être regénérées, le quota n'est donc décompté qu'une fois. */
export async function genererSiteEtImages<S>({
  genererSite,
  genererImage,
  prompts,
  dejaGenerees = [],
}: {
  genererSite: () => Promise<S>;
  genererImage: (prompt: string) => Promise<{ mediaId: string; url: string }>;
  prompts: { role: RoleImageSite; prompt: string }[];
  dejaGenerees?: ResultatImage[];
}): Promise<{ site: { ok: true; valeur: S } | { ok: false; erreur: unknown }; images: ResultatImage[] }> {
  const reussies = new Map(dejaGenerees.filter((r): r is Extract<ResultatImage, { url: string }> => "url" in r).map((r) => [r.role, r]));
  const [site, ...images] = await Promise.allSettled([
    genererSite(),
    ...prompts.map(({ role, prompt }) => {
      const existante = reussies.get(role);
      return existante ? Promise.resolve(existante) : genererImage(prompt).then((r) => ({ role, ...r }));
    }),
  ]);
  return {
    site: site.status === "fulfilled" ? { ok: true, valeur: site.value as S } : { ok: false, erreur: site.reason },
    images: images.map((r, i) =>
      r.status === "fulfilled"
        ? (r.value as ResultatImage)
        : { role: prompts[i].role, erreur: r.reason instanceof Error ? r.reason.message : String(r.reason) }
    ),
  };
}
