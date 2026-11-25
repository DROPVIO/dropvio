"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";

type Recap = { plan: string | null; statut: string; finAcces: string | null; dejaResilie: boolean };
type Accuse = { reference: string; finAcces: string | null; plan: string | null; enregistreLe: string; emailEnvoye?: boolean; email?: string | null };

const CADRE = "flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6";
const BOUTON = "self-start rounded-xl bg-[var(--danger)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

/** Récapitulatif de l'abonnement (plan, date de fin) avec « Confirmer la résiliation », puis
 *  écran final avec la date de fin d'accès et un accusé de réception référencé. */
export default function ParcoursResiliation() {
  const t = useTranslations("resiliation");
  const format = useFormatter();
  const apiErrorMessage = useApiErrorMessage();
  const [recap, setRecap] = useState<Recap | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [accuse, setAccuse] = useState<Accuse | null>(null);

  useEffect(() => {
    fetch("/api/resiliation")
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (res.ok) setRecap(json);
        else setErreur(apiErrorMessage(json));
      })
      .catch(() => setErreur(apiErrorMessage({ code: "network" })))
      .finally(() => setChargement(false));
  }, [apiErrorMessage]);

  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { dateStyle: "long" }) : t("sansDate"));
  const nomPlan = (plan: string | null) => (plan && t.has(`plans.${plan}`) ? t(`plans.${plan}`) : t("plans.inconnu"));

  const confirmer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/resiliation", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.reference) {
        setErreur(apiErrorMessage(json));
        return;
      }
      setAccuse(json);
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setEnvoi(false);
    }
  };

  if (accuse) {
    return (
      <div role="status" className={CADRE}>
        <h2 className="m-0 text-xl font-semibold text-[var(--text-primary)]">{t("accuseTitre")}</h2>
        <p className="m-0 text-sm text-[var(--text-primary)]">{t("accuseTexte", { plan: nomPlan(accuse.plan), date: date(accuse.finAcces) })}</p>
        <p className="m-0 text-sm text-[var(--text-primary)]">
          {t("reference")} : <strong className="font-mono text-base">{accuse.reference}</strong>
        </p>
        <p className="m-0 text-sm text-[var(--text-muted)]">
          {t("enregistreLe", { date: format.dateTime(new Date(accuse.enregistreLe), { dateStyle: "long", timeStyle: "short" }) })}
        </p>
        {accuse.emailEnvoye && accuse.email ? (
          <p className="m-0 text-sm text-[var(--text-muted)]">{t("emailEnvoye", { email: accuse.email })}</p>
        ) : (
          <p className="m-0 text-sm text-[var(--text-muted)]">
            {t("accuseSuite")} {t("conservez")}
          </p>
        )}
        <Link href="/abonnement" className="text-sm text-[var(--text-primary)] underline underline-offset-4">{t("retour")}</Link>
      </div>
    );
  }

  if (chargement) return <p className="m-0 text-sm text-[var(--text-muted)]">{t("chargement")}</p>;

  if (!recap) {
    return (
      <div className={CADRE}>
        <p role="alert" className="m-0 text-sm text-[var(--text-primary)]">{erreur}</p>
        <Link href="/abonnement" className="text-sm text-[var(--text-primary)] underline underline-offset-4">{t("retour")}</Link>
      </div>
    );
  }

  return (
    <div className={CADRE}>
      <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">{t("recapTitre")}</h2>
      <dl className="m-0 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
        <dt className="text-[var(--text-faint)]">{t("plan")}</dt>
        <dd className="m-0 text-[var(--text-primary)]">{nomPlan(recap.plan)}</dd>
        <dt className="text-[var(--text-faint)]">{recap.statut === "trialing" ? t("finEssai") : t("finPeriode")}</dt>
        <dd className="m-0 text-[var(--text-primary)]">{date(recap.finAcces)}</dd>
      </dl>
      {recap.dejaResilie ? (
        <p className="m-0 text-sm text-[var(--text-muted)]">{t("dejaResilie", { date: date(recap.finAcces) })}</p>
      ) : (
        <>
          <p className="m-0 text-sm text-[var(--text-muted)]">{t("explication", { date: date(recap.finAcces) })}</p>
          {erreur ? <p role="alert" className="m-0 text-sm text-[var(--danger-text)]">{erreur}</p> : null}
          <button type="button" onClick={confirmer} disabled={envoi} className={BOUTON}>
            {envoi ? t("envoi") : t("confirmer")}
          </button>
        </>
      )}
      <Link href="/abonnement" className="text-sm text-[var(--text-muted)] underline underline-offset-4">{t("retour")}</Link>
    </div>
  );
}
