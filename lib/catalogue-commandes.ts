// Plancher de commandes du catalogue Produits gagnants : un produit n'est affiché que s'il a au
// moins COMMANDES_MIN_DEFAUT commandes, sur toutes les pages et pour tous les filtres. Appliqué
// par la route (app/api/aliexpress/products) et, en double, par les fonctions SQL de rotation
// (migration 049), pour qu'aucun appel direct ne le contourne.
export const COMMANDES_MIN_DEFAUT = 100;

/** Minimum effectif : absent ou illisible → 100 ; inférieur à 100 → 100 ; supérieur → respecté. */
export function commandesMinEffectif(valeur: string | number | null | undefined): number {
  const n = typeof valeur === "number" ? valeur : parseInt(valeur ?? "", 10);
  return Number.isFinite(n) ? Math.max(Math.trunc(n), COMMANDES_MIN_DEFAUT) : COMMANDES_MIN_DEFAUT;
}
