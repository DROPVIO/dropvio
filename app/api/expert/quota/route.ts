import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { EXPERT_MARGE_RENOUVELLEMENT_MS } from "@/lib/expert-billing";
import { getCreditsExpert, getPeriodeExpert, isAbonnementManuel } from "@/lib/expert-quota";

// Données de la page Quota. Les crédits sont regroupés par type et par modèle : seul le reste
// disponible intéresse l'utilisateur, pas le détail de chaque achat.
export async function GET() {
  const { supabase, user, plan } = await getServerUserPlanOnly();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir ton quota." }, { status: 401 });
  }
  if (plan !== "expert") {
    return NextResponse.json({ error: "Cette page est réservée aux abonnés Expert." }, { status: 403 });
  }

  const [periode, credits] = await Promise.all([getPeriodeExpert(supabase, user.id), getCreditsExpert(supabase, user.id)]);
  if (!periode) {
    return NextResponse.json({ error: "Aucune période Expert en cours." }, { status: 404 });
  }

  const restants = new Map<string, { type: string; modele: string; restants: number }>();
  // Les crédits vidéo éventuels restent en base mais ne sont plus affichés.
  for (const credit of credits.filter((c) => c.type !== "video")) {
    const cle = `${credit.type}:${credit.modele}`;
    const ligne = restants.get(cle) ?? { type: credit.type, modele: credit.modele, restants: 0 };
    ligne.restants += credit.quantite - credit.quantite_utilisee;
    restants.set(cle, ligne);
  }

  const offert = isAbonnementManuel(periode.stripe_subscription_id);
  const fin = new Date(periode.periode_fin).getTime() - (offert ? 0 : EXPERT_MARGE_RENOUVELLEMENT_MS);

  return NextResponse.json({
    abonnementOffert: offert,
    // Le portail Stripe n'est ouvert aux abonnés Expert qu'avec une configuration dédiée
    // (voir app/api/abonnement/portail/route.ts) : sans elle, le bouton « Gérer » est masqué.
    portailDisponible: Boolean(process.env.STRIPE_PORTAL_CONFIGURATION_EXPERT?.trim()),
    periode: {
      modele: periode.modele,
      sites: periode.sites,
      images: periode.images,
      sitesUtilises: periode.sites_utilises,
      imagesUtilisees: periode.images_utilisees,
      fin: new Date(fin).toISOString(),
    },
    credits: [...restants.values()].filter((ligne) => ligne.restants > 0),
  });
}
