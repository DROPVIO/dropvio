"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { PRIX_PLAN_EUR, formatEuros } from "@/lib/prix";
import Logo from "@/components/Logo";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useApiErrorMessage } from "@/lib/use-api-error";
import ConsentementAchat, { CONSENTEMENT_VIDE, consentementDonne, corpsConsentement, type EtatConsentement } from "@/components/ConsentementAchat";

type PlanPayant = "pro" | "agency";

type EtatAbonnement = {
  // null : aucun abonnement (ou Expert sans période en cours).
  plan: PlanPayant | "expert" | null;
  statut: string | null;
  essaiUtilise: boolean;
  essaiFin: string | null;
  periodeFin: string | null;
  portailDisponible: boolean;
  expertExpire?: boolean;
};

const PLANS: PlanPayant[] = ["pro", "agency"];

// Au retour de Stripe Checkout, le webhook qui active le plan peut arriver quelques secondes
// après l'utilisateur : on relit l'état toutes les ATTENTE_INTERVALLE_MS, au plus
// ATTENTE_ESSAIS fois, avant de proposer de recharger plutôt que de boucler indéfiniment.
const ATTENTE_INTERVALLE_MS = 2000;
const ATTENTE_ESSAIS = 15;

/** Choix du plan. Passage obligé de tout compte sans abonnement actif ni essai en cours :
 *  le middleware y renvoie depuis les outils (voir proxy.ts). */
