import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("sites_generes")
    .select("html_content")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Site introuvable" }, { status: 404 });
  }
  return NextResponse.json({ html_content: data.html_content });
}

// Sauvegarde la version personnalisée (couleurs) produite par le panneau de personnalisation
// post-génération du Site Builder (voir components/site-builder/ColorTokenPanel.tsx), et/ou
// bascule le favori (app/mes-sites/page.tsx) — les deux champs sont optionnels et
// indépendants, un appel peut modifier l'un, l'autre, ou les deux. RLS (policy "update_own",
// 013_sites_generes_update_policy.sql) garantit déjà qu'un utilisateur ne peut modifier que
// ses propres sites — createSupabaseServerClient() porte le JWT de la session, jamais le
// service role.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier ce site." }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};
  if (typeof body.html_content === "string" && body.html_content) {
    updates.html_content = body.html_content;
  }
  if (typeof body.est_favori === "boolean") {
    updates.est_favori = body.est_favori;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ valide à mettre à jour." }, { status: 400 });
  }

  const { error } = await supabase
    .from("sites_generes")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

// RLS (policy "delete_own", 008_plan_limits.sql, using (auth.uid() = user_id)) garantit
// qu'un utilisateur ne peut supprimer que ses propres sites — pas de vérification
// supplémentaire nécessaire ici, la policy fait déjà tout le travail.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour supprimer ce site." }, { status: 401 });
  }

  const { error } = await supabase.from("sites_generes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
