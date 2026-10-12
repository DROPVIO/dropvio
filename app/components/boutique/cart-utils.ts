"use client";

import { useCallback, useMemo, useState, useSyncExternalStore } from "react";

export type BoutiqueCartItem = {
  boutiqueSlug: string;
  produitId: string;
  slug: string;
  nom: string;
  imageUrl: string | null;
  prix: number;
  quantity: number;
};

// Un seul emplacement localStorage pour tous les paniers, chaque article portant le slug de
// sa boutique : chaque boutique n'affiche, ne compte et ne modifie que ses propres articles
// (un visiteur peut avoir un panier ouvert dans plusieurs boutiques).
const CART_STORAGE_KEY = "dropvio_boutique_cart";
const CART_EVENT = "cart:update";
export const QUANTITE_MAX = 99;

function lireTout(): BoutiqueCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BoutiqueCartItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// false = l'écriture localStorage a réellement échoué (quota, navigation privée stricte) :
// l'appelant ne doit jamais afficher un succès dans ce cas.
function ecrireTout(items: BoutiqueCartItem[]): boolean {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(CART_EVENT));
    return true;
  } catch {
    return false;
  }
}

const memeArticle = (a: { boutiqueSlug: string; produitId: string }, boutiqueSlug: string, produitId: string) =>
  a.boutiqueSlug === boutiqueSlug && a.produitId === produitId;

export function addCartItem(item: Omit<BoutiqueCartItem, "quantity">): boolean {
  const current = lireTout();
  const existing = current.find((e) => memeArticle(e, item.boutiqueSlug, item.produitId));
  const nextItems = existing
    ? current.map((e) =>
        memeArticle(e, item.boutiqueSlug, item.produitId) ? { ...e, quantity: Math.min(QUANTITE_MAX, e.quantity + 1) } : e
      )
    : [...current, { ...item, quantity: 1 }];
  return ecrireTout(nextItems);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CART_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CART_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function lireBrut(): string | null {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Panier d'une boutique : articles, nombre d'articles, total, et opérations limitées à cette
// boutique. Synchronisé entre les composants (événement cart:update) et entre les onglets
// (événement storage). Vide au rendu serveur.
export function useBoutiqueCart(boutiqueSlug: string) {
  const brut = useSyncExternalStore(subscribe, lireBrut, () => null);
  const [erreurEcriture, setErreurEcriture] = useState(false);

  const items = useMemo(() => {
    if (!brut) return [];
    try {
      const parsed = JSON.parse(brut) as BoutiqueCartItem[];
      return Array.isArray(parsed) ? parsed.filter((i) => i.boutiqueSlug === boutiqueSlug) : [];
    } catch {
      return [];
    }
  }, [brut, boutiqueSlug]);

  const count = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const total = useMemo(() => items.reduce((sum, i) => sum + i.prix * i.quantity, 0), [items]);

  const appliquer = useCallback((nextItems: BoutiqueCartItem[]) => {
    const ok = ecrireTout(nextItems);
    setErreurEcriture(!ok);
    if (!ok) window.setTimeout(() => setErreurEcriture(false), 3000);
  }, []);

  const retirer = useCallback(
    (produitId: string) => appliquer(lireTout().filter((e) => !memeArticle(e, boutiqueSlug, produitId))),
    [appliquer, boutiqueSlug]
  );

  // Décrémenter depuis 1 retire l'article.
  const changerQuantite = useCallback(
    (produitId: string, delta: number) => {
      const tous = lireTout();
      const article = tous.find((e) => memeArticle(e, boutiqueSlug, produitId));
      if (!article) return;
      const quantite = article.quantity + delta;
      appliquer(
        quantite < 1
          ? tous.filter((e) => !memeArticle(e, boutiqueSlug, produitId))
          : tous.map((e) => (memeArticle(e, boutiqueSlug, produitId) ? { ...e, quantity: Math.min(QUANTITE_MAX, quantite) } : e))
      );
    },
    [appliquer, boutiqueSlug]
  );

  return { items, count, total, retirer, changerQuantite, erreurEcriture };
}
