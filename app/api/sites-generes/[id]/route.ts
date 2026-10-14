import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, getServerUserPlanOnly } from "@/lib/supabase-server";
import { estFormatExport } from "@/lib/format-export";
import { pagesValides } from "@/lib/site-builder-pages";

// Le select inclut les champs de pré-remplissage (description, lien_aliexpress, image_url,
// prix_vente, prix_original, style_id, couleur_*, voir 032_sites_generes_regeneration_fields.sql)
// utilisés par le Site Builder pour reconstituer son formulaire lors d'une régénération
// (?regenerate=<id>, voir app/site-builder/page.tsx). Tous nullable : un site issu du mode
// Éditeur de templates ou du mode boutique renvoie simplement null sur ces champs, jamais
// d'erreur — c'est justement le signal utilisé pour savoir si le pré-remplissage est possible.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, plan } = await getServerUserPlanOnly();

  const { data, error } = await supabase
    .from("sites_generes")
    .select(
      "html_content, nom_produit, description, lien_aliexpress, image_url, prix_vente, prix_original, style_id, couleur_primary, couleur_secondary, couleur_accent"
    )
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Site introuvable", code: "site_not_found" }, { status: 404 });
  }

  // Restriction plan free : l'aperçu/la régénération restent disponibles (le pré-remplissage
  // ?regenerate=<id> côté site-builder n'exploite jamais html_content, seulement les autres
  // champs ci-dessus), mais le code source brut ne doit pas transiter par cette route — c'est
  // justement ce que /api/sites-generes/[id]/shopify-push et le bouton "Télécharger" de
  // app/mes-sites/page.tsx consomment. Voir aussi le blocage symétrique sur shopify-push.
  if (plan === "free") {
    const { nom_produit, description, lien_aliexpress, image_url, prix_vente, prix_original, style_id, couleur_primary, couleur_secondary, couleur_accent } = data;
    return NextResponse.json({
      nom_produit, description, lien_aliexpress, image_url, prix_vente, prix_original, style_id, couleur_primary, couleur_secondary, couleur_accent,
    });
  }

  // Pages du site multi-pages (040_sites_generes_pages.sql), lues à part : sans la migration,
  // la colonne n'existe pas (42703) et le site reste une seule page (html_content).
  const { data: avecPages } = await supabase.from("sites_generes").select("pages").eq("id", id).maybeSingle();
  return NextResponse.json({ ...data, pages: avecPages?.pages ?? null });
}

// Code d'erreur PostgreSQL « undefined_column », remonté tel quel par PostgREST quand une
// migration n'a pas encore été appliquée. Sert à transformer un message cryptique en
// consigne exploitable au lieu d'un 500 opaque.
const UNDEFINED_COLUMN = "42703";

const MIGRATION_035_MANQUANTE =
  "L'annulation de correction IA n'est pas encore activée sur cette base : applique la migration 035_sites_generes_html_precedent.sql.";

const MIGRATION_039_MANQUANTE =
  "Le choix du format d'export n'est pas encore activé sur cette base : applique la migration 039_sites_generes_format_export.sql.";

