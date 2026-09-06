import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";

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
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  return NextResponse.json({ boutique: data });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier cette boutique." }, { status: 401 });
  }

  const payload = await request.json();
  const updates = {
    nom: payload.nom,
    slug: payload.slug,
    description: payload.description,
    theme: payload.theme,
    settings: payload.settings,
    mentions_legales: payload.mentions_legales,
    est_publique: payload.est_publique,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("boutiques")
    .update(updates)
    .eq("id", params.id)
    .select("id, nom, slug")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Trace dans "Mes sites" pour le flux "Préparer ma boutique" (app/site-builder/boutique/
  // [id]/page.tsx, handleConfirmerContenu) — jamais via POST /api/sites-generes, qui
  // décompte sitesParMoisMax (le quota du Site Builder mono-page, sans rapport avec cette
  // action). Ligne volontairement sans contenu réel : juste un repère d'activité qui
  // pointe vers la boutique, jamais un export figé qui pourrait devenir obsolète. Signalé
  // explicitement par le client (logGenerationTrace) plutôt que déduit de la présence du
  // champ description, pour ne pas dépendre d'une coïncidence de payload si un futur appel
  // PATCH venait aussi à inclure ce champ pour une autre raison. Best-effort : une échec
  // ici ne doit jamais faire échouer la sauvegarde réelle de la boutique.
  if (payload.logGenerationTrace === true) {
    const { error: traceError } = await supabase.from("sites_generes").insert({
      user_id: user.id,
      boutique_id: data.id,
      nom_produit: data.nom,
      html_content: `<!-- Préparation de contenu boutique (description + palette) du ${new Date().toLocaleDateString("fr-FR")} — voir /boutiques/${data.slug} pour la boutique réelle. -->`,
      is_trace: true,
    });
    if (traceError) {
      console.error("[boutiques PATCH] trace sites_generes:", traceError);
    }
  }

  return NextResponse.json({ id: data.id });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour supprimer cette boutique." }, { status: 401 });
  }

  const { error } = await supabase
    .from("boutiques")
    .delete()
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
