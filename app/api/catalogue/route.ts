import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { limitesDuPlan } from "@/lib/plan-limits";
import { lirePhotosPrincipales } from "@/lib/catalogue-photos";
import { COMMANDES_MIN_DEFAUT } from "@/lib/catalogue-commandes";
import { apiError, reponseAbonnementRequis, erreurServeur } from "@/lib/api-errors";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// Échappe les jokers LIKE (% _ \) d'une saisie utilisateur avant de l'envelopper dans %…%.
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Liste du catalogue (/produits-gagnants/catalogue). Même source que /api/aliexpress/products
// (vue produits_dedup, même plafond produitsMax par plan). Le lien AliExpress n'est volontairement
// PAS sélectionné : il n'apparaît que sur la fiche (/api/catalogue/[id]). L'image affichée est la
// photo principale choisie par l'utilisateur (catalogue_photos) quand elle existe.
export async function GET(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour voir le catalogue.");
  }
  if (plan === null) return reponseAbonnementRequis();

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim() ?? "";
  const niche = searchParams.get("niche")?.trim() ?? "";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const produitsMax = limitesDuPlan(plan).produitsMax; // null = illimité
  if (produitsMax !== null && from >= produitsMax) {
    return NextResponse.json({ products: [], total: produitsMax, page, limit, totalPages: Math.max(1, Math.ceil(produitsMax / limit)), planLimited: true });
  }
  const cappedTo = produitsMax !== null ? Math.min(to, produitsMax - 1) : to;

  let query = supabase
    .from("produits_dedup")
    .select("id, nom, image, prixVente, niche", { count: "exact" })
    .order("commandes", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, cappedTo);
  // Même plancher de commandes que Produits gagnants (lib/catalogue-commandes.ts), sur toutes les
  // pages et pour tous les filtres.
  query = query.gte("commandes", COMMANDES_MIN_DEFAUT);
  if (search) query = query.ilike("nom", `%${escapeLike(search)}%`);
  if (niche) query = query.eq("niche", niche);

  const { data, error, count } = await query;
  if (error) {
    return erreurServeur("api/catalogue", error);
  }

  const rows = data ?? [];
  const realTotal = count ?? 0;
  const total = produitsMax !== null ? Math.min(realTotal, produitsMax) : realTotal;
  const ids = rows.map((r) => r.id as string);

  // Boutiques de l'utilisateur qui contiennent ces produits. Filtre explicite sur SES boutiques :
  // boutique_produits a aussi une policy select_public (boutiques publiques des autres).
  const boutiquesByProduit = new Map<string, { id: string; nom: string }[]>();
  const [{ data: mesBoutiques, error: boutiquesError }, principales] = await Promise.all([
    supabase.from("boutiques").select("id, nom").eq("user_id", user.id),
    lirePhotosPrincipales(supabase, user.id, ids),
  ]);
  if (boutiquesError) {
    return erreurServeur("api/catalogue", boutiquesError);
  }
  const boutiqueNom = new Map((mesBoutiques ?? []).map((b) => [b.id as string, b.nom as string]));
  if (rows.length > 0 && boutiqueNom.size > 0) {
    const { data: copies, error: copiesError } = await supabase
      .from("boutique_produits")
      .select("boutique_id, source_produit_id")
      .in("boutique_id", [...boutiqueNom.keys()])
      .in("source_produit_id", ids);
    if (copiesError) {
      return erreurServeur("api/catalogue", copiesError);
    }
    for (const c of copies ?? []) {
      if (!c.source_produit_id) continue;
      const list = boutiquesByProduit.get(c.source_produit_id) ?? [];
      if (!list.some((b) => b.id === c.boutique_id)) list.push({ id: c.boutique_id, nom: boutiqueNom.get(c.boutique_id) ?? "" });
      boutiquesByProduit.set(c.source_produit_id, list);
    }
  }

  return NextResponse.json({
    products: rows.map((r) => ({
      id: r.id,
      nom: r.nom,
      image: principales.get(r.id as string) ?? r.image ?? null,
      prixVente: r.prixVente ?? null,
      niche: r.niche ?? null,
      boutiques: boutiquesByProduit.get(r.id as string) ?? [],
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    planLimited: produitsMax !== null && realTotal > produitsMax,
  });
}
