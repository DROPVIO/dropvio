export type SnapshotPoint = { volume_commandes: number; date: string };

// Score de croissance en % entre le premier et le dernier snapshot quotidien disponible
// pour un produit. Même formule que celle utilisée côté client dans
// app/produits-gagnants/page.tsx (bloc "score de croissance") — dupliquée ici plutôt que
// partagée telle quelle pour ne pas toucher au code client déjà en prod à l'occasion
// d'une fonctionnalité annexe (suggestions de produits complémentaires).
export function calculerCroissance(points: SnapshotPoint[]): number | null {
  if (points.length < 2) return null;
  const tries = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const premier = tries[0].volume_commandes;
  const dernier = tries[tries.length - 1].volume_commandes;
  if (!premier) return null;
  return ((dernier - premier) / premier) * 100;
}
