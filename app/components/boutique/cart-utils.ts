export type BoutiqueCartItem = {
  boutiqueSlug: string;
  produitId: string;
  slug: string;
  nom: string;
  imageUrl: string | null;
  prix: number;
  quantity: number;
};

const CART_STORAGE_KEY = "dropvio_boutique_cart";

export function getCartItems(): BoutiqueCartItem[] {
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

export function setCartItems(items: BoutiqueCartItem[]): BoutiqueCartItem[] {
  if (typeof window === "undefined") return items;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // ignore storage errors
  }
  return items;
}

export function updateCartItems(items: BoutiqueCartItem[]) {
  const nextItems = setCartItems(items);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cart:update"));
  }
  return nextItems;
}

export function addCartItem(item: Omit<BoutiqueCartItem, "quantity">) {
  const current = getCartItems();
  const existing = current.find(
    (entry) => entry.produitId === item.produitId && entry.boutiqueSlug === item.boutiqueSlug
  );
  let nextItems: BoutiqueCartItem[];
  if (existing) {
    nextItems = current.map((entry) =>
      entry.produitId === item.produitId && entry.boutiqueSlug === item.boutiqueSlug
        ? { ...entry, quantity: entry.quantity + 1 }
        : entry
    );
  } else {
    nextItems = [...current, { ...item, quantity: 1 }];
  }
  return updateCartItems(nextItems);
}
