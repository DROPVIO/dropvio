// Configuration de la génération d'images : quel fournisseur est appelé pour quel plan, et si
// l'usage est inclus dans le plan. Source unique pour les routes (app/api/media/generer) et pour
// la mention affichée sous les générateurs : ce qui est affiché est donc, par construction, ce
// qui est appelé. Sans dépendance serveur (importable côté client).
import type { Plan } from "@/lib/plan-limits";
import { OPENAI_IMAGE_MODEL, OPENAI_IMAGE_URL } from "./openai-constantes";

// Fournisseurs réellement branchés dans lib/media. `domaine` est l'hôte appelé : un test vérifie
// que la génération appelle bien ce domaine-là.
export const FOURNISSEURS = {
  openai: { libelle: "OpenAI", modele: OPENAI_IMAGE_MODEL, domaine: new URL(OPENAI_IMAGE_URL).hostname },
} as const satisfies Record<string, { libelle: string; modele: string; domaine: string }>;

export type FournisseurId = keyof typeof FOURNISSEURS;

type ReglageMedia = {
  // Fournisseur appelé pour ce plan ; null = génération non proposée.
  generateur: FournisseurId | null;
  // Usage compris dans le plan (true), facturé en plus (false), ou pas encore décidé (null :
  // la mention n'affiche alors que le fournisseur).
  inclus: boolean | null;
};

// Génération d'images réservée aux plans payants (Pro, Agency, Expert), toujours limitée par le
// quota du mois (lib/media/quota-images-serveur.ts) : budget images pour Pro et Agency, quota
// d'images pour Expert. « free » est l'état d'un compte sans plan payant : aucun accès.
// [INCLUS_DANS_PLAN À CONFIRMER] : inclusion non décidée, laissée à null partout.
export const MEDIA_PAR_PLAN: Record<Plan, ReglageMedia> = {
  free: { generateur: null, inclus: null },
  pro: { generateur: "openai", inclus: null },
  agency: { generateur: "openai", inclus: null },
  expert: { generateur: "openai", inclus: null },
};

/** Réglage effectif : sans générateur, l'inclusion n'a pas de sens et vaut null. */
export function reglageMedia(plan: Plan): ReglageMedia {
  const { generateur, inclus } = MEDIA_PAR_PLAN[plan];
  return { generateur, inclus: generateur ? inclus : null };
}

export function generationDisponible(plan: Plan): boolean {
  return reglageMedia(plan).generateur !== null;
}

/** Ce que la mention doit dire : null si aucune génération n'est proposée. */
export function mentionGenerateur(plan: Plan): { fournisseur: string; inclus: boolean | null } | null {
  const { generateur, inclus } = reglageMedia(plan);
  return generateur ? { fournisseur: FOURNISSEURS[generateur].libelle, inclus } : null;
}
