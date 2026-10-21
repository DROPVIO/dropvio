import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// Oublie les tokens AliExpress stockés côté dropvio. Ne révoque pas l'autorisation côté
// AliExpress (l'utilisateur peut la retirer depuis son compte AliExpress) : depuis notre
// côté, on ne fait que ne plus jamais utiliser ces tokens.
export async function POST() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi.", code: "auth_required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from("aliexpress_tokens").delete().eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
