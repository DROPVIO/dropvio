import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BUCKET_MEDIATHEQUE, BUCKET_PUBLIC } from "@/lib/media/mediatheque";
import { apiError, erreurServeur } from "@/lib/api-errors";

// Supprime l'original. La copie publique reste si un produit l'utilise, pour ne pas casser une
// boutique en ligne : conserveeEnBoutique permet de le dire à l'utilisateur.
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, user } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connectez-vous pour modifier votre médiathèque.");
  }

  const { data: media } = await supabase.from("medias").select("chemin, url_publique, chemin_public").eq("id", id).maybeSingle();
  if (!media) {
    return apiError("media_introuvable", 404, "Fichier introuvable.");
  }

  const admin = createSupabaseAdminClient();
  let conserveeEnBoutique = false;
  if (media.url_publique) {
    const { data: produits, error } = await admin
      .from("boutique_produits")
      .select("id")
      .contains("image_urls", JSON.stringify([media.url_publique]))
      .limit(1);
    if (error) {
      return erreurServeur("api/media/[id]", error);
    }
    conserveeEnBoutique = (produits ?? []).length > 0;
    if (!conserveeEnBoutique && media.chemin_public) {
      await admin.storage.from(BUCKET_PUBLIC).remove([media.chemin_public]);
    }
  }

  const { error: suppressionError } = await admin.storage.from(BUCKET_MEDIATHEQUE).remove([media.chemin]);
  if (suppressionError) {
    return erreurServeur("api/media/[id]", suppressionError);
  }
  const { error } = await admin.from("medias").delete().eq("id", id).eq("user_id", user.id);
  if (error) {
    return erreurServeur("api/media/[id]", error);
  }

  return NextResponse.json({ conserveeEnBoutique });
}
