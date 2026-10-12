"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useBoutiqueCart } from "@/app/components/boutique/cart-utils";
import { resolveBoutiqueSlugFromHost } from "@/lib/boutique-subdomains";
import { formatPrix } from "@/lib/boutique-format";
import type { AppLocale } from "@/lib/locale";

// Panier de la boutique : ajout depuis les fiches produit, quantités, total, retrait, gardé
// dans le navigateur (localStorage, voir cart-utils). Aucun paiement n'est branché : le
// mode de paiement n'est pas encore décidé, donc « Passer commande » reste désactivé avec un
// message clair plutôt qu'un flux simulé. Langue : celle de la boutique (layout).
export default function BoutiquePanierPage() {
  const t = useTranslations("boutique.panier");
  const langue = useLocale() as AppLocale;
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : Array.isArray(params?.slug) ? params.slug[0] : "";
  const { items, count, total, retirer, changerQuantite, erreurEcriture } = useBoutiqueCart(slug);

  const [basePath, setBasePath] = useState(`/boutiques/${slug}`);
  useEffect(() => {
    // setState différé (microtask) plutôt qu'appelé en synchrone dans le corps de l'effet,
    // pour éviter le re-render en cascade immédiat (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      const currentSlug = resolveBoutiqueSlugFromHost(window.location.host, process.env.NEXT_PUBLIC_ROOT_DOMAIN);
      setBasePath(currentSlug === slug ? "" : `/boutiques/${slug}`);
    });
  }, [slug]);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <p className="text-sm uppercase tracking-[0.3em] text-violet-300">{t("surtitre")}</p>
        <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)]">{t("titre")}</h1>

        {erreurEcriture ? (
          <p role="alert" className="mt-4 text-sm text-[var(--danger)]">
            {t("erreurStockage")}
          </p>
        ) : null}

        {items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center">
            <p className="text-sm text-[var(--text-muted)]">{t("vide")}</p>
            <Link
              href={`${basePath}/produits`}
              className="mt-4 inline-block rounded-2xl bg-violet-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              {t("voirProduits")}
            </Link>
          </div>
        ) : (
          <div className="mt-8 flex flex-col gap-6">
            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
              {items.map((item) => (
                <div key={item.produitId} className="flex items-center gap-4 p-5">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[var(--surface-3)]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.nom} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl">🛍️</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`${basePath}/produits/${item.produitId}`}
                      className="block truncate text-sm font-medium text-[var(--text-primary)] hover:text-violet-300"
                    >
                      {item.nom}
                    </Link>
                    <p className="mt-1 text-xs text-[var(--text-faint)]">
                      {t("prixUnitaire", { prix: formatPrix(item.prix, langue) })}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changerQuantite(item.produitId, -1)}
                        aria-label={t("diminuer", { nom: item.nom })}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-violet-500/10"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm text-[var(--text-muted)]">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => changerQuantite(item.produitId, 1)}
                        aria-label={t("augmenter", { nom: item.nom })}
                        className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--border)] text-sm text-[var(--text-primary)] hover:bg-violet-500/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">
                      {formatPrix(item.prix * item.quantity, langue)}
                    </span>
                    <button
                      type="button"
                      onClick={() => retirer(item.produitId)}
                      aria-label={t("retirerAria", { nom: item.nom })}
                      className="text-xs text-[var(--text-faint)] hover:text-[var(--danger)]"
                    >
                      {t("retirer")}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between text-base">
                <span className="text-[var(--text-muted)]">{t("totalArticles", { count })}</span>
                <strong className="price-tag text-lg text-[var(--text-primary)]">{formatPrix(total, langue)}</strong>
              </div>

              <button
                type="button"
                disabled
                aria-describedby="paiement-indisponible"
                className="mt-5 w-full rounded-2xl bg-violet-500 px-5 py-3 text-sm font-semibold text-white opacity-40 cursor-not-allowed"
              >
                {t("passerCommande")}
              </button>
              <p id="paiement-indisponible" className="mt-3 text-center text-xs text-[var(--text-muted)]">
                {t("paiementIndisponible")}
              </p>
            </div>

            <Link href={`${basePath}/produits`} className="text-center text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              {t("continuer")}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
