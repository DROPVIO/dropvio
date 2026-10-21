import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { isBoutiqueOwner } from "@/lib/boutique-access";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { apiError } from "@/lib/api-errors";
import { getProductVariants, type AliExpressVariant, type AliExpressVariantsResult } from "@/lib/aliexpress";
import { slugify } from "@/lib/slugify";

// Import d'un produit AliExpress en une fiche boutique_produits PAR VARIANTE (SKU), chaque
// variante étant un produit distinct. Les variantes sont toujours relues côté serveur via
// l'API Dropshipping (token OAuth de l'utilisateur) : le client n'envoie que les sku_id
// choisis, jamais de prix.
//   GET  ?productId=…  -> aperçu : variantes, déjà présentes, places restantes dans le plan
//   POST { productId, skuIds? } -> création (toutes les variantes si skuIds absent)

const PRODUCT_ID = /^\d{6,}$/;
const MAX_IMAGES = 6;

type Contexte =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof getServerUserPlanOnly>>["supabase"];
      boutiqueId: string;
      productId: string;
      variantes: Extract<AliExpressVariantsResult, { ok: true }>;
      existants: Set<string>;
      // null = illimité
      restant: number | null;
    };

function erreurVariantes(error: Extract<AliExpressVariantsResult, { ok: false }>["error"]): NextResponse {
  switch (error) {
    case "non_connecte":
      return apiError(
        "aliexpress_not_connected",
        409,
        "Connecte ton compte AliExpress dans les paramètres pour importer les variantes."
      );
    case "permission_refusee":
      return apiError(
        "aliexpress_ds_permission",
        503,
        "L'accès aux variantes AliExpress n'est pas encore activé pour Dropvio."
      );
    case "introuvable":
      return apiError("aliexpress_product_not_found", 404, "Produit introuvable sur AliExpress.");
    default:
      return apiError("aliexpress_api_error", 502, "AliExpress n'a pas répondu. Réessaie dans un instant.");
  }
}

async function chargerContexte(boutiqueId: string, productId: unknown): Promise<Contexte> {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return { ok: false, response: apiError("auth_required", 401, "Connecte-toi pour importer un produit.") };
  }
  if (typeof productId !== "string" || !PRODUCT_ID.test(productId)) {
    return { ok: false, response: apiError("aliexpress_url_invalid", 400, "Identifiant de produit AliExpress invalide.") };
  }
  if (!(await isBoutiqueOwner(boutiqueId, user.id))) {
    return { ok: false, response: apiError("boutique_not_found", 404, "Boutique introuvable.") };
  }

  const variantes = await getProductVariants(productId, user.id);
  if (!variantes.ok) return { ok: false, response: erreurVariantes(variantes.error) };

  const [{ count, error: countError }, { data: dejaLa, error: existantsError }] = await Promise.all([
    supabase.from("boutique_produits").select("id", { count: "exact", head: true }).eq("boutique_id", boutiqueId),
    supabase
      .from("boutique_produits")
      .select("aliexpress_sku_id")
      .eq("boutique_id", boutiqueId)
      .eq("aliexpress_product_id", productId),
  ]);
  if (countError || existantsError) {
    return {
      ok: false,
      response: apiError("server_error", 500, (countError ?? existantsError)!.message),
    };
  }

  const max = PLAN_LIMITS[plan].produitsBoutiqueMax;
  return {
    ok: true,
    supabase,
    boutiqueId,
    productId,
    variantes,
    existants: new Set((dejaLa ?? []).map((r) => r.aliexpress_sku_id).filter((v): v is string => Boolean(v))),
    restant: max === null ? null : Math.max(0, max - (count ?? 0)),
  };
}

function nomVariante(titre: string, v: AliExpressVariant): string {
  const valeurs = Object.values(v.attributs);
  return valeurs.length > 0 ? `${titre} – ${valeurs.join(" / ")}` : titre;
}

