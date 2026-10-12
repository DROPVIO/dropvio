// Transmission des données "mode boutique" (plusieurs produits) de la page de gestion
// boutique (app/site-builder/boutique/[id]/page.tsx) vers le Site Builder
// (app/site-builder/page.tsx + TemplateEditor.tsx) — navigation interne, même origine,
// même onglet. Les query params (utilisés pour le mode "produit unique", inchangé) ne
// passent pas à l'échelle pour une liste de produits ; sessionStorage évite d'introduire
// une table/endpoint dédié pour un simple hand-off ponctuel entre deux pages de la même app.

// La limite d'ajout manuel de produits dans le builder suit le plan de l'utilisateur
// (BoutiqueDraft.limiteProduits, tiré de PLAN_LIMITS[plan].produitsBoutiqueMax par la page
// boutique) ; le serveur reste la référence pour le nombre de produits d'une boutique
// (POST /api/boutiques/[id]/produits). Aucun produit transmis n'est retiré.
// Plus utilisé par le builder — gardé exporté pour compatibilité, à supprimer après vérification.
export const BOUTIQUE_PRODUITS_CAP = 30;

import type { ProduitBoutique } from "./site-templates";

// Même forme que ProduitBoutique (lib/site-templates.ts, consommé par buildTemplateHtmlBoutique)
// — réexporté sous ce nom ici pour ne pas coupler ce module de hand-off à la présence du
// mot "template" dans son type, mais reste la même donnée d'un bout à l'autre du parcours.
export type ProduitBoutiqueDraft = ProduitBoutique;

export type BoutiqueDraft = {
  boutiqueId: string;
  nomBoutique: string;
  descriptionBoutique: string;
  produits: ProduitBoutiqueDraft[];
  // produits contient tous les produits transmis par la page boutique (aucune troncature) ;
  // totalProduitsBoutique est le total réel de la boutique au moment du transfert.
  totalProduitsBoutique: number;
  // Nombre maximum de produits dans le brouillon pour l'ajout manuel (plan de l'utilisateur).
  // null ou absent : pas de limite.
  limiteProduits?: number | null;
  // Catégories de la boutique (déjà chargées par la page boutique), pour les sections de
  // collection du site généré ; les produits y renvoient par categorieId. Absent : pas de
  // collections, une seule grille de catalogue.
  categories?: { id: string; nom: string; slug: string }[];
};

const STORAGE_KEY = "dropvio-site-builder-boutique-draft";

// Renvoie false si l'écriture échoue (sessionStorage indisponible : navigation privée
// stricte, quota dépassé...) — l'appelant doit alors prévenir l'utilisateur plutôt que
// d'ouvrir le Site Builder en mode boutique sans brouillon.
export function writeBoutiqueDraft(draft: BoutiqueDraft): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

// Lecture à usage unique : supprime immédiatement l'entrée pour qu'un rechargement de la
// page ou un retour arrière ne rejoue pas un brouillon périmé.
export function readAndClearBoutiqueDraft(): BoutiqueDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as BoutiqueDraft;
    if (!Array.isArray(parsed?.produits)) return null;
    return parsed;
  } catch {
    return null;
  }
}
