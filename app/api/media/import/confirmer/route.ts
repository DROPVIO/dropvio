import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { BUCKET_MEDIATHEQUE, detecterMime, extensionDe, stockageMedia } from "@/lib/media/mediatheque";
import { MEDIA_MAX_OCTETS } from "@/lib/media/constantes";
import { apiError, UNIQUE_VIOLATION, erreurServeur } from "@/lib/api-errors";

const CHEMIN = /^([0-9a-f-]{36})\/([0-9a-f-]{36})\.(jpg|png|webp)$/;

// Enregistre un fichier envoyé directement à Storage, après contrôle de son contenu réel : un
// fichier renommé en .png est supprimé, pas ajouté à la médiathèque.
export async function POST(request: Request) {
  const { user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connectez-vous pour importer une image.");
  }

  const body = await request.json().catch(() => null);
  const chemin = typeof body?.chemin === "string" ? body.chemin : "";
  const correspondance = CHEMIN.exec(chemin);
  if (!correspondance || correspondance[1] !== user.id) {
    return apiError("media_type_invalide", 400, "Fichier invalide.");
  }

  const admin = createSupabaseAdminClient();
  const stockageFichiers = admin.storage.from(BUCKET_MEDIATHEQUE);
  const { data: fichier, error: lectureError } = await stockageFichiers.download(chemin);
  if (lectureError || !fichier) {
    return apiError("media_introuvable", 404, "Fichier introuvable.");
  }

  const octets = new Uint8Array(await fichier.arrayBuffer());
  const mime = detecterMime(octets);
  const refus = async (code: string, message: string, statut: number) => {
    await stockageFichiers.remove([chemin]);
    return apiError(code, statut, message);
  };

  if (!mime || extensionDe(mime) !== correspondance[3]) {
    return refus("media_type_invalide", "Formats acceptés : jpg, png et webp.", 400);
  }
  if (octets.length > MEDIA_MAX_OCTETS) {
    return refus("media_trop_lourd", "L'image dépasse 10 Mo.", 400);
  }
  const stockage = await stockageMedia(admin, user.id, plan);
  if (stockage.utilise + octets.length > stockage.max) {
    return refus("media_stockage_plein", "Espace de stockage plein.", 403);
  }

  const { error } = await admin.from("medias").insert({
    id: correspondance[2],
    user_id: user.id,
    type: "image",
    origine: "import",
    taille_octets: octets.length,
    mime,
    chemin,
  });
  if (error && error.code !== UNIQUE_VIOLATION) {
    return erreurServeur("api/media/import/confirmer", error);
  }

  return NextResponse.json({ id: correspondance[2] });
}
