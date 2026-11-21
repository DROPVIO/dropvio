// Règles des pauses par outil, en fonctions pures (testées par lib/pauses-outils-regles.test.ts).
// La fonction SQL outils_credits_reserver (migration 054, proposée) applique exactement les
// mêmes règles côté base, sous verrou, pour qu'un deuxième onglet ne puisse pas les contourner.
//
// Règles :
// - une réservation n'est acceptée que si elle tient dans les crédits restants de la période :
//   credits_max n'est jamais dépassé ;
// - la réservation après laquelle il ne reste plus de quoi générer une image de plus
//   (restants < coût) déclenche la pause ; la pause commence à sa date et dure pause_minutes ;
// - la période d'usage est glissante (periode_minutes) et repart à zéro à la fin d'une pause :
//   les crédits consommés avant la fin de la dernière pause ne comptent plus ;
// - une réservation rendue (génération en échec) ne compte plus, et si c'est elle qui avait
//   déclenché la pause, la pause est levée.
import type { ConfigOutil } from "./pauses-outils";

export type UsageOutil = {
  id: string;
  credits: number;
  /** Date de la réservation (ms depuis l'epoch). */
  date: number;
  declenchePause: boolean;
  rendu: boolean;
};

export type EtatOutil =
  | { statut: "a_definir" }
  | { statut: "pause"; finPause: number }
  | { statut: "actif"; restants: number; creditsMax: number; cout: number; imagesPossibles: number };

/** Fin de la pause en cours à `maintenant`, ou null. */
export function finPauseEnCours(usages: readonly UsageOutil[], config: ConfigOutil, maintenant: number): number | null {
  let fin: number | null = null;
  for (const u of usages) {
    if (u.rendu || !u.declenchePause) continue;
    const finU = u.date + config.pauseMs;
    if (finU > maintenant && (fin === null || finU > fin)) fin = finU;
  }
  return fin;
}

/** Fin de la dernière pause terminée : la période d'usage ne remonte jamais avant. */
function finDernierePauseTerminee(usages: readonly UsageOutil[], config: ConfigOutil, maintenant: number): number {
  let fin = -Infinity;
  for (const u of usages) {
    if (u.rendu || !u.declenchePause) continue;
    const finU = u.date + config.pauseMs;
    if (finU <= maintenant && finU > fin) fin = finU;
  }
  return fin;
}

/** Crédits consommés dans la période d'usage en cours. */
export function creditsUtilises(usages: readonly UsageOutil[], config: ConfigOutil, maintenant: number): number {
  const debut = Math.max(maintenant - config.periodeMs, finDernierePauseTerminee(usages, config, maintenant));
  return usages.filter((u) => !u.rendu && u.date > debut && u.date <= maintenant).reduce((total, u) => total + u.credits, 0);
}

export function etatOutil(config: ConfigOutil | null, usages: readonly UsageOutil[], maintenant: number): EtatOutil {
  if (!config) return { statut: "a_definir" };
  const finPause = finPauseEnCours(usages, config, maintenant);
  if (finPause !== null) return { statut: "pause", finPause };
  const restants = Math.max(0, config.creditsMax - creditsUtilises(usages, config, maintenant));
  return { statut: "actif", restants, creditsMax: config.creditsMax, cout: config.cout, imagesPossibles: Math.floor(restants / config.cout) };
}

export type DecisionReservation =
  | { ok: true; credits: number; declenchePause: boolean; restantsApres: number; finPause: number | null }
  | { ok: false; raison: "a_definir" }
  | { ok: false; raison: "pause"; finPause: number };

/** Décision pour une image de plus à `maintenant`. Ne modifie rien : l'appelant enregistre
 *  l'usage si ok (avec declenchePause). */
export function deciderReservation(config: ConfigOutil | null, usages: readonly UsageOutil[], maintenant: number): DecisionReservation {
  const etat = etatOutil(config, usages, maintenant);
  if (etat.statut === "a_definir" || !config) return { ok: false, raison: "a_definir" };
  if (etat.statut === "pause") return { ok: false, raison: "pause", finPause: etat.finPause };
  // Plus de quoi générer une image sans pause enregistrée (ex. réglages modifiés entre-temps) :
  // la pause démarre maintenant.
  if (etat.restants < config.cout) return { ok: false, raison: "pause", finPause: maintenant + config.pauseMs };
  const restantsApres = etat.restants - config.cout;
  const declenchePause = restantsApres < config.cout;
  return { ok: true, credits: config.cout, declenchePause, restantsApres, finPause: declenchePause ? maintenant + config.pauseMs : null };
}

/** Rend une réservation (génération en échec) : ses crédits ne comptent plus, et la pause
 *  qu'elle avait déclenchée est levée. */
export function rendreReservation(usages: readonly UsageOutil[], id: string): UsageOutil[] {
  return usages.map((u) => (u.id === id ? { ...u, rendu: true } : u));
}
