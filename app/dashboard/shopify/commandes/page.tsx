"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type LigneCommande = {
  shopify_product_id: number | null;
  source_produit_id: string | null;
  nom: string;
  quantite: number;
  variant_title: string | null;
  lien_aliexpress: string | null;
};

type AdresseLivraison = {
  name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
  phone?: string | null;
};

type Commande = {
  id: string;
  shopify_order_id: number;
  shopify_order_name: string | null;
  statut: "a_traiter" | "commandee" | "ignoree";
  adresse_livraison: AdresseLivraison | null;
  client_nom: string | null;
  client_telephone: string | null;
  lignes: LigneCommande[];
  created_at: string;
};

function formatAdresse(a: AdresseLivraison | null, nom: string | null, tel: string | null): string {
  if (!a) return "";
  return [nom ?? a.name, a.address1, a.address2, [a.zip, a.city].filter(Boolean).join(" "), a.province, a.country, tel ?? a.phone]
    .filter(Boolean)
    .join("\n");
}

export default function CommandesAPreparerPage() {
  const [commandes, setCommandes] = useState<Commande[] | null>(null);
  const [lookbackDays, setLookbackDays] = useState(30);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  function reload() {
    fetch("/api/shopify/commandes")
      .then((r) => r.json())
      .then((json) => {
        setCommandes(json.commandes ?? []);
        if (json.lookbackDays) setLookbackDays(json.lookbackDays);
      })
      .catch(() => setCommandes([]));
  }

  useEffect(reload, []);

  async function updateStatut(id: string, statut: "commandee" | "ignoree") {
    setCommandes((prev) => prev?.map((c) => (c.id === id ? { ...c, statut } : c)) ?? prev);
    await fetch("/api/shopify/commandes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, statut }),
    }).catch(() => reload());
  }

  async function copierAdresse(commande: Commande) {
    const texte = formatAdresse(commande.adresse_livraison, commande.client_nom, commande.client_telephone);
    try {
      await navigator.clipboard.writeText(texte);
      setCopiedId(commande.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // presse-papier indisponible (contexte non sécurisé, permission refusée) — pas bloquant
    }
  }

  const aTraiter = commandes?.filter((c) => c.statut === "a_traiter") ?? [];
  const traitees = commandes?.filter((c) => c.statut !== "a_traiter") ?? [];

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <Link
            href="/dashboard/shopify"
            className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors"
          >
            ← Shopify
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mt-3">Commandes à préparer sur AliExpress</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">
            Une fiche par commande Shopify des {lookbackDays} derniers jours — à toi de passer la commande sur AliExpress et
            d&apos;en valider le paiement. Dropvio ne commande jamais rien automatiquement.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
          {commandes === null ? (
            <p className="text-[var(--text-faint)] text-sm text-center py-12">Chargement…</p>
          ) : aTraiter.length === 0 ? (
            <p className="text-[var(--text-faint)] text-sm text-center py-12">Aucune commande à préparer pour le moment.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {aTraiter.map((c) => (
                <div key={c.id} className="py-5 first:pt-0 last:pb-0 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      Commande {c.shopify_order_name ?? `#${c.shopify_order_id}`}
                    </p>
                    <p className="text-[11px] text-[var(--text-faint)]">
                      {new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    {c.lignes.map((l, i) => (
                      <div key={i} className="flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0">
                          <p className="text-[var(--text-primary)] truncate">
                            {l.quantite}× {l.nom}
                          </p>
                          {l.variant_title ? (
                            <p className="text-[11px] text-[var(--text-faint)]">Variante Shopify : {l.variant_title}</p>
                          ) : null}
                        </div>
                        {l.lien_aliexpress ? (
                          <a
                            href={l.lien_aliexpress}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                          >
                            Ouvrir sur AliExpress →
                          </a>
                        ) : (
                          <span className="shrink-0 text-[11px] text-[var(--text-faint)]">Lien AliExpress introuvable</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 flex items-start justify-between gap-3">
                    {c.adresse_livraison ? (
                      <pre className="text-xs text-[var(--text-muted)] whitespace-pre-wrap font-sans">
                        {formatAdresse(c.adresse_livraison, c.client_nom, c.client_telephone)}
                      </pre>
                    ) : (
                      <p className="text-xs text-[var(--text-faint)]">
                        Adresse non disponible — vérifie que l&apos;accès aux données clients protégées est bien approuvé côté
                        Shopify.
                      </p>
                    )}
                    {c.adresse_livraison ? (
                      <button
                        onClick={() => copierAdresse(c)}
                        className="shrink-0 text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        {copiedId === c.id ? "Copié ✓" : "Copier"}
                      </button>
                    ) : null}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateStatut(c.id, "commandee")}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity"
                    >
                      Marquer comme commandée
                    </button>
                    <button
                      onClick={() => updateStatut(c.id, "ignoree")}
                      className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors"
                    >
                      Ignorer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {traitees.length > 0 ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)] mb-3">Traitées</p>
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {traitees.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <p className="text-sm text-[var(--text-muted)]">Commande {c.shopify_order_name ?? `#${c.shopify_order_id}`}</p>
                  <span className="text-[11px] text-[var(--text-faint)]">
                    {c.statut === "commandee" ? "Commandée" : "Ignorée"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
