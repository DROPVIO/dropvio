// Quota mensuel d'images, côté serveur. Deux sources selon le plan :
// - Expert : quota d'images de la période en cours + crédits images rachetés (expert_periodes,
//   expert_credits), réservé atomiquement par la fonction SQL expert_consommer ;
// - Pro et Agency : budget images du mois (IMAGE_BUDGET_EUR_PAR_PLAN), séparé du budget IA total,
//   une image coûtant IMAGE_PRICE_EUR. Les images sont comptées dans usage_mensuel (feature
//   images_ia, migration 052) et ne décomptent jamais le budget IA (textes, sites, audits).
// Aucun plan n'a de génération illimitée.
import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_BUDGET_EUR_PAR_PLAN, currentMonthKey, type Plan } from "@/lib/plan-limits";
import { IMAGE_PRICE_EUR } from "@/lib/expert-pricing";
import { getImagesUsedEuros } from "@/lib/ai-budget";
import { getCreditsExpert, getPeriodeExpert } from "@/lib/expert-quota";
import { sourceQuotaImages, imagesPossiblesBudget, type SourceQuotaImages } from "./quota-images-regles";

export type QuotaImages = { source: SourceQuotaImages; imagesRestantes: number; coutImageEur: number };

const FEATURE = "images_ia";
const ESSAIS_MAX = 5;
// Contrainte usage_mensuel_feature_check : 'images_ia' refusé tant que 052 n'est pas appliquée.
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

/** Images encore disponibles ce mois-ci, ou null si le plan n'a pas de génération d'images. */
export async function lireQuotaImages(supabase: SupabaseClient, userId: string, plan: Plan): Promise<QuotaImages | null> {
  const source = sourceQuotaImages(plan);
  if (!source) return null;
  if (source === "expert") {
    const [periode, credits] = await Promise.all([getPeriodeExpert(supabase, userId), getCreditsExpert(supabase, userId)]);
    const creditsImages = credits.filter((c) => c.type === "image").reduce((s, c) => s + c.quantite - c.quantite_utilisee, 0);
    const periodeImages = periode ? Math.max(0, periode.images - periode.images_utilisees) : 0;
    return { source, imagesRestantes: Math.max(0, periodeImages + creditsImages), coutImageEur: IMAGE_PRICE_EUR };
  }
  const utilise = await getImagesUsedEuros(supabase, userId);
  return { source, imagesRestantes: imagesPossiblesBudget(IMAGE_BUDGET_EUR_PAR_PLAN[plan], utilise, IMAGE_PRICE_EUR), coutImageEur: IMAGE_PRICE_EUR };
}

export type ReservationBudget = { ok: true } | { ok: false; raison: "quota" | "migration" | "erreur" };

/** Réserve une image sur le budget images du mois (Pro, Agency) AVANT l'appel au fournisseur.
 *  Incrément par comparaison-échange sur le compteur : deux générations simultanées ne peuvent
 *  pas réserver la même dernière image, et le budget restant est relu à chaque essai. */
export async function reserverImageBudget(admin: SupabaseClient, userId: string, plan: Plan): Promise<ReservationBudget> {
  const mois = currentMonthKey();
  for (let essai = 0; essai < ESSAIS_MAX; essai++) {
    let utilise: number;
    try {
      utilise = await getImagesUsedEuros(admin, userId);
    } catch {
      return { ok: false, raison: "erreur" };
    }
    if (imagesPossiblesBudget(IMAGE_BUDGET_EUR_PAR_PLAN[plan], utilise, IMAGE_PRICE_EUR) < 1) return { ok: false, raison: "quota" };

    const { data: ligne, error } = await admin
      .from("usage_mensuel")
      .select("compteur")
      .eq("user_id", userId)
      .eq("feature", FEATURE)
      .eq("mois", mois)
      .maybeSingle();
    if (error) return { ok: false, raison: "erreur" };

    if (!ligne) {
      const { error: insertion } = await admin.from("usage_mensuel").insert({ user_id: userId, feature: FEATURE, mois, compteur: 1 });
      if (!insertion) return { ok: true };
      if (insertion.code === CHECK_VIOLATION) return { ok: false, raison: "migration" };
      if (insertion.code === UNIQUE_VIOLATION) continue;
      return { ok: false, raison: "erreur" };
    }

    const compteur = ligne.compteur ?? 0;
    const { data: maj, error: majErreur } = await admin
      .from("usage_mensuel")
      .update({ compteur: compteur + 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("feature", FEATURE)
      .eq("mois", mois)
      .eq("compteur", compteur)
      .select("compteur");
    if (majErreur) return { ok: false, raison: "erreur" };
    if ((maj ?? []).length === 1) return { ok: true };
  }
  return { ok: false, raison: "erreur" };
}

/** Rend l'image réservée si la génération a échoué (jamais décomptée sans image). */
export async function libererImageBudget(admin: SupabaseClient, userId: string): Promise<void> {
  const mois = currentMonthKey();
  for (let essai = 0; essai < ESSAIS_MAX; essai++) {
    const { data: ligne } = await admin
      .from("usage_mensuel")
      .select("compteur")
      .eq("user_id", userId)
      .eq("feature", FEATURE)
      .eq("mois", mois)
      .maybeSingle();
    const compteur = ligne?.compteur ?? 0;
    if (compteur <= 0) return;
    const { data: maj } = await admin
      .from("usage_mensuel")
      .update({ compteur: compteur - 1, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("feature", FEATURE)
      .eq("mois", mois)
      .eq("compteur", compteur)
      .select("compteur");
    if ((maj ?? []).length === 1) return;
  }
  console.error(`[quota-images] Image réservée non rendue pour ${userId} (conflits répétés).`);
}
