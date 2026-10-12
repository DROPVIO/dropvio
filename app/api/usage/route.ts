import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, currentMonthKey, getMonthlyUsage } from "@/lib/plan-limits";

// Agrège, pour l'utilisateur connecté, l'usage réel de chaque limite définie dans
// PLAN_LIMITS — utilisé par la section "Utilisation" des paramètres. Chaque limite a
// une nature différente (compteur mensuel, cumul total, cap de navigation, cap par
// boutique), donc pas de logique générique : un bloc par limite, avec sa propre
// requête, pour rester fidèle à la façon dont chacune est réellement appliquée
// ailleurs dans l'app (generate-site, audit-site, simulations-marge, boutiques/[id]/produits).
export async function GET() {
  const { supabase, user, plan } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour voir ton utilisation.", code: "auth_required" }, { status: 401 });
  }

  const limits = PLAN_LIMITS[plan];
  const debutMois = `${currentMonthKey()}T00:00:00.000Z`;

  const [auditsUsed, sitesCount, simulationsCount, boutiques] = await Promise.all([
    getMonthlyUsage(supabase, user.id, "audit_ia"),
    supabase
      .from("sites_generes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", debutMois),
    supabase.from("simulations_marge").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("boutiques").select("id, nom").eq("user_id", user.id).order("nom"),
  ]);

  const boutiqueRows = boutiques.data ?? [];
  const boutiqueUsage = await Promise.all(
    boutiqueRows.map(async (b) => {
      const { count } = await supabase
        .from("boutique_produits")
        .select("id", { count: "exact", head: true })
        .eq("boutique_id", b.id);
      return { id: b.id, nom: b.nom, used: count ?? 0, max: limits.produitsBoutiqueMax };
    })
  );

  return NextResponse.json({
    plan,
    monthly: [
      { key: "audits_ia", label: "Audits IA", used: auditsUsed, max: limits.auditsParMoisMax },
      { key: "sites_generes", label: "Sites générés", used: sitesCount.count ?? 0, max: limits.sitesParMoisMax },
    ],
    total: [
      { key: "simulations_marge", label: "Simulations de marge sauvegardées", used: simulationsCount.count ?? 0, max: limits.simulationsMax },
    ],
    catalogue: { max: limits.produitsMax },
    boutiques: boutiqueUsage,
  });
}
