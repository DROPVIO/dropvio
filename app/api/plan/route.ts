import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";

// Endpoint minimal pour les pages client qui n'ont besoin que du plan (ex. afficher/masquer
// une action réservée à Pro/Agency) — évite d'appeler /api/usage, bien plus coûteux (agrège
// plusieurs tables), juste pour lire un champ.
export async function GET() {
  const { plan } = await getServerUserPlanOnly();
  return NextResponse.json({ plan });
}
