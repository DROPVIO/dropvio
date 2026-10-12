import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { PLAN_LIMITS } from "@/lib/plan-limits";

const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const niche          = searchParams.get("niche"); // absent = pas de filtre niche ("Voir tout")
  const priceMin       = searchParams.get("priceMin");
  const priceMax       = searchParams.get("priceMax");
  const commandesMin   = searchParams.get("commandesMin");
  const commandesMax   = searchParams.get("commandesMax");
  const noteMin        = searchParams.get("noteMin");
  const margeMin       = searchParams.get("margeMin");

  const page  = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT);
  const from  = (page - 1) * limit;
  const to    = from + limit - 1;

  try {
    const { plan } = await getServerUserPlanOnly();
    const produitsMax = PLAN_LIMITS[plan].produitsMax; // null = illimité (Pro/Agency)

    // Plan Free : le catalogue accessible est plafonné à produitsMax, quels que soient
    // les filtres. Au-delà, on ne requête même pas — la pagination s'arrête au plafond.
    if (produitsMax !== null && from >= produitsMax) {
      return NextResponse.json({
        products: [],
        total: produitsMax,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(produitsMax / limit)),
        planLimited: true,
      });
    }

    const cappedTo = produitsMax !== null ? Math.min(to, produitsMax - 1) : to;

    // produits_dedup (supabase/migrations/027_produits_dedup_view.sql) : vue DISTINCT ON
    // (nom, niche) qui masque les relistings AliExpress au titre identique (id/lienAliExpress
    // toujours distincts, jamais un vrai doublon de clé primaire) — garde la ligne la plus
    // commandée par (nom, niche). Table produits inchangée, seule cette lecture catalogue en
    // bénéficie ; les lookups par id exact ailleurs (snapshots, produit collé par URL...)
    // restent sur produits, une ligne "perdante" exclue de la vue devant toujours être trouvable.
    let query = supabase
      .from("produits_dedup")
      .select("*", { count: "exact" })
      .order("commandes", { ascending: false })
      .range(from, cappedTo);

    if (niche)          query = query.eq("niche", niche);
    if (priceMin)      query = query.gte("prixVente", parseFloat(priceMin));
    if (priceMax)      query = query.lte("prixVente", parseFloat(priceMax));
    if (commandesMin)  query = query.gte("commandes", parseInt(commandesMin));
    if (commandesMax)  query = query.lte("commandes", parseInt(commandesMax));
    if (noteMin)        query = query.gte("note", parseFloat(noteMin));
    if (margeMin)        query = query.gte("marge", parseInt(margeMin));

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
    }

    const products = data ?? [];
    const realTotal = count ?? 0;
    const total = produitsMax !== null ? Math.min(realTotal, produitsMax) : realTotal;

    return NextResponse.json({
      products,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      planLimited: produitsMax !== null && realTotal > produitsMax,
    });
  } catch (err) {
    console.error("Supabase query error:", err);
    return NextResponse.json(
      { error: "Erreur de connexion à Supabase", code: "server_error" },
      { status: 500 }
    );
  }
}
