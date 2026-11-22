import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { DELAI_RETRACTATION_JOURS, type AchatRecent } from "@/lib/retractation";

// Achats des 14 derniers jours du compte connecté, pour le choix proposé par /retractation.
// Sans connexion : liste vide (le formulaire passe alors en texte libre). Lecture avec la
// session de l'utilisateur, donc limitée à ses propres achats par le RLS.
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ achats: [] });

  const depuis = new Date(Date.now() - DELAI_RETRACTATION_JOURS * 86_400_000).toISOString();
  const [formations, periodes, credits, consentements] = await Promise.all([
    supabase.from("formation_achats").select("id, collection, created_at").eq("user_id", user.id).gte("created_at", depuis),
    supabase.from("expert_periodes").select("id, created_at").eq("user_id", user.id).gte("created_at", depuis),
    supabase.from("expert_credits").select("id, created_at").eq("user_id", user.id).gte("created_at", depuis),
    // Pro et Agency : le consentement enregistré au paiement date le début de l'abonnement.
    supabase.from("consentements_achat").select("id, type_achat, created_at").eq("user_id", user.id).gte("created_at", depuis).in("type_achat", ["abonnement_pro", "abonnement_agency"]),
  ]);

  const jour = (d: string) => d.slice(0, 10);
  const achats: AchatRecent[] = [
    ...(formations.data ?? []).map((a) => ({ ref: `formation:${a.id}`, libelle: `formation_${a.collection}`, date: jour(a.created_at) })),
    ...(periodes.data ?? []).map((a) => ({ ref: `expert:${a.id}`, libelle: "abonnement_expert", date: jour(a.created_at) })),
    ...(credits.data ?? []).map((a) => ({ ref: `recharge:${a.id}`, libelle: "recharge_expert", date: jour(a.created_at) })),
    ...(consentements.data ?? []).map((a) => ({ ref: `abonnement:${a.id}`, libelle: a.type_achat as string, date: jour(a.created_at) })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({ achats });
}
