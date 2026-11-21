import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPERT_MODELS, type ExpertModel } from "./expert-pricing";
import { getPeriodeExpert } from "./expert-quota";

export type ReservationSite = { id: string; modele: ExpertModel };

// Réserve une unité de site : d'abord sur le modèle de la période (quota inclus puis crédits),
// sinon sur les crédits rachetés d'un autre modèle, qui s'exécute alors avec ce modèle-là.
export async function reserverSiteExpert(admin: SupabaseClient, userId: string): Promise<ReservationSite | null> {
  const periode = await getPeriodeExpert(admin, userId);
  if (!periode) return null;

  const modelePeriode = periode.modele as ExpertModel;
  const modeles = [modelePeriode, ...(Object.keys(EXPERT_MODELS) as ExpertModel[]).filter((modele) => modele !== modelePeriode)];

  for (const modele of modeles) {
    const { data, error } = await admin.rpc("expert_consommer", { p_user_id: userId, p_type: "site", p_modele: modele });
    if (error) throw new Error(error.message);
    if (data) return { id: data as string, modele };
  }
  return null;
}

// L'écriture en cache coûte 1,25 fois l'entrée normale ; la lecture a son propre tarif.
const MULTIPLICATEUR_ECRITURE_CACHE = 1.25;

export type TokensSite = { entree: number; sortie: number; cacheEcriture: number; cacheLecture: number };

export function coutSiteUsd(modele: ExpertModel, tokens: TokensSite): number {
  const { inputUsdParMillion, outputUsdParMillion, cacheLectureUsdParMillion } = EXPERT_MODELS[modele];
  return (
    (tokens.entree + tokens.cacheEcriture * MULTIPLICATEUR_ECRITURE_CACHE) * inputUsdParMillion +
    tokens.cacheLecture * cacheLectureUsdParMillion +
    tokens.sortie * outputUsdParMillion
  ) / 1_000_000;
}

// Appelée en fin de génération, en cas de succès comme d'échec : un échec rend l'unité mais ses
// tokens sont enregistrés, car ils ont coûté. Ne lève jamais : la réponse à l'utilisateur ne
// doit pas dépendre de cette écriture, et le cron rembourse une réservation restée ouverte.
export async function finaliserSiteExpert(
  admin: SupabaseClient,
  reservation: ReservationSite,
  reussie: boolean,
  tokens: TokensSite
): Promise<void> {
  const { error } = await admin.rpc("expert_finaliser", {
    p_reservation_id: reservation.id,
    p_reussie: reussie,
    p_tokens_entree: tokens.entree + tokens.cacheEcriture + tokens.cacheLecture,
    p_tokens_sortie: tokens.sortie,
    p_cout_usd: coutSiteUsd(reservation.modele, tokens),
  });
  if (error) console.error("[expert-generation] Finalisation impossible :", error.message);
}
