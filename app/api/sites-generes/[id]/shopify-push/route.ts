import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import {
  isShopifyConfigured,
  getShopifyConnection,
  shopifyFetch,
  ShopifyApiError,
  shopifyErrorToHttpStatus,
} from "@/lib/shopify";
import { htmlToLiquidSection, slugifyForShopify } from "@/lib/html-to-liquid";

type ShopifyPage = { id: number; handle: string };
type ShopifyTheme = { id: number; role: string };

// Remplace le guide manuel "télécharge le HTML/Liquid et colle-le dans l'admin Shopify" :
// pousse directement le design généré vers la boutique connectée.
//  - mode "html"   : crée/MAJ une Page Shopify avec le HTML complet en body_html — même
//    contenu que ce que l'utilisateur collait à la main en mode "Source du code".
//  - mode "liquid" : upload le HTML converti en section Liquid comme asset du thème actif,
//    puis tente de l'auto-attacher à une page dédiée via un template JSON (thèmes Online
//    Store 2.0). Si le thème ne supporte pas les templates JSON (thème "vintage"), la
//    section est quand même uploadée mais l'attachement reste une étape manuelle — on le
//    dit clairement plutôt que de prétendre que tout est fait.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour publier ce site sur Shopify." }, { status: 401 });
  }

  if (!isShopifyConfigured()) {
    return NextResponse.json(
      { error: "L'intégration Shopify n'est pas encore configurée côté serveur." },
      { status: 500 }
    );
  }

  let mode: "html" | "liquid";
  try {
    const body = await request.json();
    mode = body.mode === "liquid" ? "liquid" : "html";
  } catch {
    mode = "html";
  }

  const { data: site, error: siteError } = await supabase
    .from("sites_generes")
    .select("id, nom_produit, html_content, shopify_page_id, shopify_theme_id, shopify_section_key")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (siteError) return NextResponse.json({ error: siteError.message }, { status: 500 });
  if (!site) return NextResponse.json({ error: "Site introuvable." }, { status: 404 });

  const connection = await getShopifyConnection(user.id);
  if (!connection) {
    return NextResponse.json(
      { error: "Connecte d'abord ta boutique Shopify dans les paramètres avant de publier ce site." },
      { status: 400 }
    );
  }

  const shop = connection.shop_domain;
  const token = connection.access_token;

  try {
    if (mode === "html") {
      const payload = { page: { title: site.nom_produit, body_html: site.html_content, published: true } };
      let page: ShopifyPage;
      if (site.shopify_page_id) {
        const res = await shopifyFetch<{ page: ShopifyPage }>(shop, token, `/pages/${site.shopify_page_id}.json`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        page = res.page;
      } else {
        const res = await shopifyFetch<{ page: ShopifyPage }>(shop, token, "/pages.json", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        page = res.page;
        await supabase.from("sites_generes").update({ shopify_page_id: page.id }).eq("id", id);
      }
      return NextResponse.json({
        mode: "html",
        url: `https://${shop}/pages/${page.handle}`,
        admin_url: `https://${shop}/admin/pages/${page.id}`,
      });
    }

    // mode "liquid"
    const themes = await shopifyFetch<{ themes: ShopifyTheme[] }>(shop, token, "/themes.json");
    const mainTheme = themes.themes.find((t) => t.role === "main");
    if (!mainTheme) {
      throw new ShopifyApiError("Impossible de trouver le thème actif de la boutique Shopify.", 500, "unknown");
    }

    const slugBase = slugifyForShopify(site.nom_produit) || `site-${site.id.slice(0, 8)}`;
    const sectionType = `dropvio-${slugBase}`;
    const sectionKey = `sections/${sectionType}.liquid`;
    const liquidSource = htmlToLiquidSection(site.html_content, site.nom_produit);

    await shopifyFetch(shop, token, `/themes/${mainTheme.id}/assets.json`, {
      method: "PUT",
      body: JSON.stringify({ asset: { key: sectionKey, value: liquidSource } }),
    });

    let autoAttached = false;
    let page: ShopifyPage;
    try {
      const templateSuffix = sectionType;
      const templateKey = `templates/page.${templateSuffix}.json`;
      const templateJson = JSON.stringify({
        sections: { main: { type: sectionType, settings: {} } },
        order: ["main"],
      });
      await shopifyFetch(shop, token, `/themes/${mainTheme.id}/assets.json`, {
        method: "PUT",
        body: JSON.stringify({ asset: { key: templateKey, value: templateJson } }),
      });

      const payload = { page: { title: site.nom_produit, body_html: "", template_suffix: templateSuffix, published: true } };
      if (site.shopify_page_id) {
        const res = await shopifyFetch<{ page: ShopifyPage }>(shop, token, `/pages/${site.shopify_page_id}.json`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        page = res.page;
      } else {
        const res = await shopifyFetch<{ page: ShopifyPage }>(shop, token, "/pages.json", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        page = res.page;
      }
      autoAttached = true;
    } catch {
      // Thème sans support des templates JSON (sections Liquid "vintage") : la section
      // est bien sur le thème, mais l'attachement à une page reste manuel.
      const payload = {
        page: {
          title: site.nom_produit,
          body_html: `<!-- Section "${sectionType}" ajoutée au thème. Va dans Boutique en ligne → Thèmes → Personnaliser, ouvre cette page puis clique « Ajouter une section » et cherche "${sectionType}". -->`,
          published: true,
        },
      };
      if (site.shopify_page_id) {
        const res = await shopifyFetch<{ page: ShopifyPage }>(shop, token, `/pages/${site.shopify_page_id}.json`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        page = res.page;
      } else {
        const res = await shopifyFetch<{ page: ShopifyPage }>(shop, token, "/pages.json", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        page = res.page;
      }
    }

    await supabase
      .from("sites_generes")
      .update({ shopify_page_id: page.id, shopify_theme_id: mainTheme.id, shopify_section_key: sectionKey })
      .eq("id", id);

    return NextResponse.json({
      mode: "liquid",
      autoAttached,
      url: `https://${shop}/pages/${page.handle}`,
      admin_url: `https://${shop}/admin/pages/${page.id}`,
      message: autoAttached
        ? "Section Liquid poussée et attachée automatiquement à la page."
        : `Section Liquid uploadée dans le thème, mais l'attachement automatique n'a pas fonctionné sur ce thème (probablement un thème sans templates JSON). Termine manuellement : Boutique en ligne → Thèmes → Personnaliser → ouvre la page créée → Ajouter une section → "${sectionType}".`,
    });
  } catch (err) {
    if (err instanceof ShopifyApiError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: shopifyErrorToHttpStatus(err) });
    }
    console.error("[sites-generes/shopify-push] erreur inattendue :", err);
    return NextResponse.json({ error: "Erreur inattendue lors de la publication sur Shopify." }, { status: 500 });
  }
}
