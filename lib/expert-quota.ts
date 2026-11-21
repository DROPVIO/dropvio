import type { SupabaseClient } from "@supabase/supabase-js";

// Les comptes offerts sont créés à la main en base, sans abonnement Stripe : leur
// stripe_subscription_id commence par ce préfixe et ne doit jamais être envoyé à Stripe.
const PREFIXE_ABONNEMENT_MANUEL = "manuel-";

export function isAbonnementManuel(subscriptionId: string | null | undefined): boolean {
  return subscriptionId?.startsWith(PREFIXE_ABONNEMENT_MANUEL) ?? false;
}

export type ExpertPeriode = {
  id: string;
  modele: string;
  sites: number;
  images: number;
  sites_utilises: number;
  images_utilisees: number;
  stripe_subscription_id: string;
  periode_fin: string;
};

// Type tel qu'en base : la contrainte de expert_credits accepte encore 'video' (migration 036),
// même si aucun crédit vidéo n'est plus vendu.
export type ExpertCredit = {
  type: "site" | "image" | "video";
  modele: string;
  quantite: number;
  quantite_utilisee: number;
};

export async function getPeriodeExpert(supabase: SupabaseClient, userId: string): Promise<ExpertPeriode | null> {
  const maintenant = new Date().toISOString();
  const { data } = await supabase
    .from("expert_periodes")
    .select("id, modele, sites, images, sites_utilises, images_utilisees, stripe_subscription_id, periode_fin")
    .eq("user_id", userId)
    .lte("periode_debut", maintenant)
    .gt("periode_fin", maintenant)
    .order("periode_debut", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as ExpertPeriode | null;
}

export async function getCreditsExpert(supabase: SupabaseClient, userId: string): Promise<ExpertCredit[]> {
  const { data } = await supabase
    .from("expert_credits")
    .select("type, modele, quantite, quantite_utilisee")
    .eq("user_id", userId);
  return (data ?? []) as ExpertCredit[];
}

// Une période manuelle prime sur Stripe : aucun événement d'abonnement ne doit la modifier.
export async function aPeriodeManuelleActive(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const periode = await getPeriodeExpert(supabase, userId);
  return isAbonnementManuel(periode?.stripe_subscription_id);
}

// Sites disponibles sur le mois : quota de la configuration + crédits rachetés non utilisés.
export async function limiteSitesExpert(supabase: SupabaseClient, userId: string): Promise<number> {
  const [periode, credits] = await Promise.all([getPeriodeExpert(supabase, userId), getCreditsExpert(supabase, userId)]);
  const creditsRestants = credits
    .filter((credit) => credit.type === "site")
    .reduce((total, credit) => total + credit.quantite - credit.quantite_utilisee, 0);
  return (periode?.sites ?? 0) + creditsRestants;
}
