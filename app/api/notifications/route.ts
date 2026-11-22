import { NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiError, erreurServeur } from "@/lib/api-errors";
import { resumeLignes } from "@/lib/ventes";

const DERNIERES = 10;
const TABLE_ABSENTE = "42P01";

// Cloche de l'application : nombre de ventes non vues et les dernières notifications. Aucune
// donnée personnelle : numéro de commande et produit seulement.
export async function GET() {
  const { user } = await getServerUserPlanOnly();
  if (!user) return apiError("auth_required", 401, "Connecte-toi.");

  const admin = createSupabaseAdminClient();
  const [compte, liste] = await Promise.all([
    admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("vue_le", null),
    admin
      .from("notifications")
      .select("id, created_at, vue_le, commandes_a_preparer(shopify_order_name, shopify_order_id, lignes)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(DERNIERES),
  ]);
  const erreur = compte.error ?? liste.error;
  // Migration 051 pas encore appliquée : pas de cloche plutôt qu'une erreur sur chaque page.
  if (erreur && (erreur.code === TABLE_ABSENTE || erreur.code === "PGRST205")) {
    return NextResponse.json({ nonVues: 0, notifications: [], disponible: false });
  }
  if (erreur) {
    console.error("[notifications]", erreur.message);
    return erreurServeur("api/notifications", "Notifications illisibles.");
  }

  return NextResponse.json({
    nonVues: compte.count ?? 0,
    disponible: true,
    notifications: (liste.data ?? []).map((n) => {
      const commande = (Array.isArray(n.commandes_a_preparer) ? n.commandes_a_preparer[0] : n.commandes_a_preparer) as
        | { shopify_order_name: string | null; shopify_order_id: number; lignes: unknown }
        | null;
      return {
        id: n.id,
        date: n.created_at,
        vue: n.vue_le !== null,
        numero: commande ? commande.shopify_order_name ?? `#${commande.shopify_order_id}` : null,
        produit: commande ? resumeLignes(commande.lignes).produit : null,
      };
    }),
  });
}
