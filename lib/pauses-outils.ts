// Pauses par outil (plans Pro et Agency) : configuration partagée, sans dépendance serveur.
// S'ajoute au quota mensuel en euros (lib/media/quota-images-serveur.ts) et au garde-fou horaire
// de /api/media/generer, sans les remplacer. Le plan Expert n'a pas de pause : il reste limité
// par son quota d'images mensuel.
//
// Configuration dans le code, comme les autres limites par plan (PLAN_LIMITS,
// AI_BUDGET_EUR_PAR_PLAN, MEDIA_PAR_PLAN) : seul l'usage est en base (migration 054, proposée).
import type { Plan } from "@/lib/plan-limits";

// Identifiants stables : ils sont enregistrés en base (outils_usage.outil) et envoyés par le
// navigateur à /api/media/generer.
export const OUTILS_IA = [
  // Studio IA, onglet Prompt libre. Compte aussi le générateur de la fenêtre « Choisir une image »
  // (même composant, même prompt libre, ouvert depuis la page boutique et le Catalogue).
  "studio_prompt_libre",
  // Studio IA, onglet Images produits.
  "studio_images_produits",
  // Page boutique, génération en lot des images de tous les produits.
  "boutique_images_produits",
  // Site Builder (générateur de landing page) : images générées avec le site (source « Générer
  // avec l'IA » des photos du site). La génération du HTML (Claude) n'est pas une image : elle
  // reste limitée par le budget IA et les limites glissantes existantes.
  "landing_page",
] as const;
export type OutilIa = (typeof OUTILS_IA)[number];

export function estOutilIa(valeur: unknown): valeur is OutilIa {
  return typeof valeur === "string" && (OUTILS_IA as readonly string[]).includes(valeur);
}

// Crédits consommés par image générée, par outil : 1 crédit = 1 image partout (une image coûte
// le même prix quel que soit l'outil). null = réglage manquant, l'outil serait bloqué
// (« réglages à définir ») plutôt que de tourner sans limite.
export const CREDITS_PAR_IMAGE: Record<OutilIa, number | null> = {
  studio_prompt_libre: 1,
  studio_images_produits: 1,
  boutique_images_produits: 1,
  landing_page: 1,
};

export type ReglagePause = {
  /** Crédits utilisables pendant une période d'usage. */
  credits_max: number | null;
  /** Durée de la période d'usage glissante, en minutes. */
  periode_minutes: number | null;
  /** Durée de la pause une fois credits_max atteint, en minutes. */
  pause_minutes: number | null;
};

// Plans soumis aux pauses. Expert : aucune pause (quota mensuel seulement). Sans plan payant :
// aucune génération (lib/media/config.ts).
export const PLANS_AVEC_PAUSES = ["pro", "agency"] as const satisfies readonly Plan[];
export type PlanAvecPauses = (typeof PLANS_AVEC_PAUSES)[number];

export function planAvecPauses(plan: Plan): plan is PlanAvecPauses {
  return (PLANS_AVEC_PAUSES as readonly Plan[]).includes(plan);
}

// Réglages validés. Chaque outil a son propre compteur ; le budget images du mois
// (IMAGE_BUDGET_EUR_PAR_PLAN) reste la limite de coût, ces pauses répartissent l'usage dans le
// temps. landing_page : 3 images par site (NOMBRE_IMAGES_PAR_SITE), soit 2 sites par période en
// Pro et 3 en Agency.
export const PAUSES_PAR_PLAN: Record<PlanAvecPauses, Record<OutilIa, ReglagePause>> = {
  pro: {
    studio_prompt_libre: { credits_max: 5, periode_minutes: 60, pause_minutes: 60 },
    studio_images_produits: { credits_max: 5, periode_minutes: 60, pause_minutes: 60 },
    boutique_images_produits: { credits_max: 10, periode_minutes: 60, pause_minutes: 120 },
    landing_page: { credits_max: 6, periode_minutes: 60, pause_minutes: 60 },
  },
  agency: {
    studio_prompt_libre: { credits_max: 10, periode_minutes: 60, pause_minutes: 30 },
    studio_images_produits: { credits_max: 10, periode_minutes: 60, pause_minutes: 30 },
    boutique_images_produits: { credits_max: 20, periode_minutes: 60, pause_minutes: 60 },
    landing_page: { credits_max: 9, periode_minutes: 60, pause_minutes: 30 },
  },
};

export type ConfigOutil = { cout: number; creditsMax: number; periodeMs: number; pauseMs: number };

function positif(n: number | null): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

/** Réglages complets de cet outil pour ce plan, ou null s'il en manque un (outil bloqué).
 *  `reglages` et `couts` : injectables pour les tests. */
export function configOutil(
  plan: PlanAvecPauses,
  outil: OutilIa,
  reglages: Record<PlanAvecPauses, Record<OutilIa, ReglagePause>> = PAUSES_PAR_PLAN,
  couts: Record<OutilIa, number | null> = CREDITS_PAR_IMAGE
): ConfigOutil | null {
  const cout = couts[outil];
  const { credits_max, periode_minutes, pause_minutes } = reglages[plan][outil];
  // Une image doit tenir dans une période, sinon l'outil ne pourrait jamais servir.
  if (!positif(cout) || !positif(credits_max) || !positif(periode_minutes) || !positif(pause_minutes) || cout > credits_max) return null;
  return { cout, creditsMax: credits_max, periodeMs: periode_minutes * 60_000, pauseMs: pause_minutes * 60_000 };
}
