"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BoutiqueCartItem, getCartItems, updateCartItems } from "@/app/components/boutique/cart-utils";
import { resolveBoutiqueSlugFromHost } from "@/lib/boutique-subdomains";

type BoutiqueHeaderCartProps = {
  /** Lien vers le panneau panier complet (section #panier de l'accueil boutique). */
  fullCartHref: string;
};

function boutiqueProductHref(boutiqueSlug: string, produitId: string): string {
  if (typeof window !== "undefined") {
    const currentSlug = resolveBoutiqueSlugFromHost(window.location.host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
    if (currentSlug === boutiqueSlug) return `/produits/${produitId}`;
  }
  return `/boutiques/${boutiqueSlug}/produits/${produitId}`;
}

// Mini-panier en tiroir affiché depuis le header (icône présente sur toutes les pages
// boutique). Réutilise cart-utils (même clé localStorage, même event cart:update) que le
// panneau complet BoutiqueCart affiché sur l'accueil — les deux restent synchronisés.
export default function BoutiqueHeaderCart({ fullCartHref }: BoutiqueHeaderCartProps) {
  const [cart, setCart] = useState<BoutiqueCartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // setState différé (microtask) plutôt qu'appelé en synchrone dans le corps de l'effet,
    // pour éviter le re-render en cascade immédiat (react-hooks/set-state-in-effect) — même
    // pattern que app/boutiques/[slug]/panier/page.tsx et ParametresModal.tsx.
    queueMicrotask(() => setCart(getCartItems()));

    const handleUpdate = () => setCart(getCartItems());
    window.addEventListener("cart:update", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("cart:update", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const itemCount = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const totalPrice = useMemo(() => cart.reduce((sum, item) => sum + item.prix * item.quantity, 0), [cart]);

  // { ok: false } (stockage indisponible, navigation privée stricte...) ne doit jamais se
  // traduire par un faux succès silencieux — même traitement que AddToCartButton.tsx.
  function applyCartWrite(nextItems: BoutiqueCartItem[]) {
    const result = updateCartItems(nextItems);
    if (result.ok) {
      setCart(nextItems);
      setError(null);
    } else {
      setError("Impossible de mettre à jour le panier sur cet appareil (stockage indisponible ou navigation privée).");
      window.setTimeout(() => setError(null), 3000);
    }
  }

  function removeItem(item: BoutiqueCartItem) {
    const nextItems = cart.filter(
      (entry) => !(entry.produitId === item.produitId && entry.boutiqueSlug === item.boutiqueSlug)
    );
    applyCartWrite(nextItems);
  }

  function changeQuantity(item: BoutiqueCartItem, delta: number) {
    // Décrémenter depuis 1 retire l'article plutôt que de rester bloqué sans effet ni
    // feedback — cohérent avec le bouton "×" et le comportement attendu d'un panier.
    if (delta < 0 && item.quantity <= 1) {
      removeItem(item);
      return;
    }
    const nextQuantity = item.quantity + delta;
    const nextItems = cart
      .map((entry) =>
        entry.produitId === item.produitId && entry.boutiqueSlug === item.boutiqueSlug
          ? { ...entry, quantity: Math.max(1, nextQuantity) }
          : entry
      )
      .filter((entry) => entry.quantity > 0);
    applyCartWrite(nextItems);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={`Panier${itemCount > 0 ? ` — ${itemCount} article(s)` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] transition hover:border-violet-400/60 hover:bg-violet-500/10"
      >
        🛒
        {itemCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-violet-500 px-1 text-[11px] font-semibold text-white">
            {itemCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">Mon panier</h2>
            {itemCount > 0 ? <span className="text-xs text-[var(--text-muted)]">{itemCount} article(s)</span> : null}
          </div>

          {error ? (
            <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>
          ) : null}

          {cart.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs text-[var(--text-muted)]">
              Votre panier est vide. Ajoutez un produit depuis une fiche produit.
            </div>
          ) : (
            <>
              <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div key={`${item.boutiqueSlug}-${item.produitId}`} className="flex items-start gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-3)]">
                      {item.imageUrl ? (
                        <Image src={item.imageUrl} alt={item.nom} width={48} height={48} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-faint)]">🖼️</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={boutiqueProductHref(item.boutiqueSlug, item.produitId)}
                        onClick={() => setOpen(false)}
                        className="block truncate text-xs font-medium text-[var(--text-primary)] hover:text-violet-300"
                      >
                        {item.nom}
                      </Link>
                      <div className="mt-1 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => changeQuantity(item, -1)}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-primary)] hover:bg-violet-500/10"
                        >
                          −
                        </button>
                        <span className="text-xs text-[var(--text-muted)]">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changeQuantity(item, 1)}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-primary)] hover:bg-violet-500/10"
                        >
                          +
                        </button>
                        <span className="ml-auto text-xs font-semibold text-[var(--text-primary)]">
                          {(item.prix * item.quantity).toFixed(2)}€
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                      aria-label={`Retirer ${item.nom}`}
                      className="text-[var(--text-faint)] hover:text-[var(--danger)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
                <span className="text-[var(--text-muted)]">Total</span>
                <strong className="price-tag text-[var(--text-primary)]">{totalPrice.toFixed(2)}€</strong>
              </div>

              <Link
                href={fullCartHref}
                onClick={() => setOpen(false)}
                className="mt-3 block rounded-2xl bg-violet-500 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-violet-400"
              >
                Voir mon panier
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
