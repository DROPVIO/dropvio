import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "pro" | "agency";
// inspiration_ia, boutique_ia et textes_ia : migration 043 (contrainte usage_mensuel_feature_check).
export type UsageFeature =
  | "audit_ia"
  | "site_builder"
  | "finder_alternatives"
  | "inspiration_ia"
  | "boutique_ia"
  | "textes_ia";

// Budget IA mensuel en euros par plan : plafonne le coût de toutes les fonctions IA réunies
// (calculé depuis usage_mensuel.tokens_entree / tokens_sortie, voir lib/ai-budget.ts). Les
// quotas par fonction ci-dessous (sites, audits) restent en place ; le budget s'ajoute à eux.
export const AI_BUDGET_EUR_PAR_PLAN: Record<Plan, number> = {
  free: 0.5,
  pro: 6,
  agency: 28,
};

// null = illimité
export const PLAN_LIMITS: Record<Plan, {
  produitsMax: number | null;
  produitsBoutiqueMax: number | null;
  simulationsMax: number | null;
  sitesParMoisMax: number | null;
  auditsParMoisMax: number | null;
  alternativesParMoisMax: number | null;
}> = {
  free:   { produitsMax: 1000, produitsBoutiqueMax: 10, simulationsMax: 2, sitesParMoisMax: 5, auditsParMoisMax: 0, alternativesParMoisMax: 5 },
  pro:    { produitsMax: null, produitsBoutiqueMax: 200, simulationsMax: null, sitesParMoisMax: 20, auditsParMoisMax: 30, alternativesParMoisMax: null },
  agency: { produitsMax: null, produitsBoutiqueMax: 200, simulationsMax: null, sitesParMoisMax: 50, auditsParMoisMax: 100, alternativesParMoisMax: null },
};

const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro", agency: "Agency" };

export function planLabel(plan: Plan): string {
  return PLAN_LABEL[plan];
}

const PLANS_ORDONNES: Plan[] = ["free", "pro", "agency"];

// Premier plan au-dessus de `plan` qui autorise plus de produits par boutique, ou null si
// aucun plan ne va plus loin (le message de limite ne propose alors pas de changer de plan).
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
