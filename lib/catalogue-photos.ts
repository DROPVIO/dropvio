// Photos choisies par un utilisateur pour un produit du catalogue commun (table catalogue_photos,
// migration 053, appliquée). Le catalogue (produits) n'est jamais modifié.
import type { SupabaseClient } from "@supabase/supabase-js";
import { photoAutorisee } from "@/lib/media/images-produits";

// Table absente (migration 053 non appliquée) : PostgREST répond 42P01 ou PGRST205.
const TABLE_ABSENTE = new Set(["42P01", "PGRST205"]);
// Garde-fou de taille de requête, pas une limite de photos par produit.
export const PHOTOS_PAR_REQUETE_MAX = 200;

export function tableAbsente(code: string | undefined): boolean {
  return code !== undefined && TABLE_ABSENTE.has(code);
}

/** URLs acceptées : https, sur un hôte connu (copies publiques Dropvio, photos AliExpress). */
export function photosValides(urls: unknown): string[] | null {
  if (!Array.isArray(urls) || urls.length > PHOTOS_PAR_REQUETE_MAX) return null;
  const propres = urls.filter((u): u is string => typeof u === "string").map((u) => u.trim());
  if (propres.length !== urls.length || !propres.every(photoAutorisee)) return null;
  return [...new Set(propres)];
}

export type LecturePhotos = { disponible: true; photos: string[] } | { disponible: false; photos: [] };

/** Photos d'un produit pour l'utilisateur connecté, dans l'ordre (la première est la principale). */
export async function lirePhotos(supabase: SupabaseClient, userId: string, produitId: string): Promise<LecturePhotos> {
  const { data, error } = await supabase
    .from("catalogue_photos")
    .select("url, position")
    .eq("user_id", userId)
    .eq("produit_id", produitId)
    .order("position", { ascending: true });
  if (error) {
    if (tableAbsente(error.code)) return { disponible: false, photos: [] };
    throw new Error(error.message);
  }
  return { disponible: true, photos: (data ?? []).map((l) => l.url as string) };
}

/** Photo principale de chaque produit (liste du catalogue). Table absente : aucune. */
export async function lirePhotosPrincipales(supabase: SupabaseClient, userId: string, produitIds: string[]): Promise<Map<string, string>> {
  const principales = new Map<string, string>();
  if (produitIds.length === 0) return principales;
  const { data, error } = await supabase
    .from("catalogue_photos")
    .select("produit_id, url")
    .eq("user_id", userId)
    .eq("position", 0)
    .in("produit_id", produitIds);
  if (error) {
    if (!tableAbsente(error.code)) console.warn("[catalogue-photos] Lecture impossible :", error.message);
    return principales;
  }
  for (const ligne of data ?? []) principales.set(ligne.produit_id as string, ligne.url as string);
  return principales;
}

/** Remplace toutes les photos du produit par `photos`, dans cet ordre. */
export async function remplacerPhotos(
  supabase: SupabaseClient,
  userId: string,
  produitId: string,
  photos: string[]
): Promise<{ ok: true } | { ok: false; tableAbsente: boolean; message: string }> {
  const { error: suppression } = await supabase.from("catalogue_photos").delete().eq("user_id", userId).eq("produit_id", produitId);
  if (suppression) return { ok: false, tableAbsente: tableAbsente(suppression.code), message: suppression.message };
  if (photos.length === 0) return { ok: true };
  const { error } = await supabase
    .from("catalogue_photos")
    .insert(photos.map((url, position) => ({ user_id: userId, produit_id: produitId, url, position })));
  if (error) return { ok: false, tableAbsente: tableAbsente(error.code), message: error.message };
  return { ok: true };
}
