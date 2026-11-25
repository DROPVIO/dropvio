"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { STATUTS_VENTE, type ActionStatut, type StatutVente, type VenteAffichee } from "@/lib/ventes";
import { useApiErrorMessage } from "@/lib/use-api-error";
import { ErreurApi, invaliderCache, lireJson } from "@/lib/cache-client";
import { useDonneesClient } from "@/components/chargement/useDonneesClient";
import { IndicateurChargement, Squelette } from "@/components/chargement/IndicateurChargement";

type Reponse = { ventes: VenteAffichee[]; total: number; page: number; totalPages: number };

const BADGE: Record<StatutVente, string> = {
  a_traiter: "border-amber-500/30 bg-amber-500/10 text-[var(--warning-text)]",
  commandee: "border-emerald-500/30 bg-emerald-500/10 text-[var(--success-text)]",
  ignoree: "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-faint)]",
};

/** URL d'une page de ventes : c'est aussi la clé du cache client (lib/cache-client.ts). */
function urlVentes(page: number, filtre: StatutVente | null): string {
  const params = new URLSearchParams({ page: String(page) });
  if (filtre) params.set("statut", filtre);
  return `/api/ventes?${params}`;
}

/** Squelette du tableau : cinq lignes à la hauteur d'une vente. */
function SqueletteVentes() {
  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <Squelette key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

const BOUTON = "min-h-[36px] whitespace-nowrap rounded-lg border px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40";

// Mes ventes : les commandes Shopify reçues, 50 par page, la plus récente d'abord. Le marchand
// commande lui-même chez le fournisseur et change le statut à la main. Seuls le prénom et la
// ville du client sont affichés.
export default function VentesPage() {
  const t = useTranslations("ventes");
  const format = useFormatter();
  const apiErrorMessage = useApiErrorMessage();
  const [filtre, setFiltre] = useState<StatutVente | null>(null);
  const [page, setPage] = useState(1);
  const url = urlVentes(page, filtre);
  const lecture = useDonneesClient<Reponse>(url, () => lireJson<Reponse>(url));
  // Changement de page ou de filtre : le tableau précédent reste affiché jusqu'à l'arrivée du
  // nouveau (aucun indicateur sous 1 s), au lieu d'un écran vide.
  const [affichees, setAffichees] = useState<Reponse | null>(null);
  if (lecture.donnees && lecture.donnees !== affichees) setAffichees(lecture.donnees);
  const donnees = lecture.donnees ?? affichees;
  const [erreurAction, setErreur] = useState<string | null>(null);
  const erreurLecture = lecture.erreur
    ? apiErrorMessage(lecture.erreur instanceof ErreurApi ? lecture.erreur.corps : { code: "network" }, t("erreurChargement"))
    : null;
  const erreur = erreurAction ?? erreurLecture;
  const [enCours, setEnCours] = useState<string | null>(null);

  // Mise à jour optimiste : le statut change tout de suite dans le tableau, la requête part
  // ensuite ; en cas d'échec, l'ancien statut revient avec un message. Après succès, les
  // listes sont relues en arrière-plan (filtres et totaux).
  async function changerStatut(id: string, statut: ActionStatut) {
    setErreur(null);
    setEnCours(id);
    const precedent = lecture.modifier((d) => ({
      ...d,
      ventes: d.ventes.map((v) => (v.id === id ? { ...v, statut, statutChangeLe: new Date().toISOString() } : v)),
    }));
    try {
      const res = await fetch("/api/ventes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, statut }) });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        if (precedent) lecture.remettre(precedent);
        setErreur(apiErrorMessage(json, t("erreurStatut")));
        return;
      }
      invaliderCache("/api/ventes");
      void lecture.recharger();
    } catch {
      if (precedent) lecture.remettre(precedent);
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setEnCours(null);
    }
  }

  const choisirFiltre = (valeur: StatutVente | null) => {
    setFiltre(valeur);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 pb-16 pt-16 text-[var(--text-primary)]">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight">{t("titre")}</h1>
          <p className="mt-3 max-w-xl text-sm text-[var(--text-muted)]">{t("intro")}</p>
        </div>

        <div role="tablist" aria-label={t("filtre")} className="mb-5 inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1">
          {([null, ...STATUTS_VENTE] as (StatutVente | null)[]).map((valeur) => (
            <button
              key={valeur ?? "tous"}
              type="button"
              role="tab"
              aria-selected={filtre === valeur}
              onClick={() => choisirFiltre(valeur)}
              className={`min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition-all ${filtre === valeur ? "bg-violet-600 text-white" : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"}`}
            >
              {t(valeur ? `statut_${valeur}` : "tous")}
            </button>
          ))}
        </div>

        {erreur && <p role="alert" className="mb-4 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger-text)]">{erreur}</p>}

        <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full min-w-[860px] border-collapse text-left text-sm">
            <caption className="sr-only">{t("titre")}</caption>
            <thead className="border-b border-[var(--border)] text-[11px] uppercase tracking-widest text-[var(--text-faint)]">
              <tr>
                {["colDate", "colNumero", "colProduit", "colQuantite", "colClient", "colStatut", "colActions"].map((cle) => (
                  <th key={cle} scope="col" className="px-4 py-3 font-semibold">{t(cle)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {donnees === null ? (
                <tr>
                  <td colSpan={7} className="p-0">
                    {lecture.enAttente ? <IndicateurChargement libelle={t("chargement")} squelette={<SqueletteVentes />} /> : null}
                  </td>
                </tr>
              ) : donnees.ventes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-[var(--text-muted)]">{t(filtre ? "videFiltre" : "vide")}</td></tr>
              ) : (
                donnees.ventes.map((vente) => (
                  <tr key={vente.id} className="border-b border-[var(--border)] last:border-b-0 align-middle">
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-muted)]">{format.dateTime(new Date(vente.date), { dateStyle: "short", timeStyle: "short" })}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium">{vente.numero}</td>
                    <td className="max-w-[260px] px-4 py-3">
                      <span className="line-clamp-2">{vente.produit ?? "—"}</span>
                      {vente.autres > 0 && <span className="text-xs text-[var(--text-faint)]">{t("autresProduits", { count: vente.autres })}</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{vente.quantite}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {vente.client.prenom ?? "—"}
                      {vente.client.ville && <span className="text-[var(--text-faint)]"> · {vente.client.ville}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${BADGE[vente.statut]}`}>{t(`statut_${vente.statut}`)}</span>
                      {vente.statutChangeLe && <span className="mt-1 block text-[11px] text-[var(--text-faint)]">{format.dateTime(new Date(vente.statutChangeLe), { dateStyle: "short" })}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {/* Ouvre la fiche chez le fournisseur ; ne change jamais le statut. */}
                        {vente.lienFournisseur ? (
                          <a href={vente.lienFournisseur} target="_blank" rel="noopener noreferrer" className={`${BOUTON} inline-flex items-center border-[var(--border-strong)] text-[var(--text-primary)] hover:bg-[var(--surface-2)]`}>
                            {t("ouvrirFournisseur")}
                          </a>
                        ) : (
                          <span className={`${BOUTON} inline-flex items-center border-[var(--border)] text-[var(--text-faint)] opacity-60`} title={t("sansLien")}>{t("ouvrirFournisseur")}</span>
                        )}
                        <button type="button" disabled={enCours === vente.id || vente.statut === "commandee"} onClick={() => void changerStatut(vente.id, "commandee")} className={`${BOUTON} border-violet-500/40 bg-violet-600 text-white hover:bg-violet-500`}>
                          {t("marquerCommandee")}
                        </button>
                        <button type="button" disabled={enCours === vente.id || vente.statut === "ignoree"} onClick={() => void changerStatut(vente.id, "ignoree")} className={`${BOUTON} border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)]`}>
                          {t("ignorer")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {donnees && donnees.totalPages > 1 && (
          <nav aria-label={t("pagination")} className="mt-4 flex items-center justify-between gap-3 text-sm">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={`${BOUTON} border-[var(--border-strong)] text-[var(--text-primary)]`}>{t("precedente")}</button>
            <span className="text-[var(--text-muted)]">{t("pageSur", { page: donnees.page, total: donnees.totalPages, ventes: donnees.total })}</span>
            <button type="button" disabled={page >= donnees.totalPages} onClick={() => setPage((p) => p + 1)} className={`${BOUTON} border-[var(--border-strong)] text-[var(--text-primary)]`}>{t("suivante")}</button>
          </nav>
        )}
      </div>
    </div>
  );
}
