"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import ExpertSelecteur from "@/components/expert/ExpertSelecteur";
import { useLibelleModele } from "@/components/expert/useLibelleModele";
import { UsageMeter } from "@/components/UsageMeter";
import { expertRechargePrice, type ExpertModel, type ExpertSelection } from "@/lib/expert-pricing";
import { toIntlTag, type AppLocale } from "@/lib/locale";
import { lireJson } from "@/lib/cache-client";
import { URL_DONNEES } from "@/lib/donnees-pages";
import { useDonneesClient } from "@/components/chargement/useDonneesClient";
import { IndicateurChargement, Squelette } from "@/components/chargement/IndicateurChargement";
import ConsentementAchat, { CONSENTEMENT_VIDE, consentementDonne, corpsConsentement, type EtatConsentement } from "@/components/ConsentementAchat";

type QuotaData = {
  abonnementOffert: boolean;
  portailDisponible: boolean;
  periode: {
    modele: ExpertModel;
    sites: number;
    images: number;
    sitesUtilises: number;
    imagesUtilisees: number;
    fin: string;
  };
  credits: { type: "site" | "image"; modele: string; restants: number }[];
};

const CARTE = "rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-6 flex flex-col gap-4";
const TITRE = "text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest";
const LABEL_TYPE = { site: "sites", image: "images" } as const;


/** Squelette : carte de configuration (4 valeurs), carte d'utilisation (2 compteurs) et carte
 *  de recharge, aux mêmes dimensions que la page. */
function SqueletteQuota() {
  return (
    <div className="flex flex-col gap-6">
      <div className={CARTE}>
        <Squelette className="h-3 w-32" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Squelette className="h-3 w-16" />
              <Squelette className="h-5 w-20" />
            </div>
          ))}
        </div>
      </div>
      <div className={CARTE}>
        <Squelette className="h-3 w-28" />
        <Squelette className="h-[68px] w-full rounded-xl" />
        <Squelette className="h-[68px] w-full rounded-xl" />
      </div>
      <div className={CARTE}>
        <Squelette className="h-3 w-36" />
        <Squelette className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}

function QuotaContenu() {
  const t = useTranslations("quota");
  const tResiliation = useTranslations("resiliation");
  // Libellé sans nom de modèle (« Qualité standard », « Qualité avancée »).
  const libelleModele = useLibelleModele();
  const locale = useLocale() as AppLocale;
  const paiementRecu = useSearchParams().get("recharge") === "success";

  // Quota lu dans le cache client : affiché tout de suite au retour sur la page.
  const lecture = useDonneesClient<QuotaData>(URL_DONNEES.quotaExpert, () => lireJson<QuotaData>(URL_DONNEES.quotaExpert));
  const data = lecture.donnees ?? null;
  const chargement = lecture.enAttente;
  // Erreurs des paiements (recharge, abonnement) ; l'erreur de lecture vient du cache.
  const [erreurAction, setErreur] = useState<string | null>(null);
  const erreur = erreurAction ?? (lecture.erreur ? t("loadError") : null);
  const [selection, setSelection] = useState<ExpertSelection>({ model: "opus-5-5", sites: 0, images: 0 });
  const [consentement, setConsentement] = useState<EtatConsentement>(CONSENTEMENT_VIDE);
  const [redirection, setRedirection] = useState(false);


  async function versStripe(url: string, body: object, messageErreur: string) {
    setErreur(null);
    setRedirection(true);
    try {
      const res = await fetch(url, { method: "POST", body: JSON.stringify(body) });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) throw new Error();
      window.location.assign(json.url);
    } catch {
      setErreur(messageErreur);
      setRedirection(false);
    }
  }

  const total = expertRechargePrice(selection).total;
  const periode = data?.periode;

  return (
    <div className="min-h-screen bg-[var(--bg)] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("title")}</h1>
          <p className="text-[var(--text-faint)] text-sm mt-1.5">{t("subtitle")}</p>
        </div>

        {paiementRecu && (
          <p role="status" className="rounded-xl border border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-3 text-sm text-[var(--text-primary)]">
            {t("rechargeSuccess")}
          </p>
        )}
        {erreur && (
          <p role="alert" className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger-text)]">
            {erreur}
          </p>
        )}

        {chargement ? (
          <IndicateurChargement libelle={t("loading")} squelette={<SqueletteQuota />} />
        ) : periode ? (
          <>
            <section className={CARTE}>
              <h2 className={TITRE}>{t("configTitle")}</h2>
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                {[
                  [t("model"), libelleModele(periode.modele)],
                  [t("sites"), periode.sites],
                  [t("images"), periode.images],
                  [t("endDate"), new Date(periode.fin).toLocaleDateString(toIntlTag(locale))],
                ].map(([label, valeur]) => (
                  <div key={String(label)}>
                    <dt className="text-[11px] text-[var(--text-faint)]">{label}</dt>
                    <dd className="mt-1 font-semibold text-[var(--text-primary)]">{valeur}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-[var(--text-faint)]">{t("configNote")}</p>
              {data.abonnementOffert ? (
                <p className="self-start rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)]">
                  {t("offered")}
                </p>
              ) : data.portailDisponible && (
                <button
                  type="button"
                  disabled={redirection}
                  onClick={() => versStripe("/api/abonnement/portail", { retour: "/quota" }, t("portalError"))}
                  className="self-start rounded-lg border border-[var(--border-strong)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface)] disabled:opacity-50"
                >
                  {t("manage")}
                </button>
              )}
              {!data.abonnementOffert ? (
                <Link href="/resiliation" className="self-start text-sm text-[var(--text-muted)] underline underline-offset-4">
                  {tResiliation("lien")}
                </Link>
              ) : null}
            </section>

            <section className={CARTE}>
              <h2 className={TITRE}>{t("usageTitle")}</h2>
              <UsageMeter label={t("sites")} used={periode.sitesUtilises} max={periode.sites} />
              <UsageMeter label={t("images")} used={periode.imagesUtilisees} max={periode.images} />
              <h3 className={`${TITRE} mt-2`}>{t("creditsTitle")}</h3>
              {data.credits.length === 0 ? (
                <p className="text-sm text-[var(--text-faint)]">{t("noCredits")}</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-sm text-[var(--text-primary)]">
                  {data.credits.map((credit) => (
                    <li key={`${credit.type}:${credit.modele}`} className="flex justify-between gap-4">
                      <span>{t(LABEL_TYPE[credit.type])} · {libelleModele(credit.modele)}</span>
                      <strong>{credit.restants}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className={CARTE}>
              <div>
                <h2 className={TITRE}>{t("rechargeTitle")}</h2>
                <p className="mt-2 text-xs text-[var(--text-faint)]">{t("rechargeNote")}</p>
              </div>
              <ExpertSelecteur selection={selection} onChange={setSelection} />
              <ConsentementAchat famille="service" valeur={consentement} onChange={setConsentement} />
              <button
                type="button"
                disabled={redirection || !consentementDonne(consentement) || total <= 0}
                onClick={() => versStripe("/api/expert/recharge", { ...selection, consentements: corpsConsentement(consentement, locale) }, t("rechargeError"))}
                className="self-start rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {redirection ? t("redirecting") : t("buy")}
              </button>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function QuotaPage() {
  return (
    <Suspense>
      <QuotaContenu />
    </Suspense>
  );
}
