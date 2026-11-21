import type { SupabaseClient } from "@supabase/supabase-js";
import { MEDIA_STOCKAGE_MAX_OCTETS, type Plan } from "@/lib/plan-limits";
import type { MediaMime } from "./constantes";

export const BUCKET_MEDIATHEQUE = "mediatheque";
export const BUCKET_PUBLIC = "site-images";

const EXTENSIONS: Record<MediaMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export function extensionDe(mime: MediaMime): string {
  return EXTENSIONS[mime];
}

// Type réel d'après les premiers octets : l'extension et le type annoncé par le navigateur
// peuvent être faux.
export function detecterMime(octets: Uint8Array): MediaMime | null {
  const debut = (...attendu: number[]) => attendu.every((valeur, i) => octets[i] === valeur);
  if (debut(0xff, 0xd8, 0xff)) return "image/jpeg";
  if (debut(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  const texte = (de: number, a: number) => String.fromCharCode(...octets.slice(de, a));
  if (texte(0, 4) === "RIFF" && texte(8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function stockageMedia(admin: SupabaseClient, userId: string, plan: Plan): Promise<{ utilise: number; max: number }> {
  const { data, error } = await admin.rpc("medias_octets_utilises", { p_user_id: userId });
  if (error) throw new Error(error.message);
  return { utilise: Number(data ?? 0), max: MEDIA_STOCKAGE_MAX_OCTETS[plan] };
}
