import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const MINUTES_AVANT_REMBOURSEMENT = 15;

// Rend les unités réservées par une génération coupée avant sa fin (timeout Vercel). Même
// authentification que les autres crons : Vercel Cron envoie `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const { data, error } = await createSupabaseAdminClient().rpc("expert_rembourser_expirees", {
    p_minutes: MINUTES_AVANT_REMBOURSEMENT,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ rembourses: data ?? 0 });
}
