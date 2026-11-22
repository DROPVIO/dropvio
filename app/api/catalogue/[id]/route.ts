import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { lirePhotos } from "@/lib/catalogue-photos";
import { apiError, reponseAbonnementRequis, erreurServeur } from "@/lib/api-errors";

// Fiche d'un produit du catalogue (/produits-gagnants/catalogue/[id]) : le produit (seul endroit
// du Catalogue où lienAliExpress est renvoyé), les photos choisies par l'utilisateur et ses
// copies dans ses boutiques (prix barré, catégorie, stock et photos de boutique n'existent qu'à
// ce niveau). Le lien AliExpress n'est jamais copié dans boutique_produits.
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour voir ce produit.");
  }
  if (plan === null) return reponseAbonnementRequis();

  const { data: produit, error } = await supabase
    .from("produits")
    .select("id, nom, image, prixVente, niche, lienAliExpress")
    .eq("id", id)
    .maybeSingle();
  if (error) return erreurServeur("api/catalogue/[id]", error);
  if (!produit) return apiError("not_found", 404, "Produit introuvable.");

  const [{ data: boutiques, error: boutiquesError }, photos] = await Promise.all([
    supabase.from("boutiques").select("id, nom").eq("user_id", user.id).order("created_at", { ascending: false }),
    lirePhotos(supabase, user.id, id).catch((e: Error) => e),
  ]);
  if (boutiquesError) return erreurServeur("api/catalogue/[id]", boutiquesError);
  if (photos instanceof Error) return erreurServeur("api/catalogue/[id]", photos);

  const boutiqueIds = (boutiques ?? []).map((b) => b.id);
  let copies: {
    id: string;
    boutique_id: string;
    category_id: string | null;
    prix_vente: number;
    prix_original: number | null;
    stock: number;
    image_urls: unknown;
    boutique_categories: { nom: string } | null;
  }[] = [];
  if (boutiqueIds.length > 0) {
    // Filtre explicite sur SES boutiques (policy select_public sur boutique_produits).
    const { data, error: copiesError } = await supabase
      .from("boutique_produits")
      .select("id, boutique_id, category_id, prix_vente, prix_original, stock, image_urls, boutique_categories(nom)")
      .eq("source_produit_id", id)
      .in("boutique_id", boutiqueIds)
      .order("created_at", { ascending: true });
    if (copiesError) return erreurServeur("api/catalogue/[id]", copiesError);
    copies = (data ?? []) as unknown as typeof copies;
  }

  return NextResponse.json({
    produit: {
      id: produit.id,
      nom: produit.nom,
      // Photo affichée : la principale choisie par l'utilisateur, sinon celle du catalogue.
      image: photos.photos[0] ?? produit.image ?? null,
      imageCatalogue: produit.image ?? null,
      prixVente: produit.prixVente ?? null,
      niche: produit.niche ?? null,
      lienAliExpress: produit.lienAliExpress ?? null,
    },
    photos: photos.photos,
    photosDisponibles: photos.disponible,
    boutiques: boutiques ?? [],
    copies: copies.map((c) => ({
      id: c.id,
      boutiqueId: c.boutique_id,
      categoryId: c.category_id,
      categoryNom: c.boutique_categories?.nom ?? null,
      prixVente: c.prix_vente,
      prixOriginal: c.prix_original,
      stock: c.stock,
      imageUrls: Array.isArray(c.image_urls) ? (c.image_urls as unknown[]).filter((u): u is string => typeof u === "string") : [],
    })),
  });
}
