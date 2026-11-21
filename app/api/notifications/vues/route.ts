import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiError } from "@/lib/api-errors";

// Ouverture de la cloche : toutes les notifications de l'utilisateur sont marquées vues.
export async function POST() {
  const { user } = await getServerUserPlanOnly();
  if (!user) return apiError("auth_required", 401, "Connecte-toi.");

  const { error } = await createSupabaseAdminClient()
    .from("notifications")
    .update({ vue_le: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("vue_le", null);
  if (error) {
    console.error("[notifications/vues]", error.message);
    return apiError("server_error", 500, "Impossible de marquer les notifications.");
  }
  return NextResponse.json({ ok: true });
}
