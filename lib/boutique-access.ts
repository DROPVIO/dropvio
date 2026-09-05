import { createSupabaseServerClient } from "@/lib/supabase-server";

// Une boutique publique reste visible par tout le monde sans vérification supplémentaire.
// Une boutique privée n'est visible que par son propriétaire connecté (aperçu) — jamais par
// un visiteur anonyme, même en connaissant l'URL exacte : voir app/api/boutiques/slug/...
// qui traite un refus ici exactement comme "boutique introuvable" (404), pour ne jamais
// révéler l'existence d'une boutique privée à qui n'est pas son propriétaire.
export async function canViewBoutique(estPublique: boolean, ownerId: string): Promise<boolean> {
  if (estPublique) return true;

  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id === ownerId;
}
