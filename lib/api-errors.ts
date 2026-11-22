import { randomUUID } from "crypto";
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

// Erreur technique (base, stockage, fournisseur…) : le détail ne part jamais au navigateur. Il
// est écrit dans les logs avec un identifiant, et l'utilisateur reçoit un message générique avec
// cette référence, à transmettre au support pour retrouver la ligne de log.
export function erreurServeur(contexte: string, erreur: unknown): NextResponse {
  const reference = randomUUID();
  const message = erreur instanceof Error ? erreur.message : typeof erreur === "string" ? erreur : JSON.stringify(erreur);
  const pile = erreur instanceof Error ? erreur.stack : undefined;
  console.error(`[${contexte}] Erreur ${reference} :`, message, pile ?? "");
  return apiError("server_error", 500, "Une erreur est survenue. Réessayez dans un instant.", { values: { reference } });
}
