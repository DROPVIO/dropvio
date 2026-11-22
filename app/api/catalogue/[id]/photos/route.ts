import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { lirePhotos, photosValides, remplacerPhotos } from "@/lib/catalogue-photos";
import { apiError, reponseAbonnementRequis } from "@/lib/api-errors";

// Photos d'un produit du catalogue POUR L'UTILISATEUR CONNECTÉ (table catalogue_photos, migration
// 053). Le catalogue commun n'est jamais modifié. PUT remplace la liste ordonnée (la première
// photo est la principale) ; POST ajoute des photos à la suite (« Enregistrer » du Studio IA).
// Aucune limite de photos par produit.

async function produitExiste(supabase: Awaited<ReturnType<typeof getServerUserPlanOnly>>["supabase"], id: string) {
  const { data } = await supabase.from("produits").select("id").eq("id", id).maybeSingle();
  return Boolean(data);
}

function reponseTableAbsente() {
  return apiError("catalogue_photos_migration_requise", 503, "Photos indisponibles : migration 053 non appliquée.");
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) return apiError("auth_required", 401, "Connecte-toi pour modifier les photos.");

  if (plan === null) return reponseAbonnementRequis();
  const body = await request.json().catch(() => null);
  const photos = photosValides(body?.photos);
  if (!photos) return apiError("invalid_request", 400, "Photos invalides.");
  if (!(await produitExiste(supabase, id))) return apiError("not_found", 404, "Produit introuvable.");

  const resultat = await remplacerPhotos(supabase, user.id, id, photos);
  if (!resultat.ok) return resultat.tableAbsente ? reponseTableAbsente() : apiError("server_error", 500, resultat.message);
  return NextResponse.json({ photos });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) return apiError("auth_required", 401, "Connecte-toi pour modifier les photos.");

  if (plan === null) return reponseAbonnementRequis();
  const body = await request.json().catch(() => null);
  const ajout = photosValides(body?.ajouter);
  if (!ajout || ajout.length === 0) return apiError("invalid_request", 400, "Photos invalides.");
  if (!(await produitExiste(supabase, id))) return apiError("not_found", 404, "Produit introuvable.");

  let actuelles: string[];
  try {
    const lecture = await lirePhotos(supabase, user.id, id);
    if (!lecture.disponible) return reponseTableAbsente();
    actuelles = lecture.photos;
  } catch (error) {
    return apiError("server_error", 500, error instanceof Error ? error.message : "Lecture impossible.");
  }
  const photos = [...new Set([...actuelles, ...ajout])];
  const resultat = await remplacerPhotos(supabase, user.id, id, photos);
  if (!resultat.ok) return resultat.tableAbsente ? reponseTableAbsente() : apiError("server_error", 500, resultat.message);
  return NextResponse.json({ photos });
}
