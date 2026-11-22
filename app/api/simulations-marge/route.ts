import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { apiError, erreurServeur } from "@/lib/api-errors";
import { PLAN_LIMITS, planLabel, limitesDuPlan } from "@/lib/plan-limits";

// La sauvegarde passe par cette route (plutôt qu'un insert direct depuis le navigateur)
// pour que la limite du plan soit appliquée côté serveur, jamais contournable.
export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserAndPlan();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour sauvegarder une simulation.", code: "auth_required" }, { status: 401 });
  }

  const { nom, inputs, resultats } = await request.json();
  if (!nom || !inputs || !resultats) {
    return NextResponse.json({ error: "nom, inputs et resultats sont requis", code: "invalid_request" }, { status: 400 });
  }

  if (plan === null) {
    return apiError("abonnement_requis_outil", 403, "Choisissez un abonnement pour utiliser cet outil.");
  }
  const max = limitesDuPlan(plan).simulationsMax;
  if (max !== null) {
    const { count, error: countError } = await supabase
      .from("simulations_marge")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) {
      return erreurServeur("api/simulations-marge", countError);
    }
    if ((count ?? 0) >= max) {
      return NextResponse.json(
        {
          error: `Tu as atteint la limite de ${max} simulations sur le plan ${planLabel(plan)}. Passe Pro pour un accès illimité.`, code: "simulations_limit", values: { max, plan: planLabel(plan) },
        },
        { status: 403 }
      );
    }
  }

  const { data, error } = await supabase
    .from("simulations_marge")
    .insert({ user_id: user.id, nom, inputs, resultats })
    .select("id, nom, inputs, resultats, created_at")
    .single();

  if (error) {
    return erreurServeur("api/simulations-marge", error);
  }
  return NextResponse.json(data, { status: 201 });
}
