import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";

// État d'abonnement du compte connecté, pour /abonnement : choix d'un plan, essai déjà
// utilisé ou non, et attente de l'activation au retour de Stripe Checkout (le webhook peut
// arriver quelques secondes après l'utilisateur).
export async function GET() {
  const { supabase, user, plan } = await getServerUserPlanOnly();

  if (!user) {
    return NextResponse.json({ error: "Connectez-vous pour voir votre abonnement.", code: "auth_required" }, { status: 401 });
  }

  const { data: profil } = await supabase
    .from("profils")
    .select("plan, abonnement_statut, essai_utilise, essai_fin, periode_fin, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    plan,
    statut: profil?.abonnement_statut ?? null,
    essaiUtilise: profil?.essai_utilise ?? false,
    essaiFin: profil?.essai_fin ?? null,
    periodeFin: profil?.periode_fin ?? null,
    portailDisponible: Boolean(profil?.stripe_customer_id),
    // Expert en base mais aucune période en cours : la page propose de reprendre Expert.
    expertExpire: profil?.plan === "expert" && plan === null,
  });
}
