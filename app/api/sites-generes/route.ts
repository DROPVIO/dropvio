import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, currentMonthKey } from "@/lib/plan-limits";

export async function GET() {
  const { supabase, user } = await getServerUserAndPlan();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir tes sites." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("sites_generes")
    .select("id, nom_produit, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sites: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserAndPlan();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour sauvegarder un site." }, { status: 401 });
  }

  const { nom_produit, html_content } = await request.json();

  if (!nom_produit || !html_content) {
    return NextResponse.json(
      { error: "nom_produit et html_content sont requis" },
      { status: 400 }
    );
  }

  const max = PLAN_LIMITS[plan].sitesParMoisMax;
  if (max !== null) {
    const debutMois = `${currentMonthKey()}T00:00:00.000Z`;
    const { count, error: countError } = await supabase
      .from("sites_generes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", debutMois);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    if ((count ?? 0) >= max) {
      return NextResponse.json(
        {
          error: `Tu as atteint la limite de ${max} sites générés ce mois-ci sur le plan ${planLabel(plan)}. Passe Pro pour un accès illimité.`,
        },
        { status: 403 }
      );
    }
  }

  const { data, error } = await supabase
    .from("sites_generes")
    .insert({ user_id: user.id, nom_produit, html_content })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
