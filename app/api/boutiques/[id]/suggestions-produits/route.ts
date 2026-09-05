import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { calculerCroissance } from "@/lib/croissance-produit";

const SUGGESTIONS_LIMIT = 6;
const CANDIDATE_POOL = 40; // sur-fetch avant exclusion des produits déjà en boutique

// Suggestions de produits catalogue "complémentaires" à ce qui est déjà dans la boutique :
// même niche, prix dans une fourchette proche de la moyenne déjà en boutique, triés par
// score de croissance puis par nombre de commandes. Requête Supabase classique (pas
// d'appel Claude — coût inutile pour une simple suggestion de catalogue).
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir les suggestions." }, { status: 401 });
  }

  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (boutiqueError) return NextResponse.json({ error: boutiqueError.message }, { status: 500 });
  if (!boutique) return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });

  const { data: existants, error: existantsError } = await supabase
    .from("boutique_produits")
    .select("source_produit_id")
    .eq("boutique_id", id);
  if (existantsError) return NextResponse.json({ error: existantsError.message }, { status: 500 });

  const sourceIds = Array.from(
    new Set((existants ?? []).map((p) => p.source_produit_id).filter((v): v is string => Boolean(v)))
  );

  // Pas de produit relié au catalogue (boutique vide, ou uniquement des ajouts manuels
  // sans lien catalogue) -> aucun signal de niche exploitable. Pas de suggestion plutôt
  // qu'une suggestion non pertinente.
  if (sourceIds.length === 0) {
    return NextResponse.json({ suggestions: [], basedOnNiches: [] });
  }

  const { data: sourceProduits, error: sourceError } = await supabase
    .from("produits")
    .select("niche, prixVente")
    .in("id", sourceIds);
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  const niches = Array.from(new Set((sourceProduits ?? []).map((p) => p.niche).filter(Boolean) as string[]));
  if (niches.length === 0) {
    return NextResponse.json({ suggestions: [], basedOnNiches: [] });
  }

  const prixConnus = (sourceProduits ?? [])
    .map((p) => p.prixVente)
    .filter((v): v is number => typeof v === "number");
  const prixMoyen = prixConnus.length ? prixConnus.reduce((a, b) => a + b, 0) / prixConnus.length : null;
  const prixMin = prixMoyen !== null ? prixMoyen * 0.5 : undefined;
  const prixMax = prixMoyen !== null ? prixMoyen * 2 : undefined;

  // produits_dedup (voir supabase/migrations/027_produits_dedup_view.sql) : les candidats
  // suggérés sont un affichage catalogue comme /api/aliexpress/products, donc soumis au même
  // bruit de relistings AliExpress au titre identique — la requête ci-dessous en bénéficie.
  // Le lookup sourceProduits plus haut (par id exact) reste volontairement sur produits.
  let candidatsQuery = supabase
    .from("produits_dedup")
    .select("id, nom, image, prixFournisseur, prixVente, niche, commandes, note")
    .in("niche", niches)
    .order("commandes", { ascending: false })
    .limit(CANDIDATE_POOL);

  if (prixMin !== undefined) candidatsQuery = candidatsQuery.gte("prixVente", prixMin);
  if (prixMax !== undefined) candidatsQuery = candidatsQuery.lte("prixVente", prixMax);

  const { data: candidatsRaw, error: candidatsError } = await candidatsQuery;
  if (candidatsError) return NextResponse.json({ error: candidatsError.message }, { status: 500 });

  const sourceIdSet = new Set(sourceIds);
  const candidats = (candidatsRaw ?? []).filter((c) => !sourceIdSet.has(c.id));

  const candidateIds = candidats.map((c) => c.id);
  const { data: snapshots } = candidateIds.length
    ? await supabase
        .from("snapshots_produits")
        .select("product_id, volume_commandes, date")
        .in("product_id", candidateIds)
        .order("date", { ascending: true })
    : { data: [] as { product_id: string; volume_commandes: number; date: string }[] };

  const snapshotsByProduct = new Map<string, { volume_commandes: number; date: string }[]>();
  for (const row of snapshots ?? []) {
    const list = snapshotsByProduct.get(row.product_id) ?? [];
    list.push({ volume_commandes: row.volume_commandes, date: row.date });
    snapshotsByProduct.set(row.product_id, list);
  }

  const enrichis = candidats.map((c) => ({
    ...c,
    croissance: calculerCroissance(snapshotsByProduct.get(c.id) ?? []),
  }));

  // Score de croissance en priorité quand disponible, sinon nombre de commandes.
  enrichis.sort((a, b) => {
    if (a.croissance !== null && b.croissance !== null) return b.croissance - a.croissance;
    if (a.croissance !== null) return -1;
    if (b.croissance !== null) return 1;
    return (b.commandes ?? 0) - (a.commandes ?? 0);
  });

  return NextResponse.json({
    suggestions: enrichis.slice(0, SUGGESTIONS_LIMIT),
    basedOnNiches: niches,
  });
}
