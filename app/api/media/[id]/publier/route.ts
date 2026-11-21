import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BUCKET_MEDIATHEQUE, BUCKET_PUBLIC, extensionDe } from "@/lib/media/mediatheque";
import type { MediaMime } from "@/lib/media/constantes";
import { apiError } from "@/lib/api-errors";

// Copie publique d'une image, créée une seule fois quand elle sert sur une boutique : une URL
// signée expirerait et casserait la boutique, Shopify et le référencement. Le nom de fichier
// est aléatoire, la médiathèque ne devient donc pas parcourable.
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, user } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour utiliser cette image.");
  }

  const { data: media } = await supabase.from("medias").select("type, mime, chemin, url_publique").eq("id", id).maybeSingle();
  if (!media || media.type !== "image") {
    return apiError("media_introuvable", 404, "Image introuvable.");
  }
  if (media.url_publique) {
    return NextResponse.json({ url: media.url_publique });
  }

  const admin = createSupabaseAdminClient();
  const { data: fichier, error: lectureError } = await admin.storage.from(BUCKET_MEDIATHEQUE).download(media.chemin);
  if (lectureError || !fichier) {
    return apiError("server_error", 500, lectureError?.message ?? "Fichier illisible.");
  }

  const cheminPublic = `mediatheque/${user.id}/${randomUUID()}.${extensionDe(media.mime as MediaMime)}`;
  const { error: envoiError } = await admin.storage
    .from(BUCKET_PUBLIC)
    .upload(cheminPublic, await fichier.arrayBuffer(), { contentType: media.mime, upsert: false });
  if (envoiError) {
    return apiError("server_error", 500, envoiError.message);
  }

  const url = admin.storage.from(BUCKET_PUBLIC).getPublicUrl(cheminPublic).data.publicUrl;
  const { error } = await admin.from("medias").update({ url_publique: url, chemin_public: cheminPublic }).eq("id", id);
  if (error) {
    await admin.storage.from(BUCKET_PUBLIC).remove([cheminPublic]);
    return apiError("server_error", 500, error.message);
  }

  return NextResponse.json({ url });
}
