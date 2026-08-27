"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BoutiqueCartItem, getCartItems, updateCartItems } from "@/app/components/boutique/cart-utils";
import { resolveBoutiqueSlugFromHost } from "@/lib/boutique-subdomains";

type BoutiqueCartProps = {
  title?: string;
};

// Le panier peut être affiché depuis /boutiques/{slug} ou depuis le sous-domaine
// {slug}.ROOT_DOMAIN (rewrite middleware) — le lien produit doit rester relatif au
// host courant du navigateur pour ne pas doubler le préfixe /boutiques/{slug}.
function boutiqueProductHref(boutiqueSlug: string, produitId: string): string {
  if (typeof window !== "undefined") {
    const currentSlug = resolveBoutiqueSlugFromHost(window.location.host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
    if (currentSlug === boutiqueSlug) return `/produits/${produitId}`;
  }
  return `/boutiques/${boutiqueSlug}/produits/${produitId}`;
}

export default function BoutiqueCart({ title = "Mon panier" }: BoutiqueCartProps) {
  const [cart, setCart] = useState<BoutiqueCartItem[]>(() => getCartItems());

  useEffect(() => {
    const handleUpdate = () => {
      setCart(getCartItems());
    };

    window.addEventListener("cart:update", handleUpdate);
    window.addEventListener("storage", handleUpdate);

    return () => {
      window.removeEventListener("cart:update", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  const totalPrice = useMemo(
    () => cart.reduce((sum, item) => sum + item.prix * item.quantity, 0),
    [cart]
  );

  function changeQuantity(item: BoutiqueCartItem, delta: number) {
    const nextQuantity = item.quantity + delta;
    const nextItems = cart
      .map((entry) =>
        entry.produitId === item.produitId && entry.boutiqueSlug === item.boutiqueSlug
          ? { ...entry, quantity: Math.max(1, nextQuantity) }
          : entry
      )
      .filter((entry) => entry.quantity > 0);
    updateCartItems(nextItems);
    setCart(nextItems);
  }

  function removeItem(item: BoutiqueCartItem) {
    const nextItems = cart.filter(
      (entry) => !(entry.produitId === item.produitId && entry.boutiqueSlug === item.boutiqueSlug)
    );
    updateCartItems(nextItems);
    setCart(nextItems);
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-[#13131f] p-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      {cart.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-zinc-400">
          Votre panier est vide. Ajoutez un produit depuis une fiche produit.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {cart.map((item) => (
            <div key={`${item.boutiqueSlug}-${item.produitId}`} className="rounded-3xl border border-white/10 bg-[#0f1320] p-4">
              <div className="flex items-start gap-4">
                <div className="h-16 w-16 overflow-hidden rounded-3xl bg-white/5">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.nom} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xl text-zinc-600">🖼️</div>
                  )}
                </div>
                <div className="flex-1">
                  <Link href={boutiqueProductHref(item.boutiqueSlug, item.produitId)} className="text-sm font-semibold text-white hover:text-violet-300">
                    {item.nom}
                  </Link>
                  <p className="mt-2 text-sm text-zinc-400">{item.quantity} × {item.prix.toFixed(2)}€</p>
                  <p className="mt-2 text-sm text-white/80">Sous-total : {(item.prix * item.quantity).toFixed(2)}€</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => changeQuantity(item, -1)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-violet-500/10"
                >
                  −
                </button>
                <span className="text-sm text-white">Quantité : {item.quantity}</span>
                <button
                  type="button"
                  onClick={() => changeQuantity(item, 1)}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-white transition hover:bg-violet-500/10"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  className="ml-auto rounded-2xl border border-white/10 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/20"
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
          <div className="rounded-3xl border border-white/10 bg-[#0d0d14] p-4">
            <div className="flex items-center justify-between text-sm text-zinc-400">
              <span>Total</span>
              <strong className="text-white">{totalPrice.toFixed(2)}€</strong>
            </div>
            <button disabled className="mt-4 w-full rounded-2xl bg-zinc-600/50 px-4 py-3 text-sm font-semibold text-white opacity-80">
              Payer — bientôt disponible
            </button>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Le paiement n&apos;est pas encore activé. Ceci reste un panier local pour tester l&apos;expérience.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
