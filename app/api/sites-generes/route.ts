import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, currentMonthKey } from "@/lib/plan-limits";
import { estFormatExport } from "@/lib/format-export";

// Code PostgreSQL « undefined_column », remonté tel quel par PostgREST tant qu'une migration
// n'est pas appliquée — ici 039 (sites_generes.format_export).
const UNDEFINED_COLUMN = "42703";


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

  // Format d'export par site (voir 039_sites_generes_format_export.sql) — requête séparée
  // pour la même raison que ci-dessus : l'ajouter au select principal ferait échouer TOUTE
  // la liste (42703) tant que 039 n'est pas appliquée. Erreur volontairement ignorée : sans
  // la colonne, chaque site retombe simplement sur « html » côté client.
  const { data: formats } = await supabase
    .from("sites_generes")
    .select("id, format_export")
    .eq("user_id", user.id);

  return NextResponse.json({
    sites: data ?? [],
    idsAnnulables: (annulables ?? []).map((s) => s.id),
    formats: Object.fromEntries(
      (formats ?? []).map((f) => [f.id, estFormatExport(f.format_export) ? f.format_export : "html"])
    ),
  });
}

// Objet clé → HTML : clés en [a-z0-9-], valeurs chaînes non vides, au moins une page.
function pagesValides(pages: unknown): pages is Record<string, string> {
  if (!pages || typeof pages !== "object" || Array.isArray(pages)) return false;
  const entrees = Object.entries(pages);
  return (
    entrees.length > 0 &&
    entrees.every(([cle, html]) => /^[a-z0-9-]+$/.test(cle) && typeof html === "string" && html.trim() !== "")
  );
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
    format_export,
    pages,
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
  // format_export : validé ici plutôt que repris tel quel, et absent du payload si le client
  // n'a rien envoyé — la colonne a son propre défaut ('html', voir la migration 039).
  const payload: Record<string, unknown> = {
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
    ...(estFormatExport(format_export) && { format_export }),
    // pages : site multi-pages (voir 040_sites_generes_pages.sql) — ignoré s'il n'a pas la
    // forme attendue, html_content restant de toute façon la page d'accueil.
    ...(pagesValides(pages) && { pages }),
  };

  let { data, error } = await supabase.from("sites_generes").insert(payload).select("id").single();

  // Tant qu'une migration de colonne optionnelle n'est pas appliquée (039 format_export,
  // 040 pages), l'insert entier échoue (42703). On réessaie sans la colonne manquante —
  // celle que nomme l'erreur, sinon la plus récente : perdre le format ou les pages
  // secondaires est acceptable, perdre le site généré ne l'est pas. Un 42703 qui persiste
  // vient alors d'une autre migration manquante (032) et remonte tel quel.
  const COLONNES_OPTIONNELLES: [string, string][] = [
    ["pages", "040_sites_generes_pages.sql"],
    ["format_export", "039_sites_generes_format_export.sql"],
  ];
  for (let essai = 0; essai < COLONNES_OPTIONNELLES.length && error?.code === UNDEFINED_COLUMN; essai++) {
    const presentes = COLONNES_OPTIONNELLES.filter(([colonne]) => colonne in payload);
    const manquante = presentes.find(([colonne]) => error?.message?.includes(colonne)) ?? presentes[0];
    if (!manquante) break;
    console.warn(`[sites-generes] ${manquante[0]} ignoré : applique la migration ${manquante[1]}.`);
    delete payload[manquante[0]];
    ({ data, error } = await supabase.from("sites_generes").insert(payload).select("id").single());
  }

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Sauvegarde impossible." }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
