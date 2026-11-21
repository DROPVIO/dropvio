import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { NOMBRE_IMAGES_PAR_SITE } from "@/lib/media/images-site";
import { apiError } from "@/lib/api-errors";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Rattache au site enregistré les images générées avec lui (colonne medias.site_id, migration
// 050). Appelée après la sauvegarde du site : les images existent avant que le site ait un id.
// Seuls le site et les images de l'utilisateur connecté sont concernés.
export async function POST(request: Request) {
  const { supabase, user } = await getServerUserPlanOnly();
  if (!user) return apiError("auth_required", 401, "Connecte-toi.");

  const body = await request.json().catch(() => null);
  const siteId = typeof body?.siteId === "string" ? body.siteId : "";
  const mediaIds: unknown[] = Array.isArray(body?.mediaIds) ? body.mediaIds : [];
  if (!UUID.test(siteId) || mediaIds.length === 0 || mediaIds.length > NOMBRE_IMAGES_PAR_SITE || !mediaIds.every((id) => typeof id === "string" && UUID.test(id))) {
    return apiError("invalid_request", 400, "Requête invalide.");
  }

  const { data: site } = await supabase.from("sites_generes").select("id").eq("id", siteId).eq("user_id", user.id).maybeSingle();
  if (!site) return apiError("not_found", 404, "Site introuvable.");

  // medias n'a pas de policy d'écriture : mise à jour par le service role, limitée à l'utilisateur.
  const { error } = await createSupabaseAdminClient()
    .from("medias")
    .update({ site_id: siteId })
    .eq("user_id", user.id)
    .in("id", mediaIds as string[]);
  if (error) {
    console.error("[media/rattacher-site]", error.message);
    return apiError("media_service_indisponible", 503, "Rattachement impossible.");
  }
  return NextResponse.json({ ok: true });
}
