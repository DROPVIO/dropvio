import type { Plan } from "@/lib/plan-limits";
import { reglageMedia, type FournisseurId } from "./config";
import { generateImageOpenAI } from "./openai";
import { MediaProviderError, MediaProviderNotConfiguredError, type GenerateImageOptions, type GeneratedImage } from "./types";

export { MediaProviderError, MediaProviderNotConfiguredError } from "./types";
export type { GenerateImageOptions, GeneratedImage, ImageQuality, MediaErreurType } from "./types";

// Implémentation image de chaque fournisseur de lib/media/config.ts.
export const GENERATEURS_IMAGE: Record<FournisseurId, (prompt: string, options?: GenerateImageOptions) => Promise<GeneratedImage>> = {
  openai: generateImageOpenAI,
};

// Point d'entrée commun : les routes n'appellent jamais un fournisseur directement. Le
// fournisseur est celui de la table de configuration pour ce plan, le même que la mention affiche.
export function generateImage(plan: Plan, prompt: string, options?: GenerateImageOptions): Promise<GeneratedImage> {
  const { generateur } = reglageMedia(plan);
  if (!generateur) throw new MediaProviderNotConfiguredError(`image (plan ${plan})`);
  return GENERATEURS_IMAGE[generateur](prompt, options);
}

/** Réponse d'API pour un échec de génération : trois messages pour l'utilisateur, le détail
 *  technique restant dans les logs serveur (voir lib/api-errors.ts pour les codes). */
export function erreurGenerationPourApi(error: unknown): { code: string; status: number; message: string } {
  if (error instanceof MediaProviderError) {
    if (error.type === "limite") return { code: "media_limite_atteinte", status: 429, message: "Limite de génération atteinte." };
    if (error.type === "refus") return { code: "media_prompt_refuse", status: 422, message: "Le prompt a été refusé." };
  }
  return { code: "media_service_indisponible", status: 503, message: "Service de génération indisponible." };
}

/** Diagnostic de bout en bout sans interface : prompt court, format carré, qualité basse.
 *  Appelle réellement le fournisseur (facturé) et vérifie que l'image reçue est un PNG lisible.
 *  Utilisé par scripts/tester-generation-image.ts. */
export async function testerGenerationImage(plan: Plan = "expert"): Promise<
  | { ok: true; fournisseur: string; modele: string; octets: number; dureeMs: number }
  | { ok: false; code: string; cause: string; dureeMs: number }
> {
  const debut = Date.now();
  try {
    const image = await generateImage(plan, "Studio product photo of a white ceramic mug on a light background", { size: "1024x1024", quality: "low" });
    const octets = Buffer.from(image.base64, "base64");
    const png = octets.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (!png) throw new MediaProviderError("reponse", { fournisseur: reglageMedia(plan).generateur ?? "?", message: `image reçue illisible (${image.mimeType})` });
    return { ok: true, fournisseur: reglageMedia(plan).generateur ?? "?", modele: image.model, octets: octets.length, dureeMs: Date.now() - debut };
  } catch (error) {
    return { ok: false, code: erreurGenerationPourApi(error).code, cause: error instanceof Error ? error.message : String(error), dureeMs: Date.now() - debut };
  }
}
