import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { AI_BUDGET_EUR_PAR_PLAN, PLAN_LIMITS, currentMonthKey, getMonthlyUsage } from "@/lib/plan-limits";
import { arrondiCentime, etatFenetres, getBudgetParFonction, type EtatFenetre } from "@/lib/ai-budget";

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

  const [auditsUsed, sitesCount, simulationsCount, boutiques, budgetParFonction, fenetres] = await Promise.all([
    getMonthlyUsage(supabase, user.id, "audit_ia"),
    supabase
      .from("sites_generes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", debutMois),
    supabase.from("simulations_marge").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.from("boutiques").select("id, nom").eq("user_id", user.id).order("nom"),
    getBudgetParFonction(supabase, user.id),
    etatFenetres(supabase, user.id, plan),
  ]);
  const fenetre = (e: EtatFenetre) => ({ utilise: arrondiCentime(e.utilise), max: arrondiCentime(e.max), reprise: e.reprise });

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
    // Budget IA du mois en euros (lib/ai-budget.ts) : la limite qui s'applique à toutes les
    // fonctions IA, en plus des quotas ci-dessus.
    // jour / semaine : limites glissantes sur 24 heures et 7 jours (null sans la migration 044).
    budgetIa: {
      utilise: arrondiCentime(Object.values(budgetParFonction).reduce((total, euros) => total + euros, 0)),
      max: AI_BUDGET_EUR_PAR_PLAN[plan],
      jour: fenetres ? fenetre(fenetres.jour) : null,
      semaine: fenetres ? fenetre(fenetres.semaine) : null,
      // Coût du mois par fonction (site_builder, audit_ia, …), pour le camembert du dashboard.
      parFonction: Object.fromEntries(Object.entries(budgetParFonction).map(([f, euros]) => [f, Math.round(euros * 10_000) / 10_000])),
    },
  });
}
