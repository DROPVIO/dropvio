import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { apiError } from "@/lib/api-errors";
import { estEtapeGeneration, idSuiviValide } from "@/lib/progression-site";

// Avancement réel d'une création de site (table progression_generation_site, migration 071),
// interrogé par le Site Builder toutes les 1,5 s pendant la génération. Lecture avec la session
// de l'utilisateur : la RLS ne laisse voir que ses propres lignes. Réponse « inconnu » si la
// ligne n'existe pas encore, ou si la migration 071 n'est pas appliquée : l'interface garde
// alors sa progression estimée.
export async function GET(request: NextRequest) {
  const { supabase, user } = await getServerUserPlanOnly();
  if (!user) return apiError("auth_required", 401, "Connectez-vous pour suivre la création du site.");

  const id = idSuiviValide(new URL(request.url).searchParams.get("id"));
  if (!id) return apiError("invalid_request", 400, "Identifiant de suivi invalide.");

  const { data, error } = await supabase
    .from("progression_generation_site")
    .select("etape, caracteres, appel, maj_le")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data || !estEtapeGeneration(data.etape)) {
    return NextResponse.json({ etat: "inconnu" }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { etat: "connu", etape: data.etape, caracteres: data.caracteres, appel: data.appel, majLe: data.maj_le },
    { headers: { "Cache-Control": "no-store" } }
  );
}
