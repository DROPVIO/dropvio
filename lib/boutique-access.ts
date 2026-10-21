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

// Écriture sur une boutique (ex. import AliExpress) : seul son propriétaire connecté y a droit.
// Vérifiée explicitement en plus des policies RLS, pour renvoyer un 404 clair plutôt qu'une
// insertion silencieusement refusée.
export async function isBoutiqueOwner(boutiqueId: string, userId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("boutiques")
    .select("id")
    .eq("id", boutiqueId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}
