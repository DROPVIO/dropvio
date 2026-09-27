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
    .select("id, nom_produit, created_at, est_favori")
    .eq("user_id", user.id)
    // Favoris en premier, ordre chronologique conservé à l'intérieur de chaque groupe
    // (app/mes-sites/page.tsx).
    .order("est_favori", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Sites sur lesquels une correction IA a été appliquée et reste annulable
  // (html_content_precedent non null, voir 035_sites_generes_html_precedent.sql) : alimente
  // le bouton « Annuler la dernière correction IA » de app/mes-sites/page.tsx.
  // Requête séparée qui ne remonte que des ids, jamais le HTML sauvegardé — sélectionner la
  // colonne dans la liste ci-dessus transférerait des centaines de Ko par site pour n'en
  // garder qu'un booléen. Dégradation silencieuse si la migration 035 n'est pas appliquée
  // (code 42703) : la liste des sites reste parfaitement fonctionnelle, seul le bouton
  // d'annulation disparaît.
  const { data: annulables } = await supabase
    .from("sites_generes")
    .select("id")
    .eq("user_id", user.id)
    .not("html_content_precedent", "is", null);

  return NextResponse.json({
    sites: data ?? [],
    idsAnnulables: (annulables ?? []).map((s) => s.id),
  });
}

export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserAndPlan();

  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour sauvegarder un site." }, { status: 401 });
  }

  const {
    nom_produit,
    html_content,
    boutique_id,
    description,
    lien_aliexpress,
    image_url,
    prix_vente,
    prix_original,
    style_id,
    couleur_primary,
    couleur_secondary,
    couleur_accent,
  } = await request.json();

  if (!nom_produit || !html_content) {
    return NextResponse.json(
      { error: "nom_produit et html_content sont requis" },
      { status: 400 }
    );
  }

  // boutique_id est fourni par le client (query param repris depuis la page de gestion
  // boutique) — jamais de confiance aveugle : on vérifie qu'elle appartient bien à
  // l'utilisateur avant de l'accepter, sinon on l'ignore silencieusement plutôt que de faire
  // échouer toute la sauvegarde du site (qui reste utile même sans le lien).
  let verifiedBoutiqueId: string | null = null;
  if (boutique_id) {
    const { data: boutique } = await supabase
      .from("boutiques")
      .select("id")
      .eq("id", boutique_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (boutique) verifiedBoutiqueId = boutique.id;
  }

  const max = PLAN_LIMITS[plan].sitesParMoisMax;
  if (max !== null) {
    const debutMois = `${currentMonthKey()}T00:00:00.000Z`;
    const { count, error: countError } = await supabase
      .from("sites_generes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_trace", false)
      .gte("created_at", debutMois);

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }
    if ((count ?? 0) >= max) {
      return NextResponse.json(
        {
          error: `Tu as atteint la limite de ${max} sites générés ce mois-ci sur le plan ${planLabel(plan)}. ${
            plan === "free" ? "Passe Pro pour 20 sites par mois." : plan === "pro" ? "Passe Agency pour 50 sites par mois." : "La limite se réinitialise le mois prochain."
          }`,
        },
        { status: 403 }
      );
    }
  }

  // prix_vente/prix_original sont numeric(10,2) en base — une chaîne vide ("", état par
  // défaut du champ prix côté Site Builder) ferait échouer l'insert si envoyée telle quelle.
  const toNumberOrNull = (v: unknown): number | null => {
    if (typeof v !== "string" || v.trim() === "") return typeof v === "number" ? v : null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Champs de pré-remplissage pour une future régénération (voir 032_sites_generes_regeneration_fields.sql
  // et app/site-builder/page.tsx ?regenerate=<id>) — tous optionnels : TemplateEditor.tsx (mode
  // Éditeur de templates) et le mode boutique n'envoient aucun de ces champs, ils restent null,
  // ce qui signale justement que le pré-remplissage n'est pas disponible pour ce site.
  const { data, error } = await supabase
    .from("sites_generes")
    .insert({
      user_id: user.id,
      nom_produit,
      html_content,
      boutique_id: verifiedBoutiqueId,
      description: description ?? null,
      lien_aliexpress: lien_aliexpress ?? null,
      image_url: image_url ?? null,
      prix_vente: toNumberOrNull(prix_vente),
      prix_original: toNumberOrNull(prix_original),
      style_id: style_id ?? null,
      couleur_primary: couleur_primary ?? null,
      couleur_secondary: couleur_secondary ?? null,
      couleur_accent: couleur_accent ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
