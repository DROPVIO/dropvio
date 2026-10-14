import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import {
  isShopifyConfigured,
  getShopifyConnection,
  shopifyFetch,
  ShopifyApiError,
  shopifyErrorToHttpStatus,
  createPage,
  updatePage,
} from "@/lib/shopify";
import { htmlToLiquidSection, slugifyForShopify } from "@/lib/html-to-liquid";
import { CLE_ACCUEIL, fichierPage, pagesSiMultiples, titrePageConnue } from "@/lib/site-builder-pages";
import { chargerTextesSite, langueDuHtml, type TextesSite } from "@/lib/site-textes";

type ShopifyPage = { id: number; handle: string };
type ShopifyTheme = { id: number; role: string };

const UNDEFINED_COLUMN = "42703";
const SLUG = /^[a-z0-9-]+$/;

// Titre Shopify d'une page secondaire : « Nom du site — Catalogue », « — Mentions légales »,
// « — Lampes »…, dans la langue du site.
function titrePage(nomSite: string, cle: string, titres: TextesSite["pages"]): string {
  const libelle = titrePageConnue(cle, titres) ?? cle.replace(/^collection-/, "").replace(/-/g, " ");
  return `${nomSite} — ${libelle.charAt(0).toUpperCase()}${libelle.slice(1)}`;
}

type ResultatPage = {
  page: string;
  handle: string;
  ok: boolean;
  url?: string;
  admin_url?: string;
  erreur?: string;
};

function messageErreur(err: unknown): string {
  return err instanceof ShopifyApiError ? err.message : "Erreur inattendue.";
}

