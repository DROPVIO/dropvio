"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";
import { LIEN_CHANGER_DE_PLAN } from "@/lib/plan-links";

type Curseur = { etape: "categories" | "produits"; apres: string | null };
type ItemResult = { id: string; nom: string; status: "created" | "updated" | "reset" | "error"; error?: string };
type Reprise = { curseur: Curseur; bilan: { total: number; erreurs: number } };

const cleReprise = (boutiqueId: string) => `dropvio-shopify-push-${boutiqueId}`;

function lireReprise(boutiqueId: string): Reprise | null {
  try {
    const brut = localStorage.getItem(cleReprise(boutiqueId));
    return brut ? (JSON.parse(brut) as Reprise) : null;
  } catch {
    return null;
  }
}

function ecrireReprise(boutiqueId: string, reprise: Reprise | null) {
  try {
    if (reprise) localStorage.setItem(cleReprise(boutiqueId), JSON.stringify(reprise));
    else localStorage.removeItem(cleReprise(boutiqueId));
  } catch {
    // stockage indisponible : la reprise reste possible tant que la page est ouverte
  }
}

// Publication des produits et collections de la boutique sur Shopify, par lots
// (POST /api/boutiques/[id]/shopify-push). Chaque lot renvoie le curseur du suivant ; s'il
// échoue (réseau, délai), le curseur est gardé (état et localStorage) et « Reprendre »
// repart de là, y compris après un rechargement de la page.
export default function BoutiqueShopifyPush({ boutiqueId, canExport }: { boutiqueId: string; canExport: boolean }) {
  const t = useTranslations("siteBuilder.boutique.shopify");
  const apiErrorMessage = useApiErrorMessage();

  const [connecte, setConnecte] = useState<boolean | null>(null);
  const [domaine, setDomaine] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [progression, setProgression] = useState<{ faits: number; total: number } | null>(null);
  const [resultat, setResultat] = useState<{ status: "success" | "partial" | "error"; erreurs: ItemResult[]; resets: number } | null>(null);
  const [reprise, setReprise] = useState<Reprise | null>(null);

  useEffect(() => {
    fetch("/api/shopify/status")
      .then((res) => res.json())
      .then((json) => {
        setConnecte(Boolean(json.connected));
        setDomaine(json.shop_domain ?? null);
      })
      .catch(() => setConnecte(false));
    // Lecture différée (microtask) : pas de setState synchrone dans le corps de l'effet.
    queueMicrotask(() => setReprise(lireReprise(boutiqueId)));
  }, [boutiqueId]);

  async function pousser(depart: Reprise | null) {
    setEnCours(true);
    setErreur(null);
    setResultat(null);
    let curseur: Curseur | null = depart?.curseur ?? null;
    let bilan = depart?.bilan ?? { total: 0, erreurs: 0 };
    const erreurs: ItemResult[] = [];
    let resets = 0;
    setProgression({ faits: bilan.total, total: 0 });

    try {
      for (;;) {
        const res = await fetch(`/api/boutiques/${boutiqueId}/shopify-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ curseur, bilan }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErreur(apiErrorMessage(json, "shopify_push_failed"));
          // Erreur d'authentification : inutile de reprendre, il faut reconnecter Shopify.
          if (json.code !== "shopify_auth_expired" && curseur) {
            const r = { curseur, bilan };
            ecrireReprise(boutiqueId, r);
            setReprise(r);
          }
          return;
        }
        const lot = [...(json.categories ?? []), ...(json.products ?? [])] as ItemResult[];
        erreurs.push(...lot.filter((i) => i.status === "error"));
        resets += lot.filter((i) => i.status === "reset").length;
        bilan = json.bilan;
        setProgression({ faits: bilan.total, total: json.totalElements ?? bilan.total });

        if (json.termine) {
          ecrireReprise(boutiqueId, null);
          setReprise(null);
          setResultat({ status: json.status, erreurs, resets });
          return;
        }
        curseur = json.curseur;
        const r = { curseur: json.curseur as Curseur, bilan };
        ecrireReprise(boutiqueId, r);
        setReprise(r);
      }
    } catch {
      setErreur(apiErrorMessage(null, "network"));
      if (curseur) {
        const r = { curseur, bilan };
        ecrireReprise(boutiqueId, r);
        setReprise(r);
      }
    } finally {
      setEnCours(false);
    }
  }

  const description = !canExport
    ? t("reservePro")
    : connecte === null
    ? t("verification")
    : connecte
    ? t("description", { domaine: domaine ?? "" })
    : t("nonConnecte");

  return (
    <section id="shopify-push" className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 scroll-mt-24">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-violet-400">Shopify</p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{t("titre")}</h3>
          <p className="mt-1 text-sm text-[var(--text-faint)]">{description}</p>
        </div>
        {canExport ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            {reprise && !enCours ? (
              <button
                type="button"
                onClick={() => void pousser(reprise)}
                disabled={!connecte}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {t("reprendre", { faits: reprise.bilan.total })}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void pousser(null)}
              disabled={!connecte || enCours}
              className="rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enCours ? t("envoi") : reprise ? t("recommencer") : t("pousser")}
            </button>
          </div>
        ) : (
          <Link
            href={LIEN_CHANGER_DE_PLAN}
            className="shrink-0 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-blue-500"
          >
            {t("passerPro")}
          </Link>
        )}
      </div>

      {enCours && progression ? (
        <p className="mt-4 text-sm text-[var(--text-muted)]">
          {progression.total > 0
            ? t("progression", { faits: progression.faits, total: progression.total })
            : t("demarrage")}
        </p>
      ) : null}

      {erreur ? (
        <div className="mt-4 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {erreur}
          {reprise ? <span className="block mt-1">{t("repriseDisponible")}</span> : null}
        </div>
      ) : null}

      {resultat ? (
        <div className="mt-4 flex flex-col gap-3">
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              resultat.status === "success"
                ? "border-emerald-500/20 bg-emerald-500/10 text-[var(--success)]"
                : resultat.status === "partial"
                ? "border-amber-500/20 bg-amber-500/10 text-[var(--warning)]"
                : "border-[var(--danger)]/20 bg-[var(--danger)]/10 text-[var(--danger)]"
            }`}
          >
            {resultat.status === "success" ? t("succes") : resultat.status === "partial" ? t("partiel") : t("echec")}
          </div>
          {resultat.resets > 0 ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-[var(--warning)]">
              {t("resets", { count: resultat.resets })}
            </div>
          ) : null}
          {resultat.erreurs.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-[var(--danger)]/10 bg-[var(--danger)]/[0.04] px-3 py-2 text-xs text-[var(--danger)]"
            >
              <span className="font-semibold">{item.nom}</span> : {item.error}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
