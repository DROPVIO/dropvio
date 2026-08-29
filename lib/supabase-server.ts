import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Plan } from "./plan-limits";
import type { FormationOwnership } from "./formation";

// Client Supabase lié aux cookies de session de la requête en cours (Route Handler).
// Respecte RLS avec le JWT de l'utilisateur connecté — jamais de service role ici.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
}

const NO_FORMATION_OWNED: FormationOwnership = { courte: false, longue: false };

// Utilisateur + plan résolus côté serveur, à partir de la session (jamais d'un champ
// envoyé par le client). Pas de session ou pas de ligne profils -> "free" par défaut, le
// choix le plus restrictif. formationOwned suit le même principe (jamais de confiance dans
// une valeur côté client) — achat à vie par collection, indépendant du plan, voir
// lib/formation.ts et supabase/migrations/020_formation_achats.sql.
export async function getServerUserAndPlan(): Promise<{
  supabase: SupabaseClient;
  user: User | null;
  plan: Plan;
  formationOwned: FormationOwnership;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, plan: "free", formationOwned: NO_FORMATION_OWNED };
  }

  const [{ data: profil }, { data: achats }] = await Promise.all([
    supabase.from("profils").select("plan").eq("id", user.id).maybeSingle(),
    supabase.from("formation_achats").select("collection").eq("user_id", user.id),
  ]);

  const plan = (profil?.plan as Plan | undefined) ?? "free";
  const formationOwned: FormationOwnership = {
    courte: achats?.some((a) => a.collection === "courte") ?? false,
    longue: achats?.some((a) => a.collection === "longue") ?? false,
  };
  return { supabase, user, plan, formationOwned };
}

// Version allégée pour les routes qui n'ont besoin que de user.id + plan (ex. vérifier un
// plafond de plan avant une requête de liste), sans jamais toucher formation_achats — mesuré
// empiriquement sur /api/aliexpress/products : getServerUserAndPlan() coûtait 125-195ms par
// appel à elle seule, sur CHAQUE changement de niche/page, pour une donnée (formationOwned)
// jamais utilisée par ces routes. Même principe que la recommandation faite lors du
// diagnostic dashboard précédent (route.ts appelant getServerUserAndPlan() pour un simple
// contrôle d'accès n'a pas besoin du reste du payload).
export async function getServerUserPlanOnly(): Promise<{
  supabase: SupabaseClient;
  user: User | null;
  plan: Plan;
}> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { supabase, user: null, plan: "free" };
  }

  const { data: profil } = await supabase.from("profils").select("plan").eq("id", user.id).maybeSingle();
  const plan = (profil?.plan as Plan | undefined) ?? "free";
  return { supabase, user, plan };
}
