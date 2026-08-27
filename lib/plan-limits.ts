import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "pro" | "agency";
export type UsageFeature = "audit_ia" | "site_builder" | "finder_alternatives";

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
  pro:    { produitsMax: null, produitsBoutiqueMax: 200, simulationsMax: null, sitesParMoisMax: null, auditsParMoisMax: 30, alternativesParMoisMax: null },
  agency: { produitsMax: null, produitsBoutiqueMax: 200, simulationsMax: null, sitesParMoisMax: null, auditsParMoisMax: 100, alternativesParMoisMax: null },
};

const PLAN_LABEL: Record<Plan, string> = { free: "Free", pro: "Pro", agency: "Agency" };

export function planLabel(plan: Plan): string {
  return PLAN_LABEL[plan];
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
