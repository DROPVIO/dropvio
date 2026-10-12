import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { apiError, UNIQUE_VIOLATION } from "@/lib/api-errors";
import { isValidSlug } from "@/lib/slugify";
import { RESERVED_SUBDOMAINS } from "@/lib/boutique-subdomains";

export async function GET() {
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir tes boutiques." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("boutiques")
    .select("id, nom, slug, description, theme, settings, est_publique, created_at, updated_at")
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
  if (typeof nom !== "string" || !nom.trim()) {
    return apiError("boutique_name_required", 400, "Le nom de la boutique est requis.");
  }
  if (typeof slug !== "string" || !isValidSlug(slug)) {
    return apiError("slug_invalid", 400, "Slug invalide : lettres minuscules, chiffres et tirets, 2 à 60 caractères.");
  }
  if (RESERVED_SUBDOMAINS.has(slug)) {
    return apiError("slug_reserved", 400, "Ce slug est réservé.");
  }

  const { data, error } = await supabase
    .from("boutiques")
    .insert({ user_id: user.id, nom: nom.trim(), slug, description, theme, settings })
    .select("id")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return apiError("slug_taken", 409, "Ce slug est déjà utilisé par une autre boutique.");
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id }, { status: 201 });
}
