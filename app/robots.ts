import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/get-base-url";

// Autorise l'indexation du site marketing et des boutiques publiques ; bloque l'outil
// (dashboard, produits gagnants, site builder...) qui n'a rien à faire dans un moteur de
// recherche — pages authentifiées, sans contenu utile pour un visiteur non connecté.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const baseUrl = await getBaseUrl();

  return {
    rules: [
      {
        userAgent: "*",
        // /formation (page de vente publique) reste indexable ; les leçons payantes
        // (/formation/lire/...) ne le sont pas (noindex aussi sur la page elle-même).
        allow: ["/", "/boutiques/", "/faq"],
        disallow: [
          "/api/",
          "/dashboard",
          "/produits-gagnants",
          "/site-builder",
          "/mes-sites",
          "/audit",
          "/tools/",
          "/formation/lire/",
          "/spy",
          "/login",
          "/register",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
