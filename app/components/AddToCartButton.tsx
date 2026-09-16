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
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function handleAddToCart() {
    const result = addCartItem({ boutiqueSlug, produitId, nom, slug, imageUrl, prix });
    setMessage(
      result.ok
        ? { text: "Produit ajouté au panier.", ok: true }
        : { text: "Impossible d'ajouter au panier sur cet appareil (stockage indisponible ou navigation privée).", ok: false }
    );
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
      {message ? (
        <p className={`text-sm ${message.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{message.text}</p>
      ) : null}
    </div>
  );
}
