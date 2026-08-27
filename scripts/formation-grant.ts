// Octroie manuellement l'accès à une formation à un utilisateur, en dehors de tout paiement
// Stripe — geste support (offre commerciale, compensation, test) plutôt que voie normale
// d'achat (voir app/api/formation/checkout/route.ts pour le vrai parcours payant).
//
// Usage : npm run formation:grant -- <email> <courte|longue|bundle>
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { createSupabaseAdminClient } from "../lib/supabase-admin";
import { grantFormationAccess, type FormationOffre } from "../lib/formation";

async function main() {
  const [email, rawOffre] = process.argv.slice(2);
  const offre = rawOffre as FormationOffre;

  if (!email || !["courte", "longue", "bundle"].includes(offre)) {
    console.error("Usage: npm run formation:grant -- <email> <courte|longue|bundle>");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();

  // Le schéma "auth" n'est jamais exposé via PostgREST (même avec le service role) — il faut
  // passer par l'API GoTrue Admin dédiée. Cette API ne propose pas de recherche par email
  // côté serveur, donc on paginate listUsers() jusqu'à trouver la correspondance.
  let authUser: { id: string; email?: string } | null = null;
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("Erreur lors de la recherche de l'utilisateur :", error.message);
      process.exit(1);
    }
    authUser = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
    if (authUser || !data.nextPage) break;
    page = data.nextPage;
  }

  if (!authUser) {
    console.error(`Aucun utilisateur avec l'email "${email}".`);
    process.exit(1);
  }

  await grantFormationAccess(supabase, authUser.id, offre, { via: "manuel" });
  console.log(`✅ Accès "${offre}" octroyé manuellement à ${email} (${authUser.id})`);
}

main().catch((err) => {
  console.error("Erreur fatale :", err);
  process.exit(1);
});
