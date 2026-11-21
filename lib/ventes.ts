// Page « Mes ventes » (/ventes) : règles partagées par la route app/api/ventes et l'interface,
// testées par lib/ventes.test.ts. Aucun paiement ni commande fournisseur : le marchand commande
// lui-même sur AliExpress et change le statut à la main.

export const VENTES_PAR_PAGE = 50;

// Statuts tels qu'en base (contrainte de commandes_a_preparer, migration 030).
export const STATUTS_VENTE = ["a_traiter", "commandee", "ignoree"] as const;
export type StatutVente = (typeof STATUTS_VENTE)[number];

/** Filtre lu dans l'URL : un statut connu, sinon aucun filtre (toutes les ventes). */
export function lireFiltreStatut(valeur: string | null | undefined): StatutVente | null {
  return STATUTS_VENTE.includes(valeur as StatutVente) ? (valeur as StatutVente) : null;
}

/** Page demandée (≥ 1) et bornes de la requête : 50 ventes par page. */
export function plagePage(valeur: string | number | null | undefined): { page: number; from: number; to: number } {
  const n = typeof valeur === "number" ? valeur : parseInt(valeur ?? "", 10);
  const page = Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1;
  const from = (page - 1) * VENTES_PAR_PAGE;
  return { page, from, to: from + VENTES_PAR_PAGE - 1 };
}

export function nombrePages(total: number): number {
  return Math.max(1, Math.ceil(total / VENTES_PAR_PAGE));
}

// Changements de statut faits par le marchand : « Marquer commandée » et « Ignorer ».
export type ActionStatut = "commandee" | "ignoree";

export function changementAutorise(actuel: StatutVente, cible: unknown): cible is ActionStatut {
  return (cible === "commandee" || cible === "ignoree") && cible !== actuel;
}

type Adresse = { first_name?: string | null; city?: string | null; name?: string | null } | null | undefined;

/** Client affiché : prénom et ville seulement. Jamais le nom, l'adresse ni le téléphone. */
export function clientMasque(adresse: Adresse, clientNom: string | null | undefined): { prenom: string | null; ville: string | null } {
  const prenom = adresse?.first_name?.trim() || (adresse?.name ?? clientNom ?? "").trim().split(/\s+/)[0] || null;
  return { prenom, ville: adresse?.city?.trim() || null };
}

type Ligne = { nom?: string | null; quantite?: number | null; lien_aliexpress?: string | null };

/** Lien fournisseur ouvrable : https sur un domaine AliExpress, sinon null. */
export function lienFournisseur(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === "https:" && /(^|\.)aliexpress\.(com|us|ru)$/.test(hostname) ? url : null;
  } catch {
    return null;
  }
}

/** Résumé des lignes d'une commande : premier produit, autres produits, quantité totale, et
 *  lien fournisseur du premier produit qui en a un. */
export function resumeLignes(lignes: unknown): { produit: string | null; autres: number; quantite: number; lien: string | null } {
  const liste = (Array.isArray(lignes) ? lignes : []) as Ligne[];
  return {
    produit: liste[0]?.nom?.trim() || null,
    autres: Math.max(0, liste.length - 1),
    quantite: liste.reduce((s, l) => s + (Number.isFinite(l.quantite) ? Number(l.quantite) : 0), 0),
    lien: liste.map((l) => lienFournisseur(l.lien_aliexpress)).find(Boolean) ?? null,
  };
}

export type VenteAffichee = {
  id: string;
  date: string;
  numero: string;
  produit: string | null;
  autres: number;
  quantite: number;
  client: { prenom: string | null; ville: string | null };
  statut: StatutVente;
  statutChangeLe: string | null;
  lienFournisseur: string | null;
};

/** Ligne de base → vente affichée. Seuls ces champs quittent le serveur. */
export function venteAffichee(row: {
  id: string;
  created_at: string;
  shopify_order_id: number | string;
  shopify_order_name: string | null;
  statut: StatutVente;
  statut_change_le?: string | null;
  lignes: unknown;
  adresse_livraison: Adresse;
  client_nom: string | null;
}): VenteAffichee {
  const resume = resumeLignes(row.lignes);
  return {
    id: row.id,
    date: row.created_at,
    numero: row.shopify_order_name ?? `#${row.shopify_order_id}`,
    produit: resume.produit,
    autres: resume.autres,
    quantite: resume.quantite,
    client: clientMasque(row.adresse_livraison, row.client_nom),
    statut: row.statut,
    statutChangeLe: row.statut_change_le ?? null,
    lienFournisseur: resume.lien,
  };
}
