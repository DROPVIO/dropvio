"use client";

import { useState } from "react";
import { addCartItem } from "@/app/components/boutique/cart-utils";

type AddToCartButtonProps = {
  boutiqueSlug: string;
  produitId: string;
  slug: string;
  nom: string;
  prix: number;
  imageUrl: string | null;
};

export default function AddToCartButton({ boutiqueSlug, produitId, slug, nom, prix, imageUrl }: AddToCartButtonProps) {
  const [message, setMessage] = useState<string | null>(null);

  function handleAddToCart() {
    addCartItem({ boutiqueSlug, produitId, nom, slug, imageUrl, prix });
    setMessage("Produit ajouté au panier.");
    window.setTimeout(() => setMessage(null), 2500);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleAddToCart}
        className="w-full rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
      >
        Ajouter au panier
      </button>
      {message ? <p className="text-sm text-[var(--success)]">{message}</p> : null}
    </div>
  );
}
