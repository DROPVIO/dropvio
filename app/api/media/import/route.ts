import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BUCKET_MEDIATHEQUE, extensionDe, stockageMedia } from "@/lib/media/mediatheque";
import { MEDIA_MAX_OCTETS, MEDIA_MIMES, type MediaMime } from "@/lib/media/constantes";
import { apiError } from "@/lib/api-errors";

// Prépare un envoi direct du navigateur vers Supabase Storage : une route Vercel refuserait les
// fichiers au-delà de 4,5 Mo environ. Le fichier réel est contrôlé par import/confirmer.
export async function POST(request: Request) {
  const { user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour importer une image.");
  }

  const body = await request.json().catch(() => null);
  const mime = body?.mime as MediaMime;
  const taille = body?.taille;
  if (!MEDIA_MIMES.includes(mime)) {
    return apiError("media_type_invalide", 400, "Formats acceptés : jpg, png et webp.");
  }
  if (typeof taille !== "number" || taille <= 0 || taille > MEDIA_MAX_OCTETS) {
    return apiError("media_trop_lourd", 400, "L'image dépasse 10 Mo.");
  }

  const admin = createSupabaseAdminClient();
  const stockage = await stockageMedia(admin, user.id, plan);
  if (stockage.utilise + taille > stockage.max) {
    return apiError("media_stockage_plein", 403, "Espace de stockage plein.");
  }

  const chemin = `${user.id}/${randomUUID()}.${extensionDe(mime)}`;
  const { data, error } = await admin.storage.from(BUCKET_MEDIATHEQUE).createSignedUploadUrl(chemin);
  if (error || !data) {
    return apiError("server_error", 500, error?.message ?? "Envoi impossible.");
  }

  return NextResponse.json({ chemin, token: data.token });
}
