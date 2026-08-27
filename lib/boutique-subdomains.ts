// Sous-domaines réservés qui ne doivent jamais être interprétés comme un slug de
// boutique, même si une boutique existante porte ce slug (elle reste accessible via
// /boutiques/{slug}, juste pas via {slug}.ROOT_DOMAIN).
export const RESERVED_SUBDOMAINS = new Set(["www", "app", "api", "admin", "mail", "ftp"]);

// Résout le slug de boutique à partir du header Host, si la requête correspond à un
// sous-domaine de boutique ({slug}.ROOT_DOMAIN, ou {slug}.localhost en dev local).
// Retourne null si le routage par sous-domaine ne s'applique pas (ROOT_DOMAIN non
// configuré, host racine/www, sous-domaine réservé...) — /boutiques/{slug} reste
// alors le chemin d'accès normal. Utilisé à la fois par le middleware (rewrite) et
// par les pages boutique (génération de liens internes cohérents avec le host actuel).
export function resolveBoutiqueSlugFromHost(host: string | null, rootDomain: string | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0].toLowerCase();

  if (hostname.endsWith(".localhost")) {
    const subdomain = hostname.slice(0, -".localhost".length);
    return subdomain && !RESERVED_SUBDOMAINS.has(subdomain) ? subdomain : null;
  }

  if (!rootDomain) return null;
  const root = rootDomain.toLowerCase();
  if (hostname === root || hostname === `www.${root}`) return null;
  if (!hostname.endsWith(`.${root}`)) return null;

  const subdomain = hostname.slice(0, -(root.length + 1));
  return subdomain && !RESERVED_SUBDOMAINS.has(subdomain) ? subdomain : null;
}

// URL publique complète d'une boutique, pour l'affichage (annuaire, éditeur) — pas
// pour la navigation interne (voir getBoutiqueBasePath dans lib/boutique-links.ts).
// Sous-domaine si ROOT_DOMAIN est configuré, sinon chemin /boutiques/{slug}.
export function getBoutiquePublicUrl(slug: string): string {
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
  return rootDomain ? `https://${slug}.${rootDomain}` : `/boutiques/${slug}`;
}
