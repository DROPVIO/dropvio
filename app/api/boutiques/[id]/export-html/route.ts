import { NextRequest, NextResponse } from "next/server";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/get-base-url";
import { fetchBoutiqueApi } from "@/lib/boutique-internal-fetch";

// Capture le vrai rendu de /boutiques/[slug] (même fetch avec transfert de cookie que
// l'aperçu propriétaire — nécessaire puisque la boutique est presque toujours privée,
// est_publique par défaut à false) plutôt que de reconstruire les sections à la main :
// mêmes données réelles, même palette, même ordre que la page déjà vérifiée ce soir, sans
// dupliquer le moindre JSX. Deux post-traitements sont nécessaires pour que le fichier
// téléchargé reste fidèle une fois sorti du contexte de l'app :
// - Le CSS n'est jamais inline dans le HTML de Next.js (juste un <link> vers un fichier
//   hashé, /_next/static/chunks/...) — sans ça, le fichier téléchargé s'ouvrirait sans
//   aucun style. On va chercher son contenu et on l'intègre directement en <style>.
// - Les <script> d'hydratation React (panier, dropdown, recherche) référencent eux aussi
//   des fichiers hashés qui ne survivraient pas au téléchargement, et un fichier HTML
//   statique n'a de toute façon pas de vrai panier à activer derrière — retirés
//   entièrement. Le résultat est un instantané visuel figé, pas un mini-site interactif.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour exporter cette boutique.", code: "auth_required" }, { status: 401 });
  }

  // Restriction plan free — cet endpoint renvoie le HTML complet (CSS inliné) prêt à être
  // exporté, exactement ce que la restriction Site Builder réserve à Pro/Agency ailleurs.
  if (plan === "free") {
    return NextResponse.json(
      { error: "L'export HTML de la boutique est réservé aux plans Pro et Agency.", code: "export_plan" },
      { status: 403 }
    );
  }

  const { data: boutique, error } = await supabase
    .from("boutiques")
    .select("id, nom, slug")
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable.", code: "boutique_not_found" }, { status: 404 });
  }

  const baseUrl = await getBaseUrl();
  const pageRes = await fetchBoutiqueApi(`${baseUrl}/boutiques/${boutique.slug}`);
  if (!pageRes.ok) {
    return NextResponse.json({ error: "Impossible de récupérer le rendu de la boutique.", code: "export_render_failed" }, { status: 502 });
  }
  let html = await pageRes.text();

  // Récupère le contenu de chaque feuille de style référencée et l'intègre en <style>.
  const stylesheetHrefs = [...html.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map((m) => m[1]);
  const cssContents = await Promise.all(
    stylesheetHrefs.map(async (href) => {
      const cssUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
      const res = await fetch(cssUrl, { cache: "no-store" });
      if (!res.ok) return "";
      const css = await res.text();
      // Les polices sont référencées en chemin relatif au fichier CSS lui-même
      // (../media/xxx.woff2, résolu depuis /_next/static/chunks/) — une fois ce CSS
      // sorti de son fichier d'origine et inliné tel quel, ce chemin ne pointe plus
      // nulle part. Réécrit en absolu vers le serveur d'où le CSS a été récupéré.
      const cssDir = cssUrl.replace(/\/[^/]*$/, "");
      return css.replace(/url\((['"]?)\.\.\/media\//g, `url($1${cssDir}/../media/`);
    })
  );

  html = html.replace(/<link rel="stylesheet"[^>]*>/g, "");
  html = html.replace(/<script[\s\S]*?<\/script>/g, "");
  const inlineStyle = `<style>${cssContents.join("\n")}</style>`;
  html = html.includes("</head>") ? html.replace("</head>", `${inlineStyle}</head>`) : `${inlineStyle}${html}`;

  return NextResponse.json({ html, nom: boutique.nom });
}
