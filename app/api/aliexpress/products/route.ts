import { NextRequest, NextResponse } from "next/server";
import { apiError, reponseAbonnementRequis, erreurServeur } from "@/lib/api-errors";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { PLAN_LIMITS, limitesDuPlan } from "@/lib/plan-limits";
import { commandesMinEffectif } from "@/lib/catalogue-commandes";

const DEFAULT_LIMIT = 20;

/** Date du jour à Europe/Paris (YYYY-MM-DD) : clé de la rotation quotidienne du catalogue.
 *  Calculée ici, jamais fournie par le client ; l'ordre change à minuit heure de Paris. */
function dateParis(): string {
  // en-CA formate en YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** ?seed= sert uniquement aux tests : ignoré en production, sinon un compte sans abonnement pourrait
 *  changer de seed pour faire défiler tout le catalogue malgré le plafond produitsMax. */
function seedRotation(seedParam: string | null): string {
  if (seedParam && process.env.NODE_ENV !== "production") return seedParam.slice(0, 64);
  return dateParis();
}

function nombreOuNull(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

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
    // Session de l'utilisateur, jamais le client anonyme : le RLS du catalogue (migration 057)
    // réserve le catalogue aux comptes abonnés, et aucun visiteur sans compte n'y a accès.
    const { supabase, user, plan } = await getServerUserPlanOnly();
    if (!user) {
      return apiError("auth_required", 401, "Connecte-toi pour voir le catalogue.");
    }
    if (plan === null) return reponseAbonnementRequis();
    const produitsMax = limitesDuPlan(plan).produitsMax; // null = illimité (Pro/Agency)

    // Sans abonnement : le catalogue accessible est plafonné à produitsMax, quels que soient
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
    // Lue ici via deux RPC (migration 047) : PostgREST ne sait
    // pas trier par md5(id || '|' || seed), ordre de rotation quotidienne du catalogue.
    // Mêmes filtres qu'avant, appliqués avant le tri : l'ensemble est inchangé, seul l'ordre
    // tourne. Le plafond du plan ci-dessus s'applique après le tri, donc sur l'ordre du jour.
    const filtres = {
      p_niche:         niche || null,
      p_prix_min:      priceMin     ? nombreOuNull(parseFloat(priceMin)) : null,
      p_prix_max:      priceMax     ? nombreOuNull(parseFloat(priceMax)) : null,
      // Jamais sous 100 commandes, même sans filtre (lib/catalogue-commandes.ts).
      p_commandes_min: commandesMinEffectif(commandesMin),
      p_commandes_max: commandesMax ? nombreOuNull(parseInt(commandesMax)) : null,
      p_note_min:      noteMin      ? nombreOuNull(parseFloat(noteMin)) : null,
      p_marge_min:     margeMin     ? nombreOuNull(parseInt(margeMin)) : null,
    };

    const [pageRes, totalRes] = await Promise.all([
      supabase.rpc("produits_rotation", {
        ...filtres,
        p_seed: seedRotation(searchParams.get("seed")),
        p_offset: from,
        p_limit: cappedTo - from + 1,
      }),
      supabase.rpc("produits_rotation_total", filtres),
    ]);

    const error = pageRes.error ?? totalRes.error;
    if (error) {
      return erreurServeur("api/aliexpress/products", error);
    }

    const products = pageRes.data ?? [];
    const realTotal = Number(totalRes.data ?? 0);
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
    return erreurServeur("api/aliexpress/products", err);
  }
}
