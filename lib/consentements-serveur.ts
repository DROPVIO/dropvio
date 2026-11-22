// Preuve du consentement avant paiement, enregistrée par le serveur (service role) dans
// consentements_achat (migration 066) : utilisateur, type d'achat, texte exact des deux cases
// dans la langue affichée, horodatage, adresse IP. Sans les deux cases cochées : 400.
import type { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "./supabase-admin";
import { apiError, erreurServeur } from "./api-errors";
import { DEFAULT_LOCALE, isAppLocale } from "./locale";
import { TEXTES_CONSENTEMENT, consentementsComplets, familleDeAchat, type TypeAchat } from "./consentements";

/** Adresse IP du client : premier élément de x-forwarded-for (proxy Vercel), sinon x-real-ip. */
export function adresseIp(request: Request): string | null {
  const transmise = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return transmise || request.headers.get("x-real-ip") || null;
}

/** Vérifie et enregistre le consentement. Renvoie une réponse d'erreur à retourner telle quelle,
 *  ou null si le paiement peut continuer. */
export async function exigerConsentement(
  request: Request,
  corps: unknown,
  userId: string,
  typeAchat: TypeAchat
): Promise<NextResponse | null> {
  const consentements = (corps as { consentements?: unknown } | null)?.consentements;
  if (!consentementsComplets(consentements)) {
    return apiError("consentement_requis", 400, "Cochez les deux cases pour continuer vers le paiement.");
  }

  const langue = isAppLocale(consentements.langue) ? consentements.langue : DEFAULT_LOCALE;
  const [case1, case2] = TEXTES_CONSENTEMENT[familleDeAchat(typeAchat)][langue];
  const { error } = await createSupabaseAdminClient().from("consentements_achat").insert({
    user_id: userId,
    type_achat: typeAchat,
    texte_case_1: case1,
    texte_case_2: case2,
    langue,
    adresse_ip: adresseIp(request),
  });
  // Sans preuve enregistrée, pas de paiement : le consentement doit pouvoir être démontré.
  if (error) return erreurServeur("consentements", error);
  return null;
}
