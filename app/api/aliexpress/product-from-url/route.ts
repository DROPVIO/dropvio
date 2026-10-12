import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function extractProductId(url: string): string | null {
  const match = url.match(/\/item\/(\d+)/);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  const { url } = await request.json();

  if (!url || typeof url !== "string") {
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
    .single();

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
