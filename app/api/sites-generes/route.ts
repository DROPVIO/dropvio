import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("sites_generes")
    .select("id, nom_produit, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sites: data ?? [] });
}

export async function POST(request: NextRequest) {
  const { nom_produit, html_content } = await request.json();

  if (!nom_produit || !html_content) {
    return NextResponse.json(
      { error: "nom_produit et html_content sont requis" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("sites_generes")
    .insert({ nom_produit, html_content })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: data.id }, { status: 201 });
}
