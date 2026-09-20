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
  numero_suivi: string | null;
  transporteur: string | null;
  fulfillment_shopify_id: number | null;
  fulfillment_erreur: string | null;
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
  const [fulfillmentScopeGranted, setFulfillmentScopeGranted] = useState(false);
  const [lienDrafts, setLienDrafts] = useState<Record<string, string>>({});
  const [suiviDrafts, setSuiviDrafts] = useState<Record<string, { numero: string; transporteur: string }>>({});
  const [suiviBusyId, setSuiviBusyId] = useState<string | null>(null);
  // Erreurs par commande pour statut/lien — un fetch() résolu (res.ok === false) n'est pas
  // une erreur réseau, donc jamais catché par un simple .catch() : il faut vérifier res.ok
  // explicitement et revenir sur la mise à jour optimiste si le serveur a refusé.
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});
  const [statutBusyId, setStatutBusyId] = useState<string | null>(null);
  // Clé composite "commandeId:ligneIndex" (même pattern que lienDrafts) — plusieurs lignes
  // par commande peuvent chacune avoir leur propre bouton "Rattacher" en vol.
  const [lienBusyKey, setLienBusyKey] = useState<string | null>(null);

  function reload() {
    fetch("/api/shopify/commandes")
      .then((r) => r.json())
      .then((json) => {
        setCommandes(json.commandes ?? []);
        if (json.lookbackDays) setLookbackDays(json.lookbackDays);
      })
      .catch(() => setCommandes([]));
    fetch("/api/shopify/status")
      .then((r) => r.json())
      .then((json) => setFulfillmentScopeGranted(Boolean(json.fulfillmentScopeGranted)))
      .catch(() => setFulfillmentScopeGranted(false));
  }

  useEffect(reload, []);

  async function updateStatut(id: string, statut: "commandee" | "ignoree") {
    if (statutBusyId === id) return;
    const previousStatut = commandes?.find((c) => c.id === id)?.statut;
    setStatutBusyId(id);
    setCommandes((prev) => prev?.map((c) => (c.id === id ? { ...c, statut } : c)) ?? prev);
    setActionErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      const res = await fetch("/api/shopify/commandes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, statut }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Échec de la mise à jour du statut.");
      }
    } catch (err) {
      if (previousStatut) {
        setCommandes((prev) => prev?.map((c) => (c.id === id ? { ...c, statut: previousStatut } : c)) ?? prev);
      }
      setActionErrors((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Impossible de contacter le serveur.",
      }));
    } finally {
      setStatutBusyId(null);
    }
  }

  async function attacherLien(commandeId: string, ligneIndex: number) {
    const key = `${commandeId}:${ligneIndex}`;
    if (lienBusyKey === key) return;
    const lienAliExpress = (lienDrafts[key] ?? "").trim();
    if (!lienAliExpress) return;
    setLienBusyKey(key);
    const previousLien = commandes?.find((c) => c.id === commandeId)?.lignes[ligneIndex]?.lien_aliexpress ?? null;
    setCommandes(
      (prev) =>
        prev?.map((c) =>
          c.id === commandeId
            ? { ...c, lignes: c.lignes.map((l, i) => (i === ligneIndex ? { ...l, lien_aliexpress: lienAliExpress } : l)) }
            : c
        ) ?? prev
    );
    setLienDrafts((prev) => {
      const next = { ...prev };
      delete next[`${commandeId}:${ligneIndex}`];
      return next;
    });
    setActionErrors((prev) => ({ ...prev, [commandeId]: "" }));
    try {
      const res = await fetch("/api/shopify/commandes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: commandeId, ligneIndex, lienAliExpress }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Échec du rattachement du lien.");
      }
    } catch (err) {
      setCommandes(
        (prev) =>
          prev?.map((c) =>
            c.id === commandeId
              ? { ...c, lignes: c.lignes.map((l, i) => (i === ligneIndex ? { ...l, lien_aliexpress: previousLien } : l)) }
              : c
          ) ?? prev
      );
      setActionErrors((prev) => ({
        ...prev,
        [commandeId]: err instanceof Error ? err.message : "Impossible de contacter le serveur.",
      }));
    } finally {
      setLienBusyKey(null);
    }
  }

  async function envoyerSuivi(commandeId: string) {
    const draft = suiviDrafts[commandeId];
    const numeroSuivi = (draft?.numero ?? "").trim();
    if (!numeroSuivi) return;
    setSuiviBusyId(commandeId);
    try {
      const res = await fetch("/api/shopify/commandes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: commandeId, numeroSuivi, transporteur: draft?.transporteur || null }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        // Échec avant même la tentative de push (ex. l'UPDATE Supabase du numéro de suivi a
        // échoué, voir pushSuivi dans route.ts) — rien n'a été persisté, ne jamais afficher le
        // numéro comme enregistré dans ce cas.
        setCommandes(
          (prev) =>
            prev?.map((c) =>
              c.id === commandeId ? { ...c, fulfillment_erreur: json?.error ?? "Échec de l'enregistrement du suivi." } : c
            ) ?? prev
        );
        return;
      }

      if (json?.fulfillmentPushed) {
        reload();
      } else {
        setCommandes(
          (prev) =>
            prev?.map((c) =>
              c.id === commandeId
                ? { ...c, numero_suivi: numeroSuivi, transporteur: draft?.transporteur || null, fulfillment_erreur: json?.error ?? "Échec de l'envoi." }
                : c
            ) ?? prev
        );
      }
    } catch {
      setCommandes(
        (prev) =>
          prev?.map((c) => (c.id === commandeId ? { ...c, fulfillment_erreur: "Impossible de contacter le serveur." } : c)) ?? prev
      );
    } finally {
      setSuiviBusyId(null);
    }
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
                          <div className="shrink-0 flex items-center gap-1.5">
                            <input
                              type="url"
                              placeholder="Coller le lien AliExpress…"
                              value={lienDrafts[`${c.id}:${i}`] ?? ""}
                              onChange={(e) => setLienDrafts((prev) => ({ ...prev, [`${c.id}:${i}`]: e.target.value }))}
                              className="text-[11px] px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] w-40"
                            />
                            <button
                              onClick={() => attacherLien(c.id, i)}
                              disabled={lienBusyKey === `${c.id}:${i}`}
                              className="text-[11px] font-semibold text-[var(--accent)] hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                            >
                              {lienBusyKey === `${c.id}:${i}` ? "Rattachement…" : "Rattacher"}
                            </button>
                          </div>
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
                      disabled={statutBusyId === c.id}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Marquer comme commandée
                    </button>
                    <button
                      onClick={() => updateStatut(c.id, "ignoree")}
                      disabled={statutBusyId === c.id}
                      className="text-xs text-[var(--text-faint)] hover:text-[var(--text-muted)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Ignorer
                    </button>
                  </div>
                  {actionErrors[c.id] ? (
                    <p className="text-[11px] text-[var(--danger)]">{actionErrors[c.id]}</p>
                  ) : null}
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
                <div key={c.id} className="py-3 first:pt-0 last:pb-0 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-[var(--text-muted)]">Commande {c.shopify_order_name ?? `#${c.shopify_order_id}`}</p>
                    <span className="text-[11px] text-[var(--text-faint)]">
                      {c.statut === "commandee" ? "Commandée" : "Ignorée"}
                    </span>
                  </div>

                  {c.statut === "commandee" ? (
                    c.fulfillment_shopify_id ? (
                      <p className="text-[11px] text-[var(--accent-secondary)]">
                        Suivi transmis ✓ {c.numero_suivi}
                        {c.transporteur ? ` (${c.transporteur})` : ""}
                      </p>
                    ) : !fulfillmentScopeGranted ? (
                      <p className="text-[11px] text-[var(--text-faint)]">
                        <a href="/dashboard?openIntegrations=1" className="text-[var(--accent)] hover:underline">
                          Reconnecte ta boutique Shopify
                        </a>{" "}
                        pour activer l&apos;envoi automatique du numéro de suivi.
                      </p>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        {c.fulfillment_erreur ? (
                          <p className="text-[11px] text-[var(--danger)]">{c.fulfillment_erreur}</p>
                        ) : null}
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Numéro de suivi"
                            value={suiviDrafts[c.id]?.numero ?? c.numero_suivi ?? ""}
                            onChange={(e) =>
                              setSuiviDrafts((prev) => ({
                                ...prev,
                                [c.id]: { numero: e.target.value, transporteur: prev[c.id]?.transporteur ?? c.transporteur ?? "" },
                              }))
                            }
                            className="text-[11px] px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] w-32"
                          />
                          <input
                            type="text"
                            placeholder="Transporteur (optionnel)"
                            value={suiviDrafts[c.id]?.transporteur ?? c.transporteur ?? ""}
                            onChange={(e) =>
                              setSuiviDrafts((prev) => ({
                                ...prev,
                                [c.id]: { numero: prev[c.id]?.numero ?? c.numero_suivi ?? "", transporteur: e.target.value },
                              }))
                            }
                            className="text-[11px] px-2 py-1 rounded-md border border-[var(--border)] bg-[var(--bg)] text-[var(--text-primary)] w-36"
                          />
                          <button
                            onClick={() => envoyerSuivi(c.id)}
                            disabled={suiviBusyId === c.id}
                            className="text-[11px] font-semibold text-[var(--accent)] hover:underline disabled:opacity-50"
                          >
                            {suiviBusyId === c.id ? "Envoi…" : c.fulfillment_erreur ? "Réessayer" : "Envoyer le suivi"}
                          </button>
                        </div>
                      </div>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
