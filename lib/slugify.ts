export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Slug de boutique accepté : minuscules, chiffres et tirets simples, 2 à 60 caractères — la
// forme que produit slugify(). Il sert aussi de sous-domaine ({slug}.ROOT_DOMAIN, voir
// lib/boutique-subdomains.ts), d'où la longueur maximale bien sous la limite DNS de 63.
export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && slug.length <= 60 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
