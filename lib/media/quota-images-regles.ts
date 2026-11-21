// Règles du quota d'images, sans dépendance serveur (importables côté client, testées par
// lib/media/quota-images-regles.test.ts).
import type { Plan } from "@/lib/plan-limits";
import { generationDisponible } from "./config";

export type SourceQuotaImages = "expert" | "budget";

/** Expert : quota d'images du plan. Pro et Agency : budget images du mois. Sans plan payant : null. */
export function sourceQuotaImages(plan: Plan): SourceQuotaImages | null {
  if (!generationDisponible(plan)) return null;
  return plan === "expert" ? "expert" : "budget";
}

/** Nombre d'images entières que couvre le budget restant (jamais négatif). */
export function imagesPossiblesBudget(budgetEur: number, utiliseEur: number, prixImageEur: number): number {
  if (prixImageEur <= 0) return 0;
  // Tolérance d'arrondi : 0,3 / 0,1 vaut 2,9999… en flottant.
  return Math.max(0, Math.floor((budgetEur - utiliseEur) / prixImageEur + 1e-9));
}

export type PlanLot = {
  /** Images demandées : produits × images par produit. */
  images: number;
  coutEur: number;
  /** Le lot tient entièrement dans le quota restant (null : quota inconnu, on laisse le serveur trancher). */
  couvert: boolean;
  /** Images possibles avec le quota restant, et nombre de produits entiers correspondant. */
  imagesPossibles: number;
  produitsPossibles: number;
};

/** Coût estimé d'un lot (nombre d'images × coût par image) comparé aux images restantes. */
export function planifierLot(produits: number, imagesParProduit: number, imagesRestantes: number | null, prixImageEur: number): PlanLot {
  const parProduit = Math.max(1, Math.floor(imagesParProduit));
  const images = Math.max(0, Math.floor(produits)) * parProduit;
  const coutEur = Math.round(images * prixImageEur * 100) / 100;
  if (imagesRestantes === null) return { images, coutEur, couvert: true, imagesPossibles: images, produitsPossibles: produits };
  const imagesPossibles = Math.min(images, Math.max(0, imagesRestantes));
  return {
    images,
    coutEur,
    couvert: images <= imagesRestantes,
    imagesPossibles,
    produitsPossibles: Math.floor(imagesPossibles / parProduit),
  };
}
