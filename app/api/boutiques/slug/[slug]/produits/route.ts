import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULT_LIMIT = 20;

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT);
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const categoryId = searchParams.get("categoryId");
  const search = searchParams.get("search")?.trim() ?? "";

  const supabase = createSupabaseAdminClient();
  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id")
    .eq("slug", slug)
    .eq("est_publique", true)
    .maybeSingle();

  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message }, { status: 500 });
  }

  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable." }, { status: 404 });
  }

  let query = supabase
    .from("boutique_produits")
    .select("*, boutique_categories(nom, slug)", { count: "exact" })
    .eq("boutique_id", boutique.id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: false });

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (search) {
    query = query.or(`nom.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? (data?.length ?? 0);
  return NextResponse.json({ products: data ?? [], total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}
