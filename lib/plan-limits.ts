import type { SupabaseClient } from "@supabase/supabase-js";

// Seuls trois plans existent. Un compte sans abonnement (plan null en base, ou Expert sans
// période payée en cours) n'a accès à aucun outil : toutes ses limites valent 0.
export type Plan = "pro" | "agency" | "expert";
export type PlanOuAucun = Plan | null;
// inspiration_ia, boutique_ia et textes_ia : migration 043 (contrainte usage_mensuel_feature_check).
export type UsageFeature =
  | "audit_ia"
  | "site_builder"
  | "finder_alternatives"
  | "inspiration_ia"
  | "boutique_ia"
  | "textes_ia"
  // Images générées par les plans Pro et Agency (compteur = nombre d'images du mois, décompté
  // du budget images IMAGE_BUDGET_EUR_PAR_PLAN au prix IMAGE_PRICE_EUR, jamais du budget IA).
  // Migration 052 requise.
  | "images_ia";

// Budget IA mensuel en euros par plan : plafonne le coût de toutes les fonctions IA réunies
// (calculé depuis usage_mensuel.tokens_entree / tokens_sortie, voir lib/ai-budget.ts). Les
// quotas par fonction ci-dessous (sites, audits) restent en place ; le budget s'ajoute à eux.
// Budget Claude du plan Pro : seule valeur saisie à la main. Agency et Expert en découlent.
const AI_BUDGET_PRO_EUR = 6;

// Agency et Expert ont 2,6 fois le budget Claude du plan Pro (6 € × 2,6 = 15,60 €). Ce budget
// ne couvre que les appels Claude (MODELE_PAR_FONCTION, lib/ai-budget.ts) : les images ont leur
// propre budget (IMAGE_BUDGET_EUR_PAR_PLAN) et les sites Expert, payés à l'unité, en sont exclus.
export const MULTIPLICATEUR_BUDGET_CLAUDE_AGENCY_EXPERT = 2.6;

const arrondiCentime = (euros: number) => Math.round(euros * 100) / 100;

export const AI_BUDGET_EUR_PAR_PLAN: Record<Plan, number> = {
  pro: AI_BUDGET_PRO_EUR,
  agency: arrondiCentime(AI_BUDGET_PRO_EUR * MULTIPLICATEUR_BUDGET_CLAUDE_AGENCY_EXPERT),
  expert: arrondiCentime(AI_BUDGET_PRO_EUR * MULTIPLICATEUR_BUDGET_CLAUDE_AGENCY_EXPERT),
};

// Limites glissantes, à la manière de Claude : part du budget mensuel utilisable sur les
// dernières 24 heures et sur les 7 derniers jours (lib/ai-budget.ts). Elles répartissent le
// budget sur tout le mois : au rythme maximal, le budget mensuel tient environ 3 semaines et
// demie (0,30 par semaine) et jamais moins de 7 jours d'utilisation (0,15 par jour).
// Contrairement au budget mensuel, ce sont des limites souples : une génération ou un audit
// démarre tant que la limite n'est pas encore atteinte, même s'il la dépasse un peu.
// Budget mensuel propre aux images générées (plans Pro et Agency), séparé du budget IA total
// ci-dessus : une image ne décompte que ce budget, un texte, un site ou un audit que le budget IA.
// Expert : quota d'images du plan (expert_periodes), hors de ce budget. Sans plan : 0.
export const IMAGE_BUDGET_EUR_PAR_PLAN: Record<Plan, number> = {
  pro: 1.5,
  agency: 3.5,
  expert: 0,
};

export const AI_BUDGET_PART_JOUR = 0.15;
export const AI_BUDGET_PART_SEMAINE = 0.3;

// Prix mensuels des abonnements : source unique de tous les prix affichés (landing, tarifs,
// FAQ, paramètres, abonnement), formatés par lib/prix.ts. Le montant débité reste celui du
// Price Stripe : à garder synchronisé à la main si un prix change.
export const PRO_PRICE_EUR = 29;
export const AGENCY_PRICE_EUR = 59;

