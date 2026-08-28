// Transmission des données "mode boutique" (plusieurs produits) de la page de gestion
// boutique (app/site-builder/boutique/[id]/page.tsx) vers le Site Builder
// (app/site-builder/page.tsx + TemplateEditor.tsx) — navigation interne, même origine,
// même onglet. Les query params (utilisés pour le mode "produit unique", inchangé) ne
// passent pas à l'échelle pour une liste de produits ; sessionStorage évite d'introduire
// une table/endpoint dédié pour un simple hand-off ponctuel entre deux pages de la même app.

// Une landing page avec des dizaines de cartes produits perd son intérêt (page énorme,
// redondante avec la vraie page boutique publique déjà existante à /boutiques/[slug]) —
// plafond volontaire, avec mention explicite du total réel si la boutique en contient plus.
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
  // Total réel de produits dans la boutique, peut être > produits.length si le plafond a
  // été atteint (produits.length est alors toujours BOUTIQUE_PRODUITS_CAP).
  totalProduitsBoutique: number;
};

const STORAGE_KEY = "dropvio-site-builder-boutique-draft";

export function writeBoutiqueDraft(draft: BoutiqueDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // sessionStorage indisponible (navigation privée stricte, quota...) — le Site Builder
    // retombera simplement sur le mode produit unique par défaut, jamais d'erreur bloquante.
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
