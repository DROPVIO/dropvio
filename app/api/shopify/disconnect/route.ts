import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// Supprime la connexion stockée côté dropvio. Ne révoque pas le token côté Shopify —
// Shopify le fait automatiquement si le marchand désinstalle l'app depuis son admin ;
// depuis notre côté, on ne fait qu'oublier le token pour ne plus l'utiliser.
export async function POST() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi.", code: "auth_required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("shopify_connections").delete().eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
