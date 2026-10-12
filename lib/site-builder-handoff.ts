// Transmission des données "mode boutique" (plusieurs produits) de la page de gestion
// boutique (app/site-builder/boutique/[id]/page.tsx) vers le Site Builder
// (app/site-builder/page.tsx + TemplateEditor.tsx) — navigation interne, même origine,
// même onglet. Les query params (utilisés pour le mode "produit unique", inchangé) ne
// passent pas à l'échelle pour une liste de produits ; sessionStorage évite d'introduire
// une table/endpoint dédié pour un simple hand-off ponctuel entre deux pages de la même app.

// La limite d'ajout manuel de produits dans le builder suit le plan de l'utilisateur
// (BoutiqueDraft.limiteProduits, tiré de PLAN_LIMITS[plan].produitsBoutiqueMax par la page
// boutique) ; app/api/generate-site/route.ts applique la même limite côté serveur.

import { useCallback, useMemo, useSyncExternalStore } from "react";
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
const CHANGE_EVENT = "dropvio-boutique-draft-change";

// Renvoie false si l'écriture échoue (sessionStorage indisponible : navigation privée
// stricte, quota dépassé...) — l'appelant doit alors prévenir l'utilisateur plutôt que
// d'ouvrir le Site Builder en mode boutique sans brouillon.
export function writeBoutiqueDraft(draft: BoutiqueDraft): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function clearBoutiqueDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // sessionStorage indisponible : rien à effacer
  }
}

function parseBoutiqueDraft(raw: string | null): BoutiqueDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as BoutiqueDraft;
    return Array.isArray(parsed?.produits) ? parsed : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readRaw(): string | null {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

// Brouillon boutique du builder. sessionStorage reste la source de vérité : la lecture n'efface
// plus rien, donc un rechargement de l'onglet retrouve le brouillon et les modifications faites
// dans le builder (chaque modification est réécrite). Côté serveur, aucun brouillon.
// enabled = false (pas de multi=1 dans l'URL) : mode produit unique, le brouillon est ignoré.
// undefined = pas encore lu (rendu serveur et hydratation), null = aucun brouillon.
export function useBoutiqueDraft(
  enabled: boolean
): [BoutiqueDraft | null | undefined, (draft: BoutiqueDraft) => void] {
  const raw = useSyncExternalStore<string | null | undefined>(subscribe, readRaw, () => undefined);
  const draft = useMemo(() => {
    if (!enabled) return null;
    return raw === undefined ? undefined : parseBoutiqueDraft(raw);
  }, [enabled, raw]);
  const setDraft = useCallback((next: BoutiqueDraft) => {
    writeBoutiqueDraft(next);
  }, []);
  return [draft, setDraft];
}
