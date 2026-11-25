// Filtre « volume de commandes minimum » du catalogue Produits gagnants. Il n'y a plus de
// plancher : tous les produits du catalogue dédoublonné sont affichés, quel que soit leur nombre
// de commandes. Ce filtre n'est appliqué que si l'utilisateur le remplit.

/** Valeur du filtre : absente, illisible ou inférieure à 1 → null (aucun filtre) ; sinon
 *  l'entier saisi. */
export function commandesMinFiltre(valeur: string | number | null | undefined): number | null {
  const n = typeof valeur === "number" ? valeur : parseInt(valeur ?? "", 10);
  if (!Number.isFinite(n)) return null;
  const entier = Math.trunc(n);
  return entier >= 1 ? entier : null;
}