export default function AbonnementPage() {
  const t = useTranslations("abonnement");
  const tPrix = useTranslations("landing.pricing");
  const tRetractation = useTranslations("retractation");
  const tResiliation = useTranslations("resiliation");
  const tRenonciation = useTranslations("renonciation");
  // Bouton « Renoncer au contrat ici » : seulement dans les 14 jours suivant la souscription.
  const [renonciationPossible, setRenonciationPossible] = useState(false);
  useEffect(() => {
    fetch("/api/renonciation")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { eligible?: boolean } | null) => setRenonciationPossible(json?.eligible === true))
      .catch(() => {});
  }, []);
  const locale = useLocale();
  const [consentement, setConsentement] = useState<EtatConsentement>(CONSENTEMENT_VIDE);
  const router = useRouter();
  const apiErrorMessage = useApiErrorMessage();

  const [etat, setEtat] = useState<EtatAbonnement | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<PlanPayant | "portail" | null>(null);
  const [attente, setAttente] = useState<"aucune" | "active" | "expiree">("aucune");
  const [annule, setAnnule] = useState(false);

  const lireEtat = async (): Promise<EtatAbonnement | null> => {
    const res = await fetch("/api/abonnement");
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setErreur(apiErrorMessage(json, t("erreurChargement")));
      return null;
    }
    setEtat(json);
    return json;
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- l'URL n'est lisible qu'après l'hydratation.
    if (params.has("canceled")) setAnnule(true);

    if (!params.has("success")) {
      void lireEtat();
      return;
    }

    setAttente("active");
    let essais = 0;
    let arrete = false;
    const verifier = async () => {
      const courant = await lireEtat();
      if (arrete) return;
      if (courant && courant.plan !== null) {
        router.replace("/dashboard");
        return;
      }
      essais += 1;
      if (essais >= ATTENTE_ESSAIS) {
        setAttente("expiree");
        return;
      }
      setTimeout(verifier, ATTENTE_INTERVALLE_MS);
    };
    void verifier();
    return () => {
      arrete = true;
    };
    // Un seul passage au montage : les paramètres d'URL ne changent pas sur cette page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const souscrire = async (plan: PlanPayant) => {
    setErreur(null);
    setEnCours(plan);
    try {
      const res = await fetch("/api/abonnement/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, consentements: corpsConsentement(consentement, locale) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setErreur(apiErrorMessage(json, t("erreurPaiement")));
        setEnCours(null);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
      setEnCours(null);
    }
  };

  const ouvrirPortail = async () => {
    setErreur(null);
    setEnCours("portail");
    try {
      const res = await fetch("/api/abonnement/portail", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.url) {
        setErreur(apiErrorMessage(json, t("erreurPaiement")));
        setEnCours(null);
        return;
      }
      window.location.assign(json.url);
    } catch {
      setErreur(apiErrorMessage({ code: "network" }));
      setEnCours(null);
    }
  };

  const seDeconnecter = async () => {
    await createSupabaseBrowserClient().auth.signOut();
    router.replace("/login");
  };

  // past_due / unpaid : un abonnement existe encore chez Stripe, il se régularise dans le
  // portail (mise à jour de la carte) plutôt qu'en en créant un second.
  const aRegulariser = etat?.statut === "past_due" || etat?.statut === "unpaid";
  const ancienAbonne = etat?.statut === "canceled" || etat?.statut === "incomplete_expired";

  if (attente !== "aucune") {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-8 text-center flex flex-col items-center gap-4">
          <h1 className="text-[var(--text-primary)] font-bold text-lg">
            {attente === "active" ? t("activationTitre") : t("activationLongueTitre")}
          </h1>
          <p className="text-[var(--text-muted)] text-sm leading-relaxed">
            {attente === "active" ? t("activationTexte") : t("activationLongueTexte")}
          </p>
          {attente === "expiree" ? (
            <button
              onClick={() => window.location.assign("/dashboard")}
              className="mt-2 w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition-all"
            >
              {t("activationRecharger")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-12">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-center gap-2 mb-10">
          <Logo className="w-7 h-7 text-[var(--logo-accent)]" />
          <span className="text-xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] bg-clip-text text-transparent">
            Dropvio
          </span>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t("titre")}</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)] leading-relaxed">
            {etat?.essaiUtilise ? t("sousTitreSansEssai") : t("sousTitreEssai")}
          </p>
        </div>

        {annule ? (
          <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
            {t("annule")}
          </div>
        ) : null}

        {aRegulariser ? (
          <div className="mb-5 rounded-xl bg-[var(--warning)]/10 border border-[var(--warning)]/30 px-4 py-3 text-sm text-[var(--text-primary)] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("impaye")}</span>
            <button
              onClick={ouvrirPortail}
              disabled={enCours !== null}
              className="shrink-0 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] disabled:opacity-50"
            >
              {enCours === "portail" ? t("redirection") : t("regulariser")}
            </button>
          </div>
        ) : null}

        {ancienAbonne ? (
          <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text-muted)]">
            {t("termine")}
          </div>
        ) : null}

        {erreur ? (
          <div className="mb-5 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">
            {erreur}
          </div>
        ) : null}

        {etat?.expertExpire ? (
          <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/[0.05] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">{t("reprendreExpert.titre")}</h2>
              <p className="m-0 mt-1 text-sm text-[var(--text-muted)]">{t("reprendreExpert.texte")}</p>
            </div>
            <Link
              href="/expert"
              className="shrink-0 rounded-xl bg-emerald-400 px-5 py-3 text-center text-sm font-semibold text-black no-underline hover:bg-emerald-300"
            >
              {t("reprendreExpert.cta")}
            </Link>
          </div>
        ) : null}

        <div className="mb-5">
          <ConsentementAchat famille="service" valeur={consentement} onChange={setConsentement} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {PLANS.map((plan) => {
            const misEnAvant = plan === "pro";
            return (
              <div
                key={plan}
                className={`flex flex-col rounded-2xl border bg-[var(--surface)] p-6 ${misEnAvant ? "border-violet-500" : "border-[var(--border)]"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h2 className="m-0 text-lg font-semibold text-[var(--text-primary)]">{tPrix(plan)}</h2>
                  {misEnAvant ? (
                    <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-500">{tPrix("recommended")}</span>
                  ) : null}
                </div>
                <p className="m-0 mt-3 flex items-baseline gap-1 text-[var(--text-primary)]">
                  <span className="text-3xl font-bold">{formatEuros(PRIX_PLAN_EUR[plan], locale)}</span>
                  <span className="text-sm text-[var(--text-faint)]">{tPrix("perMonth")}</span>
                </p>
                <ul className="m-0 mt-5 flex list-none flex-col gap-2 p-0 text-sm text-[var(--text-muted)]">
                  {(tPrix.raw(`features.${plan}`) as string[]).map((f) => (
                    <li key={f} className="flex gap-2">
                      <span aria-hidden className="text-violet-500">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => souscrire(plan)}
                  disabled={enCours !== null || aRegulariser || !consentementDonne(consentement)}
                  className="mt-6 w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enCours === plan ? t("redirection") : etat?.essaiUtilise ? t("ctaSansEssai") : t("ctaEssai")}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs text-[var(--text-faint)] leading-relaxed">
          {etat?.essaiUtilise ? t("mentionSansEssai") : t("mentionEssai")}
        </p>

        {/* Résiliation (art. L215-1-1) et renonciation dans les 14 jours (art. L221-21). */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/resiliation"
            className="rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--danger)]"
          >
            {tResiliation("lien")}
          </Link>
          {renonciationPossible ? (
            <Link
              href="/renonciation"
              className="rounded-xl border border-[var(--border-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:border-[var(--danger)]"
            >
              {tRenonciation("bouton")}
            </Link>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <Link href="/retractation" className="text-[var(--text-faint)] hover:text-[var(--text-muted)] transition font-medium">
            {tRetractation("lien")}
          </Link>
          <a href="/formation" className="text-[var(--text-faint)] hover:text-[var(--text-muted)] transition font-medium">
            {t("lienFormation")}
          </a>
          <button onClick={seDeconnecter} className="text-[var(--text-faint)] hover:text-[var(--text-muted)] transition font-medium">
            {t("deconnexion")}
          </button>
        </div>
      </div>
    </div>
  );
}
