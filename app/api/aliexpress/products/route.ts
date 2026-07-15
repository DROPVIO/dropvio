import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const niche    = searchParams.get("niche")    || "fitness";
  const priceMin = searchParams.get("priceMin");
  const priceMax = searchParams.get("priceMax");

  try {
    let query = supabase
      .from("produits")
      .select("*")
      .eq("niche", niche)
      .order("commandes", { ascending: false })
      .limit(60);

    if (priceMin) query = query.gte("prixVente", parseFloat(priceMin));
    if (priceMax) query = query.lte("prixVente", parseFloat(priceMax));

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const products = data ?? [];
    return NextResponse.json({ products, total: products.length });
  } catch (err) {
    console.error("Supabase query error:", err);
    return NextResponse.json(
      { error: "Erreur de connexion à Supabase" },
      { status: 500 }
    );
  }
}
