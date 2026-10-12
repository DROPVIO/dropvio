import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// Compte léger pour le badge du dashboard — évite de faire porter le fetch de la liste
// complète (avec PII) juste pour afficher un nombre.
export async function GET() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi.", code: "auth_required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { count, error } = await admin
    .from("commandes_a_preparer")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("statut", "a_traiter");

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ count: count ?? 0 });
}