// Site multi-pages, mode html : une Page Shopify par clé. La page « accueil » garde le lien
// historique du site (shopify_page_id) ; les autres ont pour handle <handle accueil>-<clé>
// et sont retrouvées par handle à chaque publication. Deux passes : création/mise à jour de
// toutes les pages, puis réécriture des liens internes (index.html, <clé>.html → /pages/<handle>)
// une fois toutes les URL connues. Une page en échec est signalée sans annuler les autres.
async function publierMultiPages(params: {
  shop: string;
  token: string;
  site: { id: string; nom_produit: string; shopify_page_id: number | null };
  pages: Record<string, string>;
  enregistrerPageAccueil: (pageId: number) => Promise<void>;
}): Promise<NextResponse> {
  const { shop, token, site, pages, enregistrerPageAccueil } = params;
  const cles = Object.keys(pages);

  const clesInvalides = cles.filter((cle) => !SLUG.test(cle));
  if (clesInvalides.length > 0 || !(CLE_ACCUEIL in pages)) {
    return NextResponse.json(
      {
        error: `Publication impossible : clés de page invalides (${
          clesInvalides.length > 0 ? clesInvalides.join(", ") : `page « ${CLE_ACCUEIL} » absente`
        }).`, code: "shopify_publish_failed",
      },
      { status: 422 }
    );
  }

  // Handle de l'accueil : celui de la page déjà publiée, sinon dérivé du nom du site.
  let pageAccueil: { id: number; handle: string } | null = null;
  if (site.shopify_page_id) {
    try {
      const res = await shopifyFetch<{ page: ShopifyPage }>(shop, token, `/pages/${site.shopify_page_id}.json`);
      pageAccueil = res.page;
    } catch (err) {
      // Page supprimée côté Shopify : on repart d'un handle dérivé du nom.
      if (!(err instanceof ShopifyApiError && err.code === "not_found")) throw err;
    }
  }
  // Mis à jour après la publication de l'accueil : si le handle demandé est déjà pris,
  // Shopify en attribue un autre (…-1), et les pages secondaires doivent en dériver pour ne
  // jamais retomber sur celles d'un autre site.
  let handleAccueil = pageAccueil?.handle ?? slugifyForShopify(site.nom_produit);
  if (!SLUG.test(handleAccueil)) {
    return NextResponse.json(
      { error: `Publication impossible : le handle de la page d'accueil « ${handleAccueil} » n'est pas un slug valide.`, code: "shopify_publish_failed" },
      { status: 422 }
    );
  }
  const handleDe = (cle: string) => (cle === CLE_ACCUEIL ? handleAccueil : `${handleAccueil}-${cle}`);
  const titres = (await chargerTextesSite(langueDuHtml(pages[CLE_ACCUEIL]))).pages;
  const titreDe = (cle: string) => (cle === CLE_ACCUEIL ? site.nom_produit : titrePage(site.nom_produit, cle, titres));

  // Passe 1 : chaque page existe (mise à jour si son ID est connu, création sinon).
  const publiees = new Map<string, ShopifyPage>();
  const resultats = new Map<string, ResultatPage>();
  for (const cle of [CLE_ACCUEIL, ...cles.filter((c) => c !== CLE_ACCUEIL)]) {
    const handle = handleDe(cle);
    try {
      let idConnu: number | undefined;
      if (cle === CLE_ACCUEIL) {
        idConnu = pageAccueil?.id;
      } else {
        const res = await shopifyFetch<{ pages: ShopifyPage[] }>(
          shop,
          token,
          `/pages.json?handle=${encodeURIComponent(handle)}&fields=id,handle`
        );
        idConnu = res.pages.find((p) => p.handle === handle)?.id;
      }
      const contenu = { title: titreDe(cle), body_html: pages[cle] };
      const page = idConnu
        ? await updatePage(shop, token, idConnu, contenu)
        : await createPage(shop, token, { handle, ...contenu });
      publiees.set(cle, page);
      if (cle === CLE_ACCUEIL) {
        if (SLUG.test(page.handle)) handleAccueil = page.handle;
        if (page.id !== site.shopify_page_id) await enregistrerPageAccueil(page.id);
      }
    } catch (err) {
      resultats.set(cle, { page: cle, handle, ok: false, erreur: messageErreur(err) });
    }
  }

  // Passe 2 : liens internes réécrits vers les pages réellement publiées (handle renvoyé par
  // Shopify, qui peut différer du handle demandé). Chemin relatif /pages/<handle> : valable
  // sur le domaine myshopify comme sur le domaine personnalisé de la boutique.
  const cibles = new Map([...publiees].map(([cle, page]) => [fichierPage(cle), `/pages/${page.handle}`]));
  const reecrire = (html: string) =>
    html.replace(
      /\bhref=(["'])([a-z0-9-]+\.html)(#[^"']*)?\1/gi,
      (tout, guillemet: string, fichier: string, ancre: string | undefined) => {
        const url = cibles.get(fichier);
        return url ? `href=${guillemet}${url}${ancre ?? ""}${guillemet}` : tout;
      }
    );
  for (const [cle, page] of publiees) {
    try {
      const final = await updatePage(shop, token, page.id, { title: titreDe(cle), body_html: reecrire(pages[cle]) });
      resultats.set(cle, {
        page: cle,
        handle: final.handle,
        ok: true,
        url: `https://${shop}/pages/${final.handle}`,
        admin_url: `https://${shop}/admin/pages/${final.id}`,
      });
    } catch (err) {
      resultats.set(cle, {
        page: cle,
        handle: page.handle,
        ok: false,
        url: `https://${shop}/pages/${page.handle}`,
        admin_url: `https://${shop}/admin/pages/${page.id}`,
        erreur: `Page publiée, mais ses liens internes n'ont pas pu être mis à jour : ${messageErreur(err)}`,
      });
    }
  }

  const detail = [CLE_ACCUEIL, ...cles.filter((c) => c !== CLE_ACCUEIL)].map((cle) => resultats.get(cle)!);
  const accueil = resultats.get(CLE_ACCUEIL);
  const echecs = detail.filter((r) => !r.ok);
  return NextResponse.json(
    {
      mode: "html",
      url: accueil?.url,
      admin_url: accueil?.admin_url,
      pages: detail,
      ...(echecs.length > 0 && {
        error: `Publication incomplète : ${echecs.map((r) => `« ${r.page} »`).join(", ")} en échec.`, code: "shopify_publish_partial",
      }),
    },
    { status: detail.every((r) => !r.ok) ? 502 : 200 }
  );
}

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
  const { supabase, user, plan } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour publier ce site sur Shopify.", code: "auth_required" }, { status: 401 });
  }

  // Restriction plan free — voir diagnostic "restriction export Site Builder" : la publication
  // Shopify est un export réel (page/section vivante sur la boutique du marchand), réservée aux
  // plans Pro/Agency. Vérifié ici même si l'UI masque déjà l'action, pour ne jamais dépendre
  // uniquement du frontend (appel direct à l'API sinon possible).
  if (plan === "free") {
    return NextResponse.json(
      { error: "La publication sur Shopify est réservée aux plans Pro et Agency. Passe au plan Pro pour publier ce site.", code: "shopify_push_plan" },
      { status: 403 }
    );
  }

  if (!isShopifyConfigured()) {
    return NextResponse.json(
      { error: "L'intégration Shopify n'est pas encore configurée côté serveur.", code: "shopify_not_configured" },
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

  const colonnes = "id, nom_produit, html_content, shopify_page_id, shopify_theme_id, shopify_section_key";
  const lireSite = (select: string) =>
    supabase.from("sites_generes").select(select).eq("id", id).eq("user_id", user.id).maybeSingle();
  // pages (040_sites_generes_pages.sql) : si la colonne n'existe pas encore (42703), on relit
  // sans elle et le site est publié comme un site d'une seule page.
  let { data: siteBrut, error: siteError } = await lireSite(`${colonnes}, pages`);
  if (siteError?.code === UNDEFINED_COLUMN) {
    ({ data: siteBrut, error: siteError } = await lireSite(colonnes));
  }
  if (siteError) return NextResponse.json({ error: siteError.message, code: "server_error" }, { status: 500 });
  if (!siteBrut) return NextResponse.json({ error: "Site introuvable.", code: "site_not_found" }, { status: 404 });
  const site = siteBrut as unknown as {
    id: string;
    nom_produit: string;
    html_content: string;
    shopify_page_id: number | null;
    shopify_theme_id: number | null;
    shopify_section_key: string | null;
    pages?: unknown;
  };
  const pagesSite = pagesSiMultiples(site.pages);

  if (pagesSite && mode === "liquid") {
    return NextResponse.json(
      { error: "La publication Liquid multi-pages n'est pas encore disponible : utilise le mode HTML.", code: "shopify_liquid_multipage" },
      { status: 409 }
    );
  }

  const connection = await getShopifyConnection(user.id);
  if (!connection) {
    return NextResponse.json(
      { error: "Connecte d'abord ta boutique Shopify dans les paramètres avant de publier ce site.", code: "shopify_not_connected" },
      { status: 400 }
    );
  }

  const shop = connection.shop_domain;
  const token = connection.access_token;

  if (pagesSite) {
    const scopes = (connection.scope ?? "").split(",").map((s) => s.trim());
    if (!scopes.includes("write_content") && !scopes.includes("write_online_store_pages")) {
      return NextResponse.json(
        { error: "Reconnecte la boutique Shopify pour autoriser la publication de pages.", code: "shopify_reconnect_pages" },
        { status: 403 }
      );
    }
    try {
      return await publierMultiPages({
        shop,
        token,
        site,
        pages: pagesSite,
        enregistrerPageAccueil: async (pageId) => {
          await supabase.from("sites_generes").update({ shopify_page_id: pageId }).eq("id", id);
        },
      });
    } catch (err) {
      if (err instanceof ShopifyApiError) {
        return NextResponse.json({ error: err.message, code: `shopify_${err.code}` }, { status: shopifyErrorToHttpStatus(err) });
      }
      console.error("[sites-generes/shopify-push] multi-pages, erreur inattendue :", err);
      return NextResponse.json({ error: "Erreur inattendue lors de la publication sur Shopify.", code: "shopify_publish_failed" }, { status: 500 });
    }
  }

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
      // Message traduit côté client (siteBuilder.builder.shopify.<messageCode>) ; sectionType
      // sert à l'étape manuelle quand le thème n'a pas pu recevoir la section automatiquement.
      messageCode: autoAttached ? "liquidAttache" : "liquidManuel",
      sectionType,
    });
  } catch (err) {
    if (err instanceof ShopifyApiError) {
      return NextResponse.json({ error: err.message, code: `shopify_${err.code}` }, { status: shopifyErrorToHttpStatus(err) });
    }
    console.error("[sites-generes/shopify-push] erreur inattendue :", err);
    return NextResponse.json({ error: "Erreur inattendue lors de la publication sur Shopify.", code: "shopify_publish_failed" }, { status: 500 });
  }
}
