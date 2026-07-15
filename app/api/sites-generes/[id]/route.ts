import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabase
    .from("sites_generes")
    .select("html_content")
    .eq("id", params.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Site introuvable" }, { status: 404 });
  }
  return NextResponse.json({ html_content: data.html_content });
}
