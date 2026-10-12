"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("boutique.panier");
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function handleAddToCart() {
    const ok = addCartItem({ boutiqueSlug, produitId, nom, slug, imageUrl, prix: Number(prix) });
    setMessage(ok ? { text: t("ajoute"), ok: true } : { text: t("erreurStockage"), ok: false });
    window.setTimeout(() => setMessage(null), 2500);
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={handleAddToCart}
        className="w-full rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
      >
        {t("ajouter")}
      </button>
      {message ? (
        <p role="status" className={`text-sm ${message.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
