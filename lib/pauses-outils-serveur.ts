// Pauses par outil, côté serveur : lecture de l'état (crédits restants, fin de pause) et
// réservation atomique des crédits (fonction SQL outils_credits_reserver, migration 054).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanOuAucun } from "@/lib/plan-limits";
import { configOutil, planAvecPauses, type OutilIa } from "./pauses-outils";
import { etatOutil, type EtatOutil, type UsageOutil } from "./pauses-outils-regles";

// Table ou fonction absente (migration 054 non appliquée).
const OBJET_ABSENT = new Set(["42P01", "PGRST205", "42883", "PGRST202"]);

export type EtatOutilServeur = EtatOutil | { statut: "migration" };

/** État de l'outil pour l'utilisateur, ou null si le plan n'a pas de pause (Expert). */
export async function lireEtatOutil(supabase: SupabaseClient, userId: string, plan: PlanOuAucun, outil: OutilIa): Promise<EtatOutilServeur | null> {
  if (!planAvecPauses(plan)) return null;
  const config = configOutil(plan, outil);
  if (!config) return { statut: "a_definir" };
  const maintenant = Date.now();
  // Une pause terminée compte encore si elle s'est finie dans la période : on remonte d'une
  // période et d'une pause.
  const depuis = new Date(maintenant - config.periodeMs - config.pauseMs).toISOString();
  const { data, error } = await supabase
    .from("outils_usage")
    .select("id, credits, declenche_pause, rendu, created_at")
    .eq("user_id", userId)
    .eq("outil", outil)
    .gt("created_at", depuis);
  if (error) {
    if (OBJET_ABSENT.has(error.code)) return { statut: "migration" };
    throw new Error(error.message);
  }
  const usages: UsageOutil[] = (data ?? []).map((l) => ({
    id: l.id as string,
    credits: Number(l.credits),
    date: new Date(l.created_at as string).getTime(),
    declenchePause: Boolean(l.declenche_pause),
    rendu: Boolean(l.rendu),
  }));
  return etatOutil(config, usages, maintenant);
}

export type ReservationOutil =
  | { ok: true; reservationId: string | null }
  | { ok: false; raison: "a_definir" | "migration" | "erreur" }
  | { ok: false; raison: "pause"; finPause: number };

/** Réserve les crédits d'une image pour cet outil AVANT la génération. Plan sans pause (Expert) :
 *  rien à réserver (reservationId null). */
export async function reserverCreditsOutil(admin: SupabaseClient, userId: string, plan: PlanOuAucun, outil: OutilIa): Promise<ReservationOutil> {
  if (!planAvecPauses(plan)) return { ok: true, reservationId: null };
  const config = configOutil(plan, outil);
  if (!config) return { ok: false, raison: "a_definir" };
  const { data, error } = await admin.rpc("outils_credits_reserver", {
    p_user_id: userId,
    p_outil: outil,
    p_cout: config.cout,
    p_credits_max: config.creditsMax,
    p_periode_minutes: Math.round(config.periodeMs / 60_000),
    p_pause_minutes: Math.round(config.pauseMs / 60_000),
  });
  if (error) {
    if (OBJET_ABSENT.has(error.code)) return { ok: false, raison: "migration" };
    console.error("[pauses-outils] Réservation impossible :", error.message);
    return { ok: false, raison: "erreur" };
  }
  const ligne = (Array.isArray(data) ? data[0] : data) as { reservation_id: string | null; statut: string; fin_pause: string | null } | undefined;
  if (ligne?.statut === "ok" && ligne.reservation_id) return { ok: true, reservationId: ligne.reservation_id };
  if (ligne?.statut === "pause" && ligne.fin_pause) return { ok: false, raison: "pause", finPause: new Date(ligne.fin_pause).getTime() };
  return { ok: false, raison: "erreur" };
}

/** Rend les crédits d'une génération en échec. Ne lève jamais. */
export async function rendreCreditsOutil(admin: SupabaseClient, reservationId: string | null): Promise<void> {
  if (!reservationId) return;
  const { error } = await admin.rpc("outils_credits_rendre", { p_reservation_id: reservationId });
  if (error) console.error(`[pauses-outils] Crédits non rendus (${reservationId}) :`, error.message);
}
