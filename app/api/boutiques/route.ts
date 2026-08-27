import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";

export async function GET() {
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir tes boutiques." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("boutiques")
    .select("id, nom, slug, description, theme, est_publique, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ boutiques: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour créer une boutique." }, { status: 401 });
  }

  const { nom, slug, description, theme, settings } = await request.json();
  if (!nom || !slug) {
    return NextResponse.json({ error: "nom et slug sont requis." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("boutiques")
    .insert({ user_id: user.id, nom, slug, description, theme, settings })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
