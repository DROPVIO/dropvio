"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import GenerateurMedia from "@/components/studio/GenerateurMedia";
import ImagesProduits from "@/components/studio/ImagesProduits";
import MediathequeGrille from "@/components/studio/MediathequeGrille";
import { BOUTON_PRIMAIRE, PANNEAU, SELECTEUR, SELECTEUR_BOUTON } from "@/components/studio/styles";
import { generationDisponible } from "@/lib/media/config";
import type { Plan } from "@/lib/plan-limits";

type ModeImage = "libre" | "produits";

// Mise en page reprise du Site Builder : badge, titre et intro, sélecteur de mode, panneaux
// arrondis. Réglages à gauche, médiathèque (le résultat) à droite ; l'un sous l'autre sur mobile.
// Le Studio ne génère que des images : pas de sélecteur de type de média (un sélecteur à une
// seule position n'a rien à offrir, même règle que le Site Builder).
export default function StudioPage() {
  // useSearchParams() doit être sous une frontière Suspense.
  return (
    <Suspense fallback={null}>
      <Studio />
    </Suspense>
  );
}

function Studio() {
  const t = useTranslations("studio");
  const tNav = useTranslations("dashboard.nav");
  // Arrivée depuis le Catalogue (« Envoyer dans le Studio IA ») : onglet Images produits, avec
  // le produit du catalogue ajouté à la liste.
  const params = useSearchParams();
  const produitCatalogue = params.get("catalogue");

  const [plan, setPlan] = useState<Plan | null>(null);
  const [planCharge, setPlanCharge] = useState(false);
  const [modeImage, setModeImage] = useState<ModeImage>(params.get("mode") === "produits" || produitCatalogue ? "produits" : "libre");
  const [actualisation, setActualisation] = useState(0);

  useEffect(() => {
    fetch("/api/plan")
      .then((res) => res.json())
      .then((json) => setPlan(json.plan ?? null))
      .catch(() => setPlan(null))
      .finally(() => setPlanCharge(true));
  }, []);

  const actualiser = () => setActualisation((valeur) => valeur + 1);

  function reglages() {
    if (!planCharge) return <p className="py-6 text-center text-sm text-[var(--text-faint)]">{t("chargement")}</p>;
    if (plan === null) return <p className="py-6 text-center text-sm text-[var(--text-faint)]">{tNav("abonnementRequis")} <Link href="/abonnement" className="underline">{tNav("choisirAbonnement")}</Link></p>;
    // Fonctions du Studio réservées aux plans payants (Pro, Agency, Expert) : sans plan payant,
    // une seule invitation, pour les deux onglets.
    if (!generationDisponible(plan)) {
      return (
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm text-[var(--text-muted)]">{t("reservePayant")}</p>
          <Link href="/abonnement" className={BOUTON_PRIMAIRE}>{t("passerPayant")}</Link>
        </div>
      );
    }
    if (modeImage === "produits") return <ImagesProduits plan={plan} onGenere={actualiser} produitCatalogue={produitCatalogue} />;
    return <GenerateurMedia plan={plan} onGenere={actualiser} referenceAutorisee />;
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 pb-16 pt-16 font-sans text-[var(--text-primary)]">
      <div className="mx-auto w-full max-w-6xl">
        <div className="mb-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-medium uppercase tracking-widest text-[var(--accent)]">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            {t("titre")}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("accroche")}</h1>
          <p className="mt-3 max-w-md text-sm text-[var(--text-muted)]">{t("sousTitre")}</p>
        </div>

        <div className="mb-8">
          <div role="tablist" aria-label={t("modeImage")} className={SELECTEUR}>
            {(["libre", "produits"] as const).map((valeur) => (
              <button key={valeur} type="button" role="tab" aria-selected={modeImage === valeur} onClick={() => setModeImage(valeur)} className={SELECTEUR_BOUTON(modeImage === valeur)}>
                {t(valeur === "libre" ? "modeLibre" : "modeProduits")}
              </button>
            ))}
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section aria-labelledby="studio-reglages" className={PANNEAU}>
            <h2 id="studio-reglages" className="text-sm font-semibold">{t("reglages")}</h2>
            {reglages()}
          </section>

          <section id="mediatheque" aria-labelledby="studio-mediatheque" className={PANNEAU}>
            <h2 id="studio-mediatheque" className="text-sm font-semibold">{t("mediatheque")}</h2>
            <MediathequeGrille actualisation={actualisation} />
          </section>
        </div>
      </div>
    </div>
  );
}
