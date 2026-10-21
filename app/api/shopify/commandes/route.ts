import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getShopifyConnection, createShopifyFulfillment, ShopifyApiError } from "@/lib/shopify";

const LOOKBACK_DAYS = 30;

type LigneCommande = {
  shopify_product_id: number | null;
  source_produit_id: string | null;
  nom: string;
  quantite: number;
  variant_title: string | null;
  lien_aliexpress: string | null;
  // Variante AliExpress à commander (import par variante, migration 036) — absente des
  // lignes créées avant.
  variante_attributs?: Record<string, string> | null;
};

// Liste les commandes à préparer côté AliExpress (v1 "assist manuel", voir
// commandes_a_preparer). Même garde-fou que /api/shopify/incidents : la table n'a aucune
// policy RLS pour authenticated (elle porte de la PII client), accès service role
// uniquement, toujours filtré explicitement par user_id.
export async function GET() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi.", code: "auth_required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000).toISOString();

  const { data, error } = await admin
    .from("commandes_a_preparer")
    .select(
      "id, shopify_order_id, shopify_order_name, statut, adresse_livraison, client_nom, client_telephone, lignes, numero_suivi, transporteur, fulfillment_shopify_id, fulfillment_erreur, created_at"
    )
    .eq("user_id", user.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ commandes: data ?? [], lookbackDays: LOOKBACK_DAYS });
}

// Trois usages distincts, discriminés par la forme du body — jamais d'achat déclenché depuis
// dropvio dans aucun des trois :
// 1. { id, statut } : le marchand confirme avoir traité la commande côté AliExpress (ou l'écarte).
// 2. { id, ligneIndex, lienAliExpress } : rattache manuellement un lien AliExpress à une ligne
//    dont la résolution automatique (boutique_produits.lien_aliexpress, sinon
//    produits.lienAliExpress via source_produit_id) a échoué.
// 3. { id, numeroSuivi, transporteur? } : le marchand a commandé et saisit le numéro de suivi —
//    tentative de push vers Shopify (fulfillment), best-effort : le numéro reste enregistré côté
//    dropvio même si le push échoue (scope manquant, commande déjà expédiée, etc.).
export async function PATCH(request: NextRequest) {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi.", code: "auth_required" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const id = body?.id;
  if (typeof id !== "string") {
    return NextResponse.json({ error: "Requête invalide.", code: "invalid_request" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (typeof body?.ligneIndex === "number" && typeof body?.lienAliExpress === "string") {
    return attachLien(admin, user.id, id, body.ligneIndex, body.lienAliExpress);
  }

  if (typeof body?.numeroSuivi === "string" && body.numeroSuivi.trim().length > 0) {
    return pushSuivi(admin, user.id, id, body.numeroSuivi.trim(), body?.transporteur ?? null);
  }

  const statut = body?.statut;
  if (statut !== "commandee" && statut !== "ignoree") {
    return NextResponse.json({ error: "Requête invalide.", code: "invalid_request" }, { status: 400 });
  }

  const { error } = await admin
    .from("commandes_a_preparer")
    .update({ statut, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function attachLien(admin: AdminClient, userId: string, id: string, ligneIndex: number, lienAliExpress: string) {
  const { data: commande, error: fetchError } = await admin
    .from("commandes_a_preparer")
    .select("lignes")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError || !commande) {
    return NextResponse.json({ error: fetchError?.message ?? "Commande introuvable.", code: "order_not_found" }, { status: 404 });
  }

  const lignes: LigneCommande[] = commande.lignes ?? [];
  if (ligneIndex < 0 || ligneIndex >= lignes.length) {
    return NextResponse.json({ error: "Ligne introuvable.", code: "not_found" }, { status: 400 });
  }

  lignes[ligneIndex] = { ...lignes[ligneIndex], lien_aliexpress: lienAliExpress };

  const { error: updateError } = await admin
    .from("commandes_a_preparer")
    .update({ lignes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message, code: "server_error" }, { status: 500 });
  }

  // Best-effort : propage le lien pour ne pas retomber sur le même trou aux prochaines
  // commandes de ce produit. N'affecte jamais la réponse à cette requête.
  // - Produit du catalogue : vers produits.lienAliExpress (comportement d'origine).
  // - Produit hors catalogue (source_produit_id null) : vers boutique_produits.lien_aliexpress,
  //   limité aux boutiques de l'utilisateur (client service role, donc sans RLS).
  const { source_produit_id: sourceProduitId, shopify_product_id: shopifyProductId } = lignes[ligneIndex];
  if (sourceProduitId) {
    await admin.from("produits").update({ lienAliExpress: lienAliExpress }).eq("id", sourceProduitId);
  } else if (shopifyProductId) {
    const { data: boutiques } = await admin.from("boutiques").select("id").eq("user_id", userId);
    const boutiqueIds = (boutiques ?? []).map((b) => b.id);
    if (boutiqueIds.length > 0) {
      await admin
        .from("boutique_produits")
        .update({ lien_aliexpress: lienAliExpress })
        .eq("shopify_product_id", shopifyProductId)
        .in("boutique_id", boutiqueIds);
    }
  }

  return NextResponse.json({ ok: true });
}

async function pushSuivi(admin: AdminClient, userId: string, id: string, numeroSuivi: string, transporteur: string | null) {
  const { error: saveError } = await admin
    .from("commandes_a_preparer")
    .update({ numero_suivi: numeroSuivi, transporteur, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId);

  if (saveError) {
    return NextResponse.json({ error: saveError.message, code: "server_error" }, { status: 500 });
  }

  const { data: commande } = await admin
    .from("commandes_a_preparer")
    .select("shopify_order_id")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  const connection = await getShopifyConnection(userId);
  if (!connection || !connection.fulfillment_scope_granted || !commande) {
    // fulfillment_erreur garde un code (traduit à l'affichage, namespace apiErrors), plus un texte.
    const code = !connection
      ? "shopify_not_connected"
      : !connection.fulfillment_scope_granted
        ? "shopify_reconnect_fulfillment"
        : "order_not_found";
    await admin.from("commandes_a_preparer").update({ fulfillment_erreur: code }).eq("id", id).eq("user_id", userId);
    return NextResponse.json({ ok: true, fulfillmentPushed: false, error: code, code });
  }

  try {
    const fulfillmentId = await createShopifyFulfillment(connection.shop_domain, connection.access_token, commande.shopify_order_id, {
      number: numeroSuivi,
      company: transporteur,
    });
    await admin
      .from("commandes_a_preparer")
      .update({ fulfillment_shopify_id: fulfillmentId, fulfillment_erreur: null })
      .eq("id", id)
      .eq("user_id", userId);
    return NextResponse.json({ ok: true, fulfillmentPushed: true });
  } catch (err) {
    console.warn("[shopify/commandes] Envoi du suivi échoué :", err);
    const code = err instanceof ShopifyApiError ? `shopify_${err.code}` : "shopify_unknown";
    await admin.from("commandes_a_preparer").update({ fulfillment_erreur: code }).eq("id", id).eq("user_id", userId);
    return NextResponse.json({ ok: true, fulfillmentPushed: false, error: code, code });
  }
}
