import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BUCKET_MEDIATHEQUE, stockageMedia } from "@/lib/media/mediatheque";
import { apiError, erreurServeur } from "@/lib/api-errors";

const PAR_PAGE = 60;
const DUREE_URL_SIGNEE_S = 3600;

// Médiathèque du compte connecté. Le bucket étant privé, chaque aperçu passe par une URL signée
// temporaire : elle ne sert qu'à l'affichage dans l'espace, jamais sur une boutique publique.
// ?origine=generation (images créées avec Dropvio) ou ?origine=import (images envoyées) : une vue
// à la fois, avec l'espace utilisé par cette vue (stockage.vue) en plus du total du compte.
export async function GET(request: Request) {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connectez-vous pour voir votre médiathèque.");
  }

  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const origineDemandee = params.get("origine");
  const origine = origineDemandee === "generation" || origineDemandee === "import" ? origineDemandee : null;
  const debut = (page - 1) * PAR_PAGE;
  let requete = supabase
    .from("medias")
    .select("id, type, origine, prompt, modele, format, taille_octets, mime, chemin, created_at")
    .order("created_at", { ascending: false })
    .range(debut, debut + PAR_PAGE - 1);
  if (origine) requete = requete.eq("origine", origine);
  const { data, error } = await requete;
  if (error) {
    return erreurServeur("api/media", error);
  }

  const admin = createSupabaseAdminClient();
  const lignes = data ?? [];
  const signees = lignes.length
    ? (await admin.storage.from(BUCKET_MEDIATHEQUE).createSignedUrls(lignes.map((l) => l.chemin), DUREE_URL_SIGNEE_S)).data
    : [];
  const urlDe = new Map((signees ?? []).map((s) => [s.path, s.signedUrl]));

  const stockage = await stockageMedia(admin, user.id, plan);
  let vue: number | null = null;
  if (origine) {
    const { data: tailles } = await supabase.from("medias").select("taille_octets").eq("origine", origine);
    vue = (tailles ?? []).reduce((total, ligne) => total + Number(ligne.taille_octets ?? 0), 0);
  }

  return NextResponse.json({
    plan,
    medias: lignes.map(({ chemin, ...media }) => ({ ...media, url: urlDe.get(chemin) ?? null })),
    stockage: { ...stockage, vue },
    suivant: lignes.length === PAR_PAGE,
  });
}