// slugify() ne garde que [a-z0-9] : accents retirés avant (é -> e) pour un slug lisible.
// Le suffixe SKU évite que deux variantes au nom identique partagent un slug.
function slugVariante(nom: string, skuId: string): string {
  const base = slugify(nom.normalize("NFD").replace(/[̀-ͯ]/g, "")).slice(0, 70).replace(/-$/, "");
  return `${base}-${skuId.slice(-6)}`;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await chargerContexte(id, request.nextUrl.searchParams.get("productId"));
  if (!ctx.ok) return ctx.response;

  return NextResponse.json({
    titre: ctx.variantes.titre,
    image: ctx.variantes.images[0] ?? null,
    variantes: ctx.variantes.variantes.map((v) => ({
      ...v,
      nom: nomVariante(ctx.variantes.titre, v),
      deja_presente: ctx.existants.has(v.sku_id),
    })),
    restant: ctx.restant,
  });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const ctx = await chargerContexte(id, body?.productId);
  if (!ctx.ok) return ctx.response;

  const demandes: string[] | null = Array.isArray(body?.skuIds)
    ? body.skuIds.filter((s: unknown): s is string => typeof s === "string")
    : null;
  const choisies = ctx.variantes.variantes.filter((v) => demandes === null || demandes.includes(v.sku_id));
  if (choisies.length === 0) {
    return apiError("aliexpress_no_variant_selected", 400, "Sélectionne au moins une variante.");
  }

  // Les variantes déjà présentes ne consomment pas de place dans le plan : on les écarte
  // avant d'appliquer la limite. L'index unique (036) reste le garde-fou en cas d'imports
  // simultanés (ignoreDuplicates ci-dessous).
  const nouvelles = choisies.filter((v) => !ctx.existants.has(v.sku_id));
  const aInserer = ctx.restant === null ? nouvelles : nouvelles.slice(0, ctx.restant);
  const ignoreesLimite = nouvelles.length - aInserer.length;

  // Relie au catalogue quand le produit y figure (l'id catalogue est l'id produit AliExpress),
  // comme un import mono-fiche : exploité par les suggestions de produits complémentaires.
  const { data: catalogue } = await ctx.supabase.from("produits").select("id").eq("id", ctx.productId).maybeSingle();
  const lien = `https://www.aliexpress.com/item/${ctx.productId}.html`;

  let creees = 0;
  if (aInserer.length > 0) {
    const lignes = aInserer.map((v) => {
      const nom = nomVariante(ctx.variantes.titre, v);
      const images = [...new Set([v.image, ...ctx.variantes.images].filter((u): u is string => Boolean(u)))];
      return {
        boutique_id: ctx.boutiqueId,
        source_produit_id: catalogue?.id ?? null,
        nom,
        slug: slugVariante(nom, v.sku_id),
        description: ctx.variantes.titre,
        image_urls: images.slice(0, MAX_IMAGES),
        prix_vente: v.prix ?? 0,
        prix_original: v.prix_original,
        position: 0,
        meta: {},
        aliexpress_product_id: ctx.productId,
        aliexpress_sku_id: v.sku_id,
        lien_aliexpress: lien,
        variante_attributs: v.attributs,
      };
    });

    const { data, error } = await ctx.supabase
      .from("boutique_produits")
      .upsert(lignes, { onConflict: "boutique_id,aliexpress_product_id,aliexpress_sku_id", ignoreDuplicates: true })
      .select("id");
    if (error) {
      return apiError("server_error", 500, error.message);
    }
    creees = data?.length ?? 0;
  }

  const dejaPresentes = choisies.length - creees - ignoreesLimite;
  const parties = [`${creees} variante(s) créée(s)`];
  if (dejaPresentes > 0) parties.push(`${dejaPresentes} déjà présente(s)`);
  if (ignoreesLimite > 0) parties.push(`${ignoreesLimite} ignorée(s) (limite du plan atteinte)`);

  return NextResponse.json({
    creees,
    deja_presentes: dejaPresentes,
    ignorees_limite: ignoreesLimite,
    message: parties.join(", ") + ".",
  });
}
