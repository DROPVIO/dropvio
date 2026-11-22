"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";
import type { AchatRecent } from "@/lib/retractation";

type Etape = "saisie" | "recap" | "accuse";
const AUTRE = "__autre__";

const CHAMP = "w-full rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text-primary)]";
const LIBELLE = "flex flex-col gap-1.5 text-sm font-medium text-[var(--text-primary)]";
const BOUTON = "rounded-xl bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50";

/** Formulaire de rétractation : saisie, récapitulatif avec « Confirmer la rétractation », puis
 *  accusé de réception avec numéro de référence. Fonctionne sans connexion (texte libre) ; un
 *  compte connecté choisit parmi ses achats des 14 derniers jours. */
export default function FormulaireRetractation() {
  const t = useTranslations("retractation");
  const format = useFormatter();
  const apiErrorMessage = useApiErrorMessage();
  const [etape, setEtape] = useState<Etape>("saisie");
  const [achats, setAchats] = useState<AchatRecent[]>([]);
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [choix, setChoix] = useState(AUTRE);
  const [achatLibre, setAchatLibre] = useState("");
  const [dateAchat, setDateAchat] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [accuse, setAccuse] = useState<{ reference: string; recueLe: string; emailEnvoye: boolean } | null>(null);

  useEffect(() => {
    fetch("/api/retractation/achats")
      .then((res) => (res.ok ? res.json() : { achats: [] }))
      .then((json: { achats?: AchatRecent[] }) => {
        const liste = json.achats ?? [];
        setAchats(liste);
        if (liste.length > 0) {
          setChoix(liste[0].ref);
          setDateAchat(liste[0].date);
        }
      })
      .catch(() => {});
  }, []);

  const achatChoisi = achats.find((a) => a.ref === choix) ?? null;
  const libelleAchat = (a: AchatRecent) => (t.has(`types.${a.libelle}`) ? t(`types.${a.libelle}`) : a.libelle);
  const achatTexte = achatChoisi ? `${libelleAchat(achatChoisi)} (${achatChoisi.date})` : achatLibre.trim();
  const saisieValide = nom.trim().length >= 2 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) && achatTexte.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(dateAchat);

  const confirmer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/retractation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom, email, achat: achatTexte, achatRef: achatChoisi?.ref ?? null, dateAchat }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.reference) {
        setErreur(apiErrorMessage(json));
        return;
      }
      setAccuse({ reference: json.reference, recueLe: json.recueLe, emailEnvoye: json.emailEnvoye === true });
      setEtape("accuse");
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setEnvoi(false);
    }
  };

  if (etape === "accuse" && accuse) {
    return (
      <div role="status" className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="m-0 text-xl font-semibold text-[var(--text-primary)]">{t("accuseTitre")}</h2>
        <p className="m-0 text-sm text-[var(--text-muted)]">
          {t("accuseTexte", { date: format.dateTime(new Date(accuse.recueLe), { dateStyle: "long", timeStyle: "short" }) })}
        </p>
        <p className="m-0 text-sm text-[var(--text-primary)]">
          {t("reference")} : <strong className="font-mono text-base">{accuse.reference}</strong>
        </p>
        {accuse.emailEnvoye ? (
          <p className="m-0 text-sm text-[var(--text-muted)]">{t("emailEnvoye", { email: email.trim() })}</p>
        ) : (
          <p className="m-0 text-sm text-[var(--text-muted)]">
            {t("accuseSuite", { email: email.trim() })} {t("conservez")}
          </p>
        )}
      </div>
    );
  }

  if (etape === "recap") {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">{t("recapTitre")}</h2>
        <dl className="m-0 grid gap-2 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-6">
          <dt className="text-[var(--text-faint)]">{t("nom")}</dt><dd className="m-0 text-[var(--text-primary)]">{nom.trim()}</dd>
          <dt className="text-[var(--text-faint)]">{t("email")}</dt><dd className="m-0 text-[var(--text-primary)]">{email.trim()}</dd>
          <dt className="text-[var(--text-faint)]">{t("achat")}</dt><dd className="m-0 text-[var(--text-primary)]">{achatTexte}</dd>
          <dt className="text-[var(--text-faint)]">{t("dateAchat")}</dt><dd className="m-0 text-[var(--text-primary)]">{dateAchat}</dd>
        </dl>
        {erreur ? <p role="alert" className="m-0 text-sm text-[var(--danger)]">{erreur}</p> : null}
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={confirmer} disabled={envoi} className={BOUTON}>
            {envoi ? t("envoi") : t("confirmer")}
          </button>
          <button type="button" onClick={() => setEtape("saisie")} disabled={envoi} className="rounded-xl border border-[var(--border-strong)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)]">
            {t("modifier")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (saisieValide) setEtape("recap");
        else setErreur(t("champsInvalides"));
      }}
      className="flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"
    >
      <label className={LIBELLE}>
        {t("nom")}
        <input className={CHAMP} value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="name" required />
      </label>
      <label className={LIBELLE}>
        {t("email")}
        <input className={CHAMP} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
      </label>
      {achats.length > 0 ? (
        <label className={LIBELLE}>
          {t("achat")}
          <select
            className={CHAMP}
            value={choix}
            onChange={(e) => {
              setChoix(e.target.value);
              const a = achats.find((x) => x.ref === e.target.value);
              if (a) setDateAchat(a.date);
            }}
          >
            {achats.map((a) => (
              <option key={a.ref} value={a.ref}>{`${libelleAchat(a)} — ${a.date}`}</option>
            ))}
            <option value={AUTRE}>{t("achatAutre")}</option>
          </select>
        </label>
      ) : null}
      {choix === AUTRE ? (
        <label className={LIBELLE}>
          {achats.length > 0 ? t("achatLibre") : t("achat")}
          <textarea className={CHAMP} rows={3} value={achatLibre} onChange={(e) => setAchatLibre(e.target.value)} placeholder={t("achatLibre")} required />
        </label>
      ) : null}
      <label className={LIBELLE}>
        {t("dateAchat")}
        <input className={CHAMP} type="date" value={dateAchat} onChange={(e) => setDateAchat(e.target.value)} required />
      </label>
      {erreur ? <p role="alert" className="m-0 text-sm text-[var(--danger)]">{erreur}</p> : null}
      <button type="submit" className={`${BOUTON} self-start`}>{t("continuer")}</button>
    </form>
  );
}
