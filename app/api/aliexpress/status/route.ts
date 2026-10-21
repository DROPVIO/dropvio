import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { isAliExpressOAuthConfigured } from "@/lib/aliexpress-oauth";

// Statut de connexion AliExpress pour l'UI — ne renvoie jamais les tokens (même chiffrés).
// connected ne garantit pas que le refresh_token est encore accepté par AliExpress : un refus
// est détecté au premier appel (getValidAccessToken renvoie null -> code aliexpress_not_connected).
export async function GET() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi.", code: "auth_required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("aliexpress_tokens")
    .select("access_token_chiffre, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    configured: isAliExpressOAuthConfigured(),
    connected: Boolean(data?.access_token_chiffre),
    connected_at: data?.updated_at ?? null,
  });
}
