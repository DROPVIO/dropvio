import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { apiError, erreurServeur } from "@/lib/api-errors";
import { STATUTS_VENTE, changementAutorise, lireFiltreStatut, nombrePages, plagePage, venteAffichee, type StatutVente } from "@/lib/ventes";

// Page « Mes ventes » : 50 ventes par page, la plus récente d'abord. commandes_a_preparer porte
// des données personnelles (adresse, téléphone) et n'a aucune policy RLS : accès par le service
// role, toujours filtré par user_id, et seul le résumé masqué (prénom, ville) est renvoyé.
const COLONNES = "id, shopify_order_id, shopify_order_name, statut, lignes, adresse_livraison, client_nom, created_at";
// Colonne de la migration 051 : lue si elle existe, sans casser la page avant la migration.
const COLONNE_CHANGEMENT = "statut_change_le";
const COLONNE_ABSENTE = "42703";

export async function GET(request: NextRequest) {
  const { user } = await getServerUserPlanOnly();
  if (!user) return apiError("auth_required", 401, "Connecte-toi.");

  const params = request.nextUrl.searchParams;
  const statut = lireFiltreStatut(params.get("statut"));
  const { page, from, to } = plagePage(params.get("page"));
  const admin = createSupabaseAdminClient();

  const requete = (colonnes: string) => {
    let q = admin.from("commandes_a_preparer").select(colonnes, { count: "exact" }).eq("user_id", user.id);
    if (statut) q = q.eq("statut", statut);
    return q.order("created_at", { ascending: false }).range(from, to);
  };
  let reponse = await requete(`${COLONNES}, ${COLONNE_CHANGEMENT}`);
  if (reponse.error?.code === COLONNE_ABSENTE) reponse = await requete(COLONNES);
  if (reponse.error) {
    return erreurServeur("api/ventes", reponse.error);
  }

  const total = reponse.count ?? 0;
  return NextResponse.json({
    ventes: ((reponse.data ?? []) as unknown as Parameters<typeof venteAffichee>[0][]).map(venteAffichee),
    total,
    page,
    totalPages: nombrePages(total),
    statut,
  });
}

// Changement de statut par le marchand : « Marquer commandée » ou « Ignorer ». Jamais
// automatique, jamais de commande ni de paiement chez le fournisseur.
export async function PATCH(request: NextRequest) {
  const { user } = await getServerUserPlanOnly();
  if (!user) return apiError("auth_required", 401, "Connecte-toi.");

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : null;
  if (!id) return apiError("invalid_request", 400, "Requête invalide.");

  const admin = createSupabaseAdminClient();
  const { data: actuelle } = await admin.from("commandes_a_preparer").select("statut").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!actuelle || !STATUTS_VENTE.includes(actuelle.statut)) return apiError("order_not_found", 404, "Commande introuvable.");
  if (!changementAutorise(actuelle.statut as StatutVente, body?.statut)) return apiError("invalid_request", 400, "Statut invalide.");

  const maintenant = new Date().toISOString();
  const maj = (avecDate: boolean) =>
    admin
      .from("commandes_a_preparer")
      .update({ statut: body.statut, updated_at: maintenant, ...(avecDate ? { [COLONNE_CHANGEMENT]: maintenant } : {}) })
      .eq("id", id)
      .eq("user_id", user.id);
  let { error } = await maj(true);
  if (error?.code === COLONNE_ABSENTE) ({ error } = await maj(false));
  if (error) {
    console.error("[ventes] Changement de statut :", error.message);
    return erreurServeur("api/ventes", "Changement de statut impossible.");
  }
  return NextResponse.json({ ok: true, statut: body.statut, statutChangeLe: maintenant });
}
