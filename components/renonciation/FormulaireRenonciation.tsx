"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";

type Eligibilite =
  | { eligible: false }
  | { eligible: true; plan: string | null; identifiant: string; dateSouscription: string; dernierJour: string };
type Confirmation = {
  reference: string;
  plan: string | null;
  recueLe: string;
  montantRembourseCentimes: number;
  devise: string | null;
  remboursementComplet: boolean;
  emailEnvoye?: boolean;
  email?: string | null;
};

const CADRE = "flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6";
const CHAMP = "w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-primary)]";
const LIBELLE = "flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]";
const BOUTON = "self-start rounded-xl bg-[var(--danger)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

/** Formulaire de renonciation (identifiant du compte, date de souscription, motif facultatif),
 *  pré-rempli depuis le compte, puis écran de confirmation avec référence et remboursement. */
export default function FormulaireRenonciation() {
  const t = useTranslations("renonciation");
  const tResiliation = useTranslations("resiliation");
  const format = useFormatter();
  const apiErrorMessage = useApiErrorMessage();
  const [etat, setEtat] = useState<Eligibilite | null>(null);
  const [identifiant, setIdentifiant] = useState("");
  const [dateSouscription, setDateSouscription] = useState("");
  const [motif, setMotif] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    fetch("/api/renonciation")
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setErreur(apiErrorMessage(json));
          setEtat({ eligible: false });
          return;
        }
        setEtat(json);
        if (json?.eligible) {
          setIdentifiant(json.identifiant);
          setDateSouscription(json.dateSouscription);
        }
      })
      .catch(() => {
        setErreur(apiErrorMessage({ code: "network" }));
        setEtat({ eligible: false });
      });
  }, [apiErrorMessage]);

  const date = (iso: string) => format.dateTime(new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso), { dateStyle: "long" });
  const nomPlan = (plan: string | null) => (plan && tResiliation.has(`plans.${plan}`) ? tResiliation(`plans.${plan}`) : tResiliation("plans.inconnu"));

  const confirmer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/renonciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifiant, dateSouscription, motif: motif.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.reference) {
        setErreur(apiErrorMessage(json));
        return;
      }
      setConfirmation(json);
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setEnvoi(false);
    }
  };

  if (confirmation) {
    const montant =
      confirmation.montantRembourseCentimes > 0
        ? format.number(confirmation.montantRembourseCentimes / 100, { style: "currency", currency: (confirmation.devise ?? "eur").toUpperCase() })
        : null;
    return (
      <div role="status" className={CADRE}>
        <h2 className="m-0 text-xl font-semibold text-[var(--text-primary)]">{t("confirmationTitre")}</h2>
        <p className="m-0 text-sm text-[var(--text-muted)]">{t("confirmationTexte", { plan: nomPlan(confirmation.plan) })}</p>
        <p className="m-0 text-sm text-[var(--text-muted)]">
          {confirmation.remboursementComplet && montant ? t("remboursementLance", { montant }) : t("remboursementDelai")}
        </p>
        <p className="m-0 text-sm text-[var(--text-primary)]">
          {t("reference")} : <strong className="font-mono text-base">{confirmation.reference}</strong>
        </p>
        <p className="m-0 text-sm text-[var(--text-muted)]">
          {confirmation.emailEnvoye && confirmation.email ? t("emailEnvoye", { email: confirmation.email }) : t("conservez")}
        </p>
        <Link href="/abonnement" className="self-start text-sm font-medium text-[var(--accent-text)]">{t("retour")}</Link>
      </div>
    );
  }

  if (!etat) return <p className="m-0 text-sm text-[var(--text-muted)]">{t("chargement")}</p>;

  if (!etat.eligible) {
    return (
      <div className={CADRE}>
        <p className="m-0 text-sm text-[var(--text-muted)]">{erreur ?? t("horsDelai")}</p>
        <Link href="/abonnement" className="self-start text-sm font-medium text-[var(--accent-text)]">{t("retour")}</Link>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void confirmer();
      }}
      className={CADRE}
    >
      <p className="m-0 text-sm text-[var(--text-muted)]">
        {t("explication", { plan: nomPlan(etat.plan), date: date(etat.dernierJour) })}
      </p>
      <label className={LIBELLE}>
        {t("identifiant")}
        <input className={CHAMP} type="email" value={identifiant} onChange={(e) => setIdentifiant(e.target.value)} autoComplete="email" required />
      </label>
      <label className={LIBELLE}>
        {t("dateSouscription")}
        <input className={CHAMP} type="date" value={dateSouscription} onChange={(e) => setDateSouscription(e.target.value)} required />
      </label>
      <label className={LIBELLE}>
        {t("motif")}
        <textarea className={CHAMP} rows={3} maxLength={1000} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder={t("motifAide")} />
      </label>
      {erreur ? <p role="alert" className="m-0 text-sm text-[var(--danger-text)]">{erreur}</p> : null}
      <button type="submit" disabled={envoi} className={BOUTON}>
        {envoi ? t("envoi") : t("confirmer")}
      </button>
    </form>
  );
}
