import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { apiError, reponseAbonnementRequis } from "@/lib/api-errors";

function extractProductId(url: string): string | null {
  const match = url.match(/\/item\/(\d+)/);
  return match ? match[1] : null;
}

// Pré-remplissage du Site Builder depuis le catalogue des produits gagnants : réservé aux
// comptes connectés. Lecture avec la session de l'utilisateur, donc soumise au RLS de produits
// (migrations 057 et 062) : seuls les comptes abonnés lisent le catalogue.
export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour utiliser le catalogue.");
  }
  if (plan === null) return reponseAbonnementRequis();

  const body = await request.json().catch(() => null);
  const url = body?.url;
  if (!url || typeof url !== "string" || url.length > 2048) {
    return NextResponse.json({ error: "URL manquante", code: "url_missing" }, { status: 400 });
  }

  const productId = extractProductId(url);
  if (!productId) {
    return NextResponse.json(
      { error: "URL AliExpress invalide. Format attendu : aliexpress.com/item/XXXXXXXXXX.html", code: "aliexpress_url_invalid" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("produits")
    .select("id, nom, image, note, commandes, niche")
    .ilike("lienAliExpress", `%${productId}%`)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "Produit introuvable dans notre catalogue. Remplis les champs manuellement.", code: "aliexpress_not_in_catalog" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    id: data.id,
    nom: data.nom,
    description: data.nom,
    image: data.image ?? null,
    rating: data.note ?? null,
    orders: data.commandes ?? null,
    niche: data.niche ?? null,
  });
}