// Sauvegarde la version personnalisée (couleurs) produite par le panneau de personnalisation
// post-génération du Site Builder (voir components/site-builder/ColorTokenPanel.tsx), bascule
// le favori (app/mes-sites/page.tsx), applique un HTML corrigé par l'audit IA
// (app/audit/page.tsx, bouton « Appliquer au site ») ou annule cette application
// (app/mes-sites/page.tsx, « Annuler la dernière correction IA »). Tous les champs sont
// optionnels et indépendants. RLS (policy "update_own", 013_sites_generes_update_policy.sql)
// garantit déjà qu'un utilisateur ne peut modifier que ses propres sites —
// createSupabaseServerClient() porte le JWT de la session, jamais le service role.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier ce site.", code: "auth_required" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Record<string, unknown> = {};

  // Annulation de la dernière correction IA : on remet html_content_precedent dans
  // html_content et on vide la sauvegarde (un seul niveau d'historique — voir la migration
  // 035). Traité avant tout le reste et de façon exclusive : combiner une restauration avec
  // une écriture de html_content dans le même appel n'aurait pas de sémantique claire.
  if (body.restaurer_precedent === true) {
    const { data: avant, error: lectureErr } = await supabase
      .from("sites_generes")
      .select("html_content_precedent")
      .eq("id", id)
      .maybeSingle();

    if (lectureErr) {
      const status = lectureErr.code === UNDEFINED_COLUMN ? 501 : 500;
      return NextResponse.json(
        { error: lectureErr.code === UNDEFINED_COLUMN ? MIGRATION_035_MANQUANTE : lectureErr.message, code: lectureErr.code === UNDEFINED_COLUMN ? "migration_missing" : "server_error" },
        { status }
      );
    }
    // maybeSingle() + RLS : null couvre aussi bien « id inexistant » que « site d'un autre
    // utilisateur », les deux devant renvoyer 404 sans révéler lequel des deux c'est.
    if (!avant) {
      return NextResponse.json({ error: "Site introuvable.", code: "site_not_found" }, { status: 404 });
    }
    if (!avant.html_content_precedent) {
      return NextResponse.json(
        { error: "Aucune correction IA à annuler sur ce site.", code: "no_ai_fix_to_undo" },
        { status: 409 }
      );
    }

    const { data: restaure, error: restaureErr } = await supabase
      .from("sites_generes")
      .update({ html_content: avant.html_content_precedent, html_content_precedent: null })
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (restaureErr) {
      return NextResponse.json({ error: restaureErr.message, code: "server_error" }, { status: 500 });
    }
    if (!restaure) {
      return NextResponse.json({ error: "Site introuvable.", code: "site_not_found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, restaure: true });
  }

  if (typeof body.html_content === "string" && body.html_content) {
    updates.html_content = body.html_content;
  }
  // Toutes les pages d'un site multi-pages, envoyées avec html_content quand une modification
  // (couleurs) les touche toutes : sans elles, le téléchargement .zip mélangerait les versions.
  if (pagesValides(body.pages)) {
    updates.pages = body.pages;
  }
  if (typeof body.est_favori === "boolean") {
    updates.est_favori = body.est_favori;
  }
  // Changement de format d'export après création (app/mes-sites/page.tsx). Ne touche jamais
  // html_content : la conversion vers Liquid est faite à la demande, au téléchargement ou au
  // push Shopify. Changer de format est donc instantané et réversible.
  if (estFormatExport(body.format_export)) {
    updates.format_export = body.format_export;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Aucun champ valide à mettre à jour.", code: "invalid_request" }, { status: 400 });
  }

  // sauvegarder_precedent : recopie la version actuelle dans html_content_precedent avant
  // de l'écraser, pour rendre l'application d'un HTML corrigé annulable. La lecture se fait
  // ici et non côté client — deux appels réseau séparés laisseraient la sauvegarde à moitié
  // faite si le second échouait, et le client n'a de toute façon pas accès au html_content
  // d'un site en plan free. Reste deux requêtes SQL (PostgREST ne sait pas exprimer
  // « set a = b » dans un update), mais un seul aller-retour HTTP et un seul point d'échec
  // côté appelant.
  if (body.sauvegarder_precedent === true && typeof updates.html_content === "string") {
    const { data: actuel, error: lectureErr } = await supabase
      .from("sites_generes")
      .select("html_content")
      .eq("id", id)
      .maybeSingle();

    if (lectureErr) {
      return NextResponse.json({ error: lectureErr.message, code: "server_error" }, { status: 500 });
    }
    if (!actuel) {
      return NextResponse.json({ error: "Site introuvable.", code: "site_not_found" }, { status: 404 });
    }
    updates.html_content_precedent = actuel.html_content;
  }

  // .select("id") : sans lui, un update qui ne touche aucune ligne (id inexistant, ou site
  // appartenant à un autre utilisateur donc filtré par RLS) renvoie error === null et était
  // indistinguable d'un succès. Vaut pour tous les appelants de cette route, pas seulement
  // pour « Appliquer au site » : le toggle favori et la sauvegarde des couleurs du Site
  // Builder confirmaient eux aussi une écriture qui n'avait pas eu lieu.
  let { data, error } = await supabase
    .from("sites_generes")
    .update(updates)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  // Migration 040 absente : on enregistre le reste sans les pages plutôt que d'échouer.
  if (error?.code === UNDEFINED_COLUMN && "pages" in updates) {
    delete updates.pages;
    ({ data, error } = await supabase.from("sites_generes").update(updates).eq("id", id).select("id").maybeSingle());
  }

  if (error) {
    // 501 plutôt que 500 quand la cause est une migration non appliquée : le message dit quoi
    // faire au lieu de laisser un code PostgREST cryptique remonter jusqu'à l'utilisateur.
    if (error.code === UNDEFINED_COLUMN && "html_content_precedent" in updates) {
      return NextResponse.json({ error: MIGRATION_035_MANQUANTE, code: "migration_missing" }, { status: 501 });
    }
    if (error.code === UNDEFINED_COLUMN && "format_export" in updates) {
      return NextResponse.json({ error: MIGRATION_039_MANQUANTE, code: "migration_missing" }, { status: 501 });
    }
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Site introuvable.", code: "site_not_found" }, { status: 404 });
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
    return NextResponse.json({ error: "Connecte-toi pour supprimer ce site.", code: "auth_required" }, { status: 401 });
  }

  const { error } = await supabase.from("sites_generes").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