// null = illimité. expert reprend la base Agency, sauf pour les sites : sa limite réelle vient
// de sa configuration du mois (lib/expert-quota.ts).
// produitsBoutiqueMax est aussi appliqué par la base (trigger des migrations 059/063) : toute
// modification de ces limites doit y être reportée.
export type LimitesPlan = {
  produitsMax: number | null;
  produitsBoutiqueMax: number | null;
  simulationsMax: number | null;
  sitesParMoisMax: number | null;
  auditsParMoisMax: number | null;
  alternativesParMoisMax: number | null;
};

export const PLAN_LIMITS: Record<Plan, LimitesPlan> = {
  pro:    { produitsMax: null, produitsBoutiqueMax: 200, simulationsMax: null, sitesParMoisMax: 20, auditsParMoisMax: 30, alternativesParMoisMax: null },
  // Agency : 30 sites et 50 audits, pour tenir dans le budget Claude de 15,60 € au coût maximal
  // par appel (≈ 0,23 € par site, ≈ 0,165 € par audit : 6,90 € + 8,25 € ≈ 15,15 €).
  agency: { produitsMax: null, produitsBoutiqueMax: 200, simulationsMax: null, sitesParMoisMax: 30, auditsParMoisMax: 50, alternativesParMoisMax: null },
  // Expert : aucun plafond de produits par boutique, seul le quota d'images limite la génération.
  // Expert : 90 audits par mois, pour tenir dans le budget Claude de 15,60 € au coût maximal
  // par audit (≈ 0,165 € × 90 ≈ 14,85 €). Ses sites, payés à l'unité, sont hors de ce budget.
  expert: { produitsMax: null, produitsBoutiqueMax: null, simulationsMax: null, sitesParMoisMax: 0, auditsParMoisMax: 90, alternativesParMoisMax: null },
};

// Sans plan : aucun outil, donc toutes les limites à 0 (le proxy redirige déjà ces comptes vers
// /abonnement ; ces zéros bloquent aussi les appels directs aux routes API).
const LIMITES_SANS_PLAN: LimitesPlan = {
  produitsMax: 0,
  produitsBoutiqueMax: 0,
  simulationsMax: 0,
  sitesParMoisMax: 0,
  auditsParMoisMax: 0,
  alternativesParMoisMax: 0,
};

export function limitesDuPlan(plan: PlanOuAucun): LimitesPlan {
  return plan ? PLAN_LIMITS[plan] : LIMITES_SANS_PLAN;
}

export function budgetIaEur(plan: PlanOuAucun): number {
  return plan ? AI_BUDGET_EUR_PAR_PLAN[plan] : 0;
}

export function budgetImagesEur(plan: PlanOuAucun): number {
  return plan ? IMAGE_BUDGET_EUR_PAR_PLAN[plan] : 0;
}

// Espace de la médiathèque du Studio IA, copies publiques non comprises. Sans plan : 0.
const MO = 1024 * 1024;
export const MEDIA_STOCKAGE_MAX_OCTETS: Record<Plan, number> = {
  pro: 500 * MO,
  agency: 2048 * MO,
  expert: 10240 * MO,
};

export function stockageMaxOctets(plan: PlanOuAucun): number {
  return plan ? MEDIA_STOCKAGE_MAX_OCTETS[plan] : 0;
}

const PLAN_LABEL: Record<Plan, string> = { pro: "Pro", agency: "Agency", expert: "Expert" };

export function planLabel(plan: Plan): string {
  return PLAN_LABEL[plan];
}

export function estPlan(valeur: unknown): valeur is Plan {
  return valeur === "pro" || valeur === "agency" || valeur === "expert";
}

const PLANS_ORDONNES: Plan[] = ["pro", "agency", "expert"];

// Premier plan au-dessus de `plan` qui autorise plus de produits par boutique, ou null si
// aucun plan ne va plus loin (le message de limite ne propose alors pas de changer de plan).
// Sans plan, l'appelant affiche « Choisissez un abonnement pour ajouter des produits. ».
export function planSuperieurProduitsBoutique(plan: Plan): Plan | null {
  const max = PLAN_LIMITS[plan].produitsBoutiqueMax;
  if (max === null) return null;
  for (const candidat of PLANS_ORDONNES.slice(PLANS_ORDONNES.indexOf(plan) + 1)) {
    const maxCandidat = PLAN_LIMITS[candidat].produitsBoutiqueMax;
    if (maxCandidat === null || maxCandidat > max) return candidat;
  }
  return null;
}

