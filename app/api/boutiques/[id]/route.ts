import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { apiError, UNIQUE_VIOLATION } from "@/lib/api-errors";
import { isValidSlug } from "@/lib/slugify";
import { RESERVED_SUBDOMAINS } from "@/lib/boutique-subdomains";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir cette boutique." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("boutiques")
    .select("id, nom, slug, description, theme, settings, mentions_legales, est_publique, created_at, updated_at")
    .eq("id", params.id)
    // La policy select_public (014) rend lisibles les boutiques publiques des autres : ce
    // endpoint de gestion ne doit renvoyer que les siennes.
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  // Compteurs non filtrés pour les réglages : publication (au moins un produit), limite du
  // plan, et confirmation de suppression (sites générés conservés).
  const [{ count: produitsCount }, { count: sitesCount }] = await Promise.all([
    supabase.from("boutique_produits").select("id", { count: "exact", head: true }).eq("boutique_id", params.id),
    supabase.from("sites_generes").select("id", { count: "exact", head: true }).eq("boutique_id", params.id),
  ]);

  return NextResponse.json({ boutique: data, produitsCount: produitsCount ?? 0, sitesCount: sitesCount ?? 0 });
}

const CHAMPS_MODIFIABLES = ["nom", "slug", "description", "theme", "settings", "mentions_legales", "est_publique"] as const;

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier cette boutique." }, { status: 401 });
  }

  const payload = await request.json();
  const updates: Record<string, unknown> = {};
  for (const champ of CHAMPS_MODIFIABLES) {
    if (payload[champ] !== undefined) updates[champ] = payload[champ];
  }

  if (updates.nom !== undefined) {
    if (typeof updates.nom !== "string" || !updates.nom.trim()) {
      return apiError("boutique_name_required", 400, "Le nom de la boutique est requis.");
    }
    updates.nom = updates.nom.trim();
  }
  if (updates.slug !== undefined) {
    if (typeof updates.slug !== "string" || !isValidSlug(updates.slug)) {
      return apiError("slug_invalid", 400, "Slug invalide : lettres minuscules, chiffres et tirets, 2 à 60 caractères.");
    }
    if (RESERVED_SUBDOMAINS.has(updates.slug)) {
      return apiError("slug_reserved", 400, "Ce slug est réservé.");
    }
  }
  if (updates.est_publique !== undefined && typeof updates.est_publique !== "boolean") {
    return apiError("invalid_request", 400, "est_publique doit être un booléen.");
  }

  const { data: actuelle, error: lectureErr } = await supabase
    .from("boutiques")
    .select("id, slug")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (lectureErr) {
    return NextResponse.json({ error: lectureErr.message }, { status: 500 });
  }
  if (!actuelle) {
    return apiError("boutique_not_found", 404, "Boutique introuvable.");
  }

  // Publication : jamais une boutique vide ni un slug que l'URL publique ne peut pas porter
  // (anciennes boutiques créées avant la validation du slug).
  if (updates.est_publique === true) {
    const slugFinal = (updates.slug as string | undefined) ?? actuelle.slug;
    if (!isValidSlug(slugFinal) || RESERVED_SUBDOMAINS.has(slugFinal)) {
      return apiError("publish_slug_invalid", 400, "Corrige le slug de la boutique avant de la rendre publique.");
    }
    const { count, error: countErr } = await supabase
      .from("boutique_produits")
      .select("id", { count: "exact", head: true })
      .eq("boutique_id", params.id);
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 });
    }
    if (!count) {
      return apiError("publish_requires_product", 400, "Ajoute au moins un produit avant de rendre la boutique publique.");
    }
  }

  updates.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("boutiques")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id, nom, slug, est_publique")
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return apiError("slug_taken", 409, "Ce slug est déjà utilisé par une autre boutique.");
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id, boutique: data });
}

// Suppression : boutique_produits et boutique_categories partent en cascade (012) ; les sites
// générés depuis la boutique sont conservés, seul leur lien sites_generes.boutique_id passe à
// null (023, on delete set null).
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour supprimer cette boutique." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("boutiques")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data || data.length === 0) {
    return apiError("boutique_not_found", 404, "Boutique introuvable.");
  }

  return NextResponse.json({ success: true });
}
