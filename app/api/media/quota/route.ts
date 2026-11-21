import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { lireQuotaImages } from "@/lib/media/quota-images-serveur";
import { estOutilIa } from "@/lib/pauses-outils";
import { lireEtatOutil } from "@/lib/pauses-outils-serveur";
import { apiError } from "@/lib/api-errors";

// Images encore disponibles ce mois-ci pour le compte connecté (quota Expert, ou budget IA des
// plans Pro et Agency). quota null : pas de plan payant, donc pas de génération.
// ?outil=<id> (lib/pauses-outils.ts) : ajoute l'état de cet outil (crédits restants de la
// période, fin de pause, ou réglages à définir). outil null : plan sans pause (Expert).
export async function GET(request: Request) {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour voir ton quota d'images.");
  }
  const demande = new URL(request.url).searchParams.get("outil");
  if (demande !== null && !estOutilIa(demande)) {
    return apiError("invalid_request", 400, "Outil inconnu.");
  }
  try {
    const [quota, outil] = await Promise.all([
      lireQuotaImages(supabase, user.id, plan),
      demande && estOutilIa(demande) ? lireEtatOutil(supabase, user.id, plan, demande) : Promise.resolve(null),
    ]);
    return NextResponse.json({ quota, outil });
  } catch (error) {
    console.error("[media/quota]", error instanceof Error ? error.message : "Erreur inconnue");
    return apiError("media_service_indisponible", 503, "Quota d'images illisible.");
  }
}
