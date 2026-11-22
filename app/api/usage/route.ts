import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { getPeriodeExpert, limiteSitesExpert } from "@/lib/expert-quota";
import { currentMonthKey, getMonthlyUsage, limitesDuPlan, budgetIaEur, budgetImagesEur } from "@/lib/plan-limits";
import { MODELE_PAR_FONCTION, arrondiCentime, etatFenetres, getBudgetParFonction, getImagesUsedEuros, tokensSortieEquivalents, type EtatFenetre } from "@/lib/ai-budget";
import { IMAGE_PRICE_EUR } from "@/lib/expert-pricing";
import { imagesPossiblesBudget } from "@/lib/media/quota-images-regles";

// Agrège, pour l'utilisateur connecté, l'usage réel de chaque limite définie dans
// PLAN_LIMITS — utilisé par la section "Utilisation" des paramètres. Chaque limite a
// une nature différente (compteur mensuel, cumul total, cap de navigation, cap par
// boutique), donc pas de logique générique : un bloc par limite, avec sa propre
// requête, pour rester fidèle à la façon dont chacune est réellement appliquée
// ailleurs dans l'app (generate-site, audit-site, simulations-marge, boutiques/[id]/produits).
export async function GET() {
  const { supabase, user, plan } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connectez-vous pour voir votre utilisation.", code: "auth_required" }, { status: 401 });
  }

  const limits = limitesDuPlan(plan);
  // Sites : quota d'unités payées pour Expert ; pour les autres plans, nombre informatif (la
  // limite de création est le budget IA du mois, en tokens réellement consommés).
  const maxSites = plan === "expert" ? await limiteSitesExpert(supabase, user.id) : null;
  const periodeExpert = plan === "expert" ? await getPeriodeExpert(supabase, user.id) : null;
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
  const budgetUtilise = Object.values(budgetParFonction).reduce((total, euros) => total + euros, 0);
  // Budget images (Pro, Agency), séparé du budget IA. Expert : quota d'images du plan (page Quota).
  const budgetImagesMax = budgetImagesEur(plan);
  const imagesUtilise = budgetImagesMax > 0 ? await getImagesUsedEuros(supabase, user.id).catch(() => null) : null;
  const budgetRestant = Math.max(0, budgetIaEur(plan) - budgetUtilise);
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
      { key: "sites_generes", label: "Sites générés", used: periodeExpert?.sites_utilises ?? sitesCount.count ?? 0, max: maxSites, informatif: plan !== "expert" },
    ],
    total: [
      { key: "simulations_marge", label: "Simulations de marge sauvegardées", used: simulationsCount.count ?? 0, max: limits.simulationsMax },
    ],
    catalogue: { max: limits.produitsMax },
    boutiques: boutiqueUsage,
    // Budget IA du mois en euros (lib/ai-budget.ts) : textes, sites et audits, en plus des
    // quotas ci-dessus. Les images n'y sont pas comptées (budgetImages).
    // jour / semaine : limites glissantes sur 24 heures et 7 jours (null sans la migration 044).
    budgetIa: {
      utilise: arrondiCentime(budgetUtilise),
      max: budgetIaEur(plan),
      restant: arrondiCentime(budgetRestant),
      // Indication : tokens de sortie du modèle de génération de site que couvre le reste.
      tokensSortieRestants: tokensSortieEquivalents(budgetRestant, MODELE_PAR_FONCTION.site_builder!),
      jour: fenetres ? fenetre(fenetres.jour) : null,
      semaine: fenetres ? fenetre(fenetres.semaine) : null,
    },
    // Budget images du mois (Pro, Agency) : seules les images le décomptent. null : plan sans
    // budget images (Expert : quota d'images, sans plan payant : rien) ou compteur illisible.
    budgetImages:
      budgetImagesMax > 0 && imagesUtilise !== null
        ? {
            utilise: arrondiCentime(imagesUtilise),
            max: budgetImagesMax,
            restant: arrondiCentime(Math.max(0, budgetImagesMax - imagesUtilise)),
            imagesRestantes: imagesPossiblesBudget(budgetImagesMax, imagesUtilise, IMAGE_PRICE_EUR),
          }
        : null,
  });
}
