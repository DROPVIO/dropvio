"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BoutiqueCartItem, getCartItems, updateCartItems } from "@/app/components/boutique/cart-utils";
import { resolveBoutiqueSlugFromHost } from "@/lib/boutique-subdomains";

// Panier/checkout transitoire (voir diagnostic "audit boutons" — la page d'accueil n'a plus
// de section panier depuis la refonte qui l'a retirée pour cause de doublon avec le tiroir
// du header, mais "Voir mon panier" n'avait plus aucune destination réelle). Volontairement
// minimal : pas de paiement réel branché derrière — c'est une décision produit à trancher
// séparément (Shopify natif vs Stripe Connect). "Passer commande" reste donc désactivé, avec
// un message honnête plutôt qu'un flux simulé.
export default function BoutiquePanierPage() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : "";

  const [basePath, setBasePath] = useState("");
  useEffect(() => {
    // setState différé (microtask) plutôt qu'appelé en synchrone dans le corps de l'effet,
    // pour éviter le re-render en cascade immédiat (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      const currentSlug = resolveBoutiqueSlugFromHost(window.location.host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
      setBasePath(currentSlug === slug ? "" : `/boutiques/${slug}`);
    });
  }, [slug]);

  const [cart, setCart] = useState<BoutiqueCartItem[]>([]);
  useEffect(() => {
    queueMicrotask(() => setCart(getCartItems()));
    const handleUpdate = () => setCart(getCartItems());
    window.addEventListener("cart:update", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("cart:update", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, []);

  function removeItem(item: BoutiqueCartItem) {
    const nextItems = cart.filter(
      (entry) => !(entry.produitId === item.produitId && entry.boutiqueSlug === item.boutiqueSlug)
    );
    updateCartItems(nextItems);
    setCart(nextItems);
  }

  function changeQuantity(item: BoutiqueCartItem, delta: number) {
    // Décrémenter depuis 1 retire l'article — même comportement que le tiroir du header.
    if (delta < 0 && item.quantity <= 1) {
      removeItem(item);
      return;
    }
    const nextItems = cart.map((entry) =>
      entry.produitId === item.produitId && entry.boutiqueSlug === item.boutiqueSlug
        ? { ...entry, quantity: Math.max(1, entry.quantity + delta) }
        : entry
    );
    updateCartItems(nextItems);
    setCart(nextItems);
  }

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.prix * item.quantity, 0), [cart]);

  function boutiqueProductHref(item: BoutiqueCartItem): string {
    return item.boutiqueSlug === slug ? `${basePath}/produits/${item.produitId}` : `/boutiques/${item.boutiqueSlug}/produits/${item.produitId}`;
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm uppercase tracking-[0.3em] text-violet-300">Panier</p>
        <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)]">Mon panier</h1>

        {cart.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
            <p className="text-sm text-[var(--text-muted)]">Ton panier est vide.</p>
            <Link
              href={`${basePath}/produits`}
              className="mt-4 inline-block rounded-2xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              Voir les produits →
            </Link>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
              {cart.map((item) => (
                <div key={`${item.boutiqueSlug}-${item.produitId}`} className="flex items-center gap-4 p-5">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--surface-3)]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.nom} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl">🛍️</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={boutiqueProductHref(item)} className="block truncate text-sm font-medium text-[var(--text-primary)] hover:text-violet-300">
                      {item.nom}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">{item.prix.toFixed(2)}€ / unité</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeQuantity(item, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-violet-500/10"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm text-[var(--text-muted)]">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(item, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-violet-500/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{(item.prix * item.quantity).toFixed(2)}€</span>
                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                      aria-label={`Retirer ${item.nom}`}
                      className="text-xs text-[var(--text-faint)] hover:text-[var(--danger)]"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between text-base">
                <span className="text-[var(--text-muted)]">Total</span>
                <strong className="price-tag text-lg text-[var(--text-primary)]">{total.toFixed(2)}€</strong>
              </div>

              <button
                type="button"
                disabled
                title="Le paiement en ligne arrive bientôt."
                className="mt-5 w-full rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white opacity-40 cursor-not-allowed"
              >
                Passer commande
              </button>
              <p className="mt-3 text-center text-[11px] text-[var(--text-faint)]">
                Le paiement en ligne arrive bientôt. Contacte le vendeur pour finaliser ta commande en attendant.
              </p>
            </div>

            <Link href={`${basePath}/produits`} className="text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              ← Continuer mes achats
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