// Premier jour du mois calendaire en cours (UTC), au format YYYY-MM-DD — sert de clé
// de regroupement dans usage_mensuel. Se "réinitialise" naturellement au changement de mois.
export function currentMonthKey(): string {
  const d = new Date();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-01`;
}

export async function getMonthlyUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: UsageFeature
): Promise<number> {
  const { data } = await supabase
    .from("usage_mensuel")
    .select("compteur")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("mois", currentMonthKey())
    .maybeSingle();
  return data?.compteur ?? 0;
}

// Incrémente le compteur du mois en cours (insert si première utilisation, sinon update).
// Best-effort : une petite fenêtre de course est possible entre deux requêtes quasi
// simultanées du même utilisateur, tolérable pour ce niveau d'usage.
export async function incrementMonthlyUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: UsageFeature
): Promise<void> {
  const mois = currentMonthKey();
  const current = await getMonthlyUsage(supabase, userId, feature);

  if (current === 0) {
    await supabase
      .from("usage_mensuel")
      .upsert(
        { user_id: userId, feature, mois, compteur: 1 },
        { onConflict: "user_id,feature,mois" }
      );
  } else {
    await supabase
      .from("usage_mensuel")
      .update({ compteur: current + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("feature", feature)
      .eq("mois", mois);
  }
}

// Code PostgreSQL « undefined_column » — remonté par PostgREST tant que la migration 037a
// (tokens_entree / tokens_sortie sur usage_mensuel) n'est pas appliquée. Même traitement que
// dans app/api/sites-generes/[id]/route.ts pour la migration 035.
const UNDEFINED_COLUMN = "42703";

/** Ajoute la consommation de tokens d'un appel modèle au cumul du mois en cours.
 *
 *  Volontairement séparé de incrementMonthlyUsage : le quota métier (nombre de sites) et le
 *  coût en tokens n'évoluent pas au même rythme — une génération qui relance consomme deux
 *  fois des tokens pour un seul site. Les deux vivent sur la même ligne
 *  (user_id, feature, mois), donc sur le même mois glissant que le compteur.
 *
 *  Best-effort et jamais bloquant : une génération réussie ne doit pas être transformée en
 *  erreur parce que la comptabilité a échoué. En particulier, tant que 037a n'est pas
 *  appliquée, les deux colonnes n'existent pas (42703) et on se contente d'un avertissement
 *  dans les logs — sinon l'ajout de ce compteur casserait toute la génération, exactement
 *  comme la migration 032 non appliquée casse aujourd'hui la sauvegarde des sites.
 *  Renvoie false si rien n'a été enregistré (lib/ai-budget.ts s'en sert pour se replier). */
export async function logTokensUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: UsageFeature,
  tokensEntree: number,
  tokensSortie: number
): Promise<boolean> {
  if (tokensEntree <= 0 && tokensSortie <= 0) return true;

  const mois = currentMonthKey();

  const { data, error } = await supabase
    .from("usage_mensuel")
    .select("tokens_entree, tokens_sortie")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("mois", mois)
    .maybeSingle();

  if (error) {
    if (error.code === UNDEFINED_COLUMN) {
      console.warn(
        "[plan-limits] Tokens non enregistrés : applique la migration 037a_usage_mensuel_tokens.sql."
      );
    } else {
      console.warn("[plan-limits] Lecture des tokens échouée :", error.message);
    }
    return false;
  }

  // upsert en merge-duplicates : seules les colonnes envoyées sont écrites, donc `compteur`
  // garde sa valeur si la ligne existe déjà (et prend son défaut 0 à la création).
  const { error: ecritureErr } = await supabase.from("usage_mensuel").upsert(
    {
      user_id: userId,
      feature,
      mois,
      tokens_entree: (data?.tokens_entree ?? 0) + tokensEntree,
      tokens_sortie: (data?.tokens_sortie ?? 0) + tokensSortie,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,feature,mois" }
  );

  if (ecritureErr) {
    console.warn("[plan-limits] Écriture des tokens échouée :", ecritureErr.message);
    return false;
  }
  return true;
}
