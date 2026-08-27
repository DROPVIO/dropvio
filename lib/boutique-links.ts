import { headers } from "next/headers";
import { resolveBoutiqueSlugFromHost } from "./boutique-subdomains";

// Chemin de base pour les liens internes rendus par une page boutique : vide si la
// requête arrive déjà sur le sous-domaine de cette boutique (le middleware a réécrit
// en interne vers /boutiques/{slug}, donc les liens doivent rester relatifs à la
// racine du sous-domaine côté navigateur, sous peine de doubler le préfixe), sinon
// /boutiques/{slug} comme aujourd'hui.
//
// Server-only (utilise next/headers) : pour un équivalent utilisable côté client,
// voir resolveBoutiqueSlugFromHost + window.location.host dans lib/boutique-subdomains.ts.
export async function getBoutiqueBasePath(slug: string): Promise<string> {
  const host = (await headers()).get("host");
  const resolvedSlug = resolveBoutiqueSlugFromHost(host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
  return resolvedSlug === slug ? "" : `/boutiques/${slug}`;
}
