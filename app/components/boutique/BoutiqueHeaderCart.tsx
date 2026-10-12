"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useBoutiqueCart } from "@/app/components/boutique/cart-utils";
import { resolveBoutiqueSlugFromHost } from "@/lib/boutique-subdomains";
import { formatPrix } from "@/lib/boutique-format";
import type { AppLocale } from "@/lib/locale";

type BoutiqueHeaderCartProps = {
  boutiqueSlug: string;
  /** Lien vers la page panier complète de la boutique. */
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
// boutique). Même source que la page panier (useBoutiqueCart) : les deux restent synchronisés
// et n'affichent que les articles de cette boutique.
export default function BoutiqueHeaderCart({ boutiqueSlug, fullCartHref }: BoutiqueHeaderCartProps) {
  const t = useTranslations("boutique.panier");
  const langue = useLocale() as AppLocale;
  const { items, count, total, retirer, changerQuantite, erreurEcriture } = useBoutiqueCart(boutiqueSlug);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={t("boutonAria", { count })}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] transition hover:border-violet-400/60 hover:bg-violet-500/10"
      >
        🛒
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-violet-500 px-1 text-[11px] font-semibold text-white">
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-2xl shadow-black/20">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("titre")}</h2>
            {count > 0 ? <span className="text-xs text-[var(--text-muted)]">{t("articles", { count })}</span> : null}
          </div>

          {erreurEcriture ? <p className="mt-2 text-xs text-[var(--danger)]">{t("erreurStockage")}</p> : null}

          {items.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-xs text-[var(--text-muted)]">
              {t("videTiroir")}
            </div>
          ) : (
            <>
              <div className="mt-4 max-h-72 space-y-3 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div key={item.produitId} className="flex items-start gap-3">
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
                          onClick={() => changerQuantite(item.produitId, -1)}
                          aria-label={t("diminuer", { nom: item.nom })}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-primary)] hover:bg-violet-500/10"
                        >
                          −
                        </button>
                        <span className="text-xs text-[var(--text-muted)]">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => changerQuantite(item.produitId, 1)}
                          aria-label={t("augmenter", { nom: item.nom })}
                          className="flex h-5 w-5 items-center justify-center rounded-full border border-[var(--border)] text-[10px] text-[var(--text-primary)] hover:bg-violet-500/10"
                        >
                          +
                        </button>
                        <span className="ml-auto text-xs font-semibold text-[var(--text-primary)]">
                          {formatPrix(item.prix * item.quantity, langue)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => retirer(item.produitId)}
                      aria-label={t("retirerAria", { nom: item.nom })}
                      className="text-[var(--text-faint)] hover:text-[var(--danger)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
                <span className="text-[var(--text-muted)]">{t("total")}</span>
                <strong className="price-tag text-[var(--text-primary)]">{formatPrix(total, langue)}</strong>
              </div>

              <Link
                href={fullCartHref}
                onClick={() => setOpen(false)}
                className="mt-3 block rounded-2xl bg-violet-500 px-4 py-2 text-center text-sm font-semibold text-white transition hover:bg-violet-400"
              >
                {t("voirPanier")}
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
