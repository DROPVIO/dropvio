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
// post-génération du Site Builder (voir components/site-builder/ColorTokenPanel.tsx). RLS
// (policy "update_own", 013_sites_generes_update_policy.sql) garantit déjà qu'un utilisateur
// ne peut modifier que ses propres sites — createSupabaseServerClient() porte le JWT de la
// session, jamais le service role.
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

  const { html_content } = await request.json();
  if (!html_content || typeof html_content !== "string") {
    return NextResponse.json({ error: "html_content est requis." }, { status: 400 });
  }

  const { error } = await supabase
    .from("sites_generes")
    .update({ html_content })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
