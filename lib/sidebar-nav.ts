// Sous-menus de la barre latérale (components/Sidebar.tsx) : logique sans React, testée par
// lib/sidebar-nav.test.ts.

export type SousEntree = {
  href: string;
  /** Clé de traduction sous dashboard.nav. */
  labelKey: string;
  /** Page pas encore créée : affichée « bientôt », jamais un lien. */
  soon?: boolean;
};

export type GroupeNav = { id: string; enfants: readonly SousEntree[] };

export const GROUPES_NAV = {
  "produits-gagnants": [
    { href: "/produits-gagnants", labelKey: "itemTousProduits" },
    { href: "/produits-gagnants/catalogue", labelKey: "itemCatalogue" },
  ],
  "site-builder": [
    // [LIBELLE_PAGE_SITE_BUILDER À VALIDER] : « Créer un site ».
    { href: "/site-builder", labelKey: "itemCreerSite" },
    { href: "/mes-sites", labelKey: "itemMesSites" },
  ],
} as const satisfies Record<string, readonly SousEntree[]>;

export type GroupeId = keyof typeof GROUPES_NAV;

function couvre(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Sous-entrée active : la plus précise qui couvre la route (/produits-gagnants/catalogue active
 *  « Catalogue », pas « Tous les produits »). Une entrée « bientôt » n'est jamais active. */
export function sousEntreeActive(pathname: string, enfants: readonly SousEntree[]): SousEntree | null {
  return (
    enfants
      .filter((e) => !e.soon && couvre(pathname, e.href))
      .sort((a, b) => b.href.length - a.href.length)[0] ?? null
  );
}

/** Groupe qui contient la route active, ou null. */
export function groupeDeLaRoute(pathname: string): GroupeId | null {
  for (const id of Object.keys(GROUPES_NAV) as GroupeId[]) {
    if (sousEntreeActive(pathname, GROUPES_NAV[id])) return id;
  }
  return null;
}

/** Sous-menu ouvert au chargement : celui de la route active. */
export function ouvertAuChargement(pathname: string): GroupeId | null {
  return groupeDeLaRoute(pathname);
}

/** Clic sur une entrée à sous-menu : la referme si elle était ouverte, sinon l'ouvre et ferme
 *  l'autre (un seul sous-menu ouvert à la fois). */
export function basculerGroupe(ouvert: GroupeId | null, id: GroupeId): GroupeId | null {
  return ouvert === id ? null : id;
}
