import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("sites_generes")
    .select("html_content")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Site introuvable" }, { status: 404 });
  }
  return NextResponse.json({ html_content: data.html_content });
}
