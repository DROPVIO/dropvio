import { NextResponse } from "next/server";

// Réponse d'erreur des routes API : `code` est une clé du namespace `apiErrors` des messages,
// traduite côté client par useApiErrorMessage (lib/use-api-error.ts). `error` reste un texte
// français lisible pour les logs et les appelants qui n'utilisent pas le code.
export function apiError(
  code: string,
  status: number,
  error: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error, code, ...extra }, { status });
}

// Code PostgreSQL « unique_violation ».
export const UNIQUE_VIOLATION = "23505";

// Compte connecté sans abonnement (plan null, ou Expert sans période en cours) : le catalogue
// des produits gagnants lui est fermé.
export function reponseAbonnementRequis(): NextResponse {
  return apiError("abonnement_requis", 403, "Choisissez un abonnement pour accéder au catalogue.");
}
