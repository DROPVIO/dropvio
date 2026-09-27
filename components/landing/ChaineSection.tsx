import Link from "next/link";

import ChaineIndex from "./ChaineIndex";
import TicketMarge from "./TicketMarge";
import FluxStatuts from "./FluxStatuts";

// Section « La chaîne » de la landing : les six capacités de Dropvio présentées comme les
// six étapes d'un même flux, en trois actes de rythmes différents (c'est ce qui évite
// l'effet grille). Aucune image : les visuels sont typographiques ou en CSS.
//
// Ce fichier ne porte pas "use client" — il ne contient que du balisage et du contenu.
// Toute l'interactivité est isolée dans ChaineIndex / TicketMarge / FluxStatuts.
// (Note : app/page.tsx est encore "use client", donc l'arbre est aujourd'hui rendu côté
// client en pratique ; la découpe reste valable si la page passe en composant serveur.)

export const CHAINE_STEPS = [
  { verbe: "TROUVER", titre: "Recherche produit" },
  { verbe: "CHIFFRER", titre: "Calcul de marge — mode France" },
  { verbe: "VÉRIFIER", titre: "Audit IA de la page de vente" },
  { verbe: "LANCER", titre: "Génération du site" },
  { verbe: "COMMANDER", titre: "Commande AliExpress" },
  { verbe: "LIVRER", titre: "Tracking poussé vers Shopify" },
] as const;

const ACTES = ["ACTE I — DÉCIDER", "ACTE II — VENDRE", "ACTE III — AUTOMATISER"] as const;

/** Étape de l'index : l'ordre du DOM sert de référence à ChaineIndex (data-chain-step). */
function StepHead({ index, verbe, titre }: { index: number; verbe: string; titre: string }) {
  return (
    <>
      <p className="ch-mono text-[11.5px] font-medium tracking-[0.18em] text-[var(--dv-accent)]">{verbe}</p>
      <h3 className="ch-display mt-2 text-[clamp(1.35rem,2.4vw,1.75rem)] font-semibold leading-[1.15] tracking-[-0.02em]">
        {titre}
      </h3>
      <span className="sr-only">{`Étape ${index + 1} sur 6`}</span>
    </>
  );
}

/** Repère carré sur la ligne verticale (jamais un cercle). */
function Marqueur() {
  return (
    <span
      aria-hidden
      className="absolute left-0 top-[9px] h-[7px] w-[7px] -translate-x-[3.5px] bg-[var(--dv-accent)]"
    />
  );
}

export default function ChaineSection() {
  return (
    <section
      id="fonctionnalites"
      aria-labelledby="chaine-titre"
      data-dv-chain
      className="dv-chain py-20 lg:py-32"
      /* Décalage d'ancre = hauteur de la nav sticky (--dv-nav-h dans globals.css) pour que
         le titre ne finisse pas masqué sous elle après un clic dans la nav. */
      style={{ scrollMarginTop: "var(--dv-nav-h)" }}
    >
      {/* ── En-tête ─────────────────────────────────────────────────── */}
      <div data-ch-reveal="" className="max-w-[46ch]">
        <p className="ch-mono text-[11.5px] font-medium uppercase tracking-[0.2em] text-[var(--ch-faint)]">
          De l&apos;idée au colis livré
        </p>
        <h2
          id="chaine-titre"
          className="ch-display mt-5 text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[0.98] tracking-[-0.035em]"
        >
          Six étapes.
          <br />
          Un seul outil.
        </h2>
        <p className="mt-6 max-w-[60ch] text-[16.5px] leading-[1.65] text-[var(--ch-muted)]">
          Dropvio couvre toute la chaîne du dropshipping, de la recherche produit au suivi client.
        </p>
      </div>

      <div className="mt-16 lg:mt-24 lg:grid lg:grid-cols-12 lg:gap-x-10">
        {/* ── Index sticky (desktop uniquement) ─────────────────────── */}
        <div className="hidden lg:col-span-4 lg:block">
          <ChaineIndex actes={[...ACTES]} steps={CHAINE_STEPS.map((s) => ({ verbe: s.verbe, titre: s.titre }))} />
        </div>

        {/* ── Colonne des étapes ────────────────────────────────────── */}
        <div className="lg:col-span-8">
          <ol className="list-none">
            {/* ─────────── ACTE I ─────────── */}
            <li data-chain-step="0" data-ch-acte="0" className="relative border-t border-[var(--ch-rule)] pl-4 pt-8 sm:pl-8 lg:pt-10">
              <span aria-hidden className="absolute bottom-0 left-0 top-0 w-px bg-[var(--ch-rule)]" />
              <Marqueur />
              <div data-ch-reveal="">
                <StepHead index={0} verbe={CHAINE_STEPS[0].verbe} titre={CHAINE_STEPS[0].titre} />
                <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.7] text-[var(--ch-muted)]">
                  Interrogez le catalogue AliExpress par niche, prix, délai de livraison et vendeur. Les produits sans
                  marge viable sont écartés avant même l&apos;analyse.
                </p>

                {/* Requête en mono, pas une carte UI */}
                <p className="ch-mono mt-6 text-[12.5px] leading-[2] text-[var(--ch-faint)]">
                  <span className="whitespace-nowrap">niche: maison</span>
                  <span className="mx-2 text-[var(--ch-rule-strong)]">·</span>
                  <span className="whitespace-nowrap">prix: 15–40 €</span>
                  <span className="mx-2 text-[var(--ch-rule-strong)]">·</span>
                  <span className="whitespace-nowrap">délai: &lt; 12 j</span>
                  <span className="mx-2 text-[var(--ch-rule-strong)]">·</span>
                  <span className="whitespace-nowrap">vendeur: ★ 4.7+</span>
                </p>
                <p className="ch-mono mt-3 text-[13px] tabular-nums text-[var(--ch-faint)]">
                  312 produits <span className="mx-1">→</span>
                  <span className="font-medium text-[var(--dv-accent)]">47 avec marge viable</span>
                </p>
              </div>
            </li>

            {/* CHIFFRER — feature héros, nettement plus haute */}
            <li
              data-chain-step="1"
              data-ch-acte="0"
              className="relative border-t border-[var(--ch-rule)] pl-4 pb-4 pt-8 sm:pl-8 lg:pb-10 lg:pt-14"
            >
              <span aria-hidden className="absolute bottom-0 left-0 top-0 w-px bg-[var(--ch-rule)]" />
              <Marqueur />
              <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-10">
                <div data-ch-reveal="">
                  <StepHead index={1} verbe={CHAINE_STEPS[1].verbe} titre={CHAINE_STEPS[1].titre} />
                  <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.7] text-[var(--ch-muted)]">
                    Cotisations URSSAF, TVA, taxes à l&apos;import UE et commissions Stripe déduites automatiquement.
                    Vous voyez la marge nette, pas la marge brute qui fait rêver.
                  </p>
                </div>
                <div className="mt-10 lg:mt-0">
                  <TicketMarge />
                </div>
              </div>
            </li>

            {/* ─────────── ACTE II — deux étapes côte à côte, 7/5 ─────────── */}
            <li data-chain-step="2" data-ch-acte="1" className="relative border-t border-[var(--ch-rule)] pl-4 pt-8 sm:pl-8 lg:pt-14">
              <span aria-hidden className="absolute bottom-0 left-0 top-0 w-px bg-[var(--ch-rule)]" />
              <Marqueur />
              <div className="lg:grid lg:grid-cols-12 lg:gap-10">
                {/* VÉRIFIER — score en typographie seule */}
                <div data-ch-reveal="" className="lg:col-span-7">
                  <StepHead index={2} verbe={CHAINE_STEPS[2].verbe} titre={CHAINE_STEPS[2].titre} />
                  <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.7] text-[var(--ch-muted)]">
                    Un score sur 100 et des correctifs classés par impact, appuyés sur les référentiels Nielsen Norman
                    Group, Unbounce et McKinsey.
                  </p>

                  <div className="mt-8 flex items-end gap-3">
                    <span className="ch-display text-[clamp(4.5rem,12vw,8rem)] font-semibold leading-[0.8] tracking-[-0.05em] tabular-nums">
                      64
                    </span>
                    <span className="ch-mono pb-2 text-[14px] text-[var(--ch-faint)]">/100</span>
                  </div>

                  <ul className="mt-7 max-w-[46ch] list-none">
                    {[
                      { l: "Ajouter des avis clients vérifiés", g: "+12" },
                      { l: "Remonter le prix au-dessus de la ligne de flottaison", g: "+7" },
                      { l: "Raccourcir le formulaire de commande", g: "+4" },
                    ].map((c) => (
                      <li
                        key={c.g}
                        className="flex items-baseline gap-4 border-b border-[var(--ch-rule)] py-2.5 last:border-b-0"
                      >
                        <span className="ch-mono w-[2.6rem] shrink-0 text-[13px] font-medium tabular-nums text-[var(--dv-accent)]">
                          {c.g}
                        </span>
                        <span className="text-[14.5px] leading-[1.5] text-[var(--ch-muted)]">{c.l}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* LANCER — 4 bandes de templates avec leur palette */}
                <div data-ch-reveal="" className="mt-12 lg:col-span-5 lg:mt-0">
                  <StepHead index={3} verbe={CHAINE_STEPS[3].verbe} titre={CHAINE_STEPS[3].titre} />
                  <p className="mt-4 max-w-[62ch] text-[15.5px] leading-[1.7] text-[var(--ch-muted)]">
                    Mono-produit ou boutique multi-produits : 4 templates, palettes personnalisables, textes de vente
                    pré-remplis. En quelques clics.
                  </p>

                  <ul className="mt-8 list-none">
                    {[
                      { nom: "Tech", couleurs: ["#16161d", "#22d3ee", "#7c3aed"] },
                      { nom: "Maison", couleurs: ["#faf7f2", "#c2703d", "#7c8f6e"] },
                      { nom: "Beauté", couleurs: ["#ffffff", "#ec4899", "#f5d0e3"] },
                      { nom: "Générique", couleurs: ["#f9fafb", "#2563eb", "#e5e7eb"] },
                    ].map((t) => (
                      <li
                        key={t.nom}
                        className="flex items-center justify-between border-b border-[var(--ch-rule)] py-3.5 last:border-b-0"
                      >
                        <span className="ch-mono text-[12.5px] uppercase tracking-[0.12em] text-[var(--ch-muted)]">
                          {t.nom}
                        </span>
                        <span className="flex gap-1.5" aria-hidden>
                          {t.couleurs.map((c) => (
                            <span
                              key={c}
                              className="h-[13px] w-[13px] border border-[var(--ch-rule-strong)]"
                              style={{ background: c }}
                            />
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>

            {/* ─────────── ACTE III — bande contrastée, un seul flux ─────────── */}
            <li data-chain-step="4" data-ch-acte="2" className="relative border-t border-[var(--ch-rule)] pl-4 pt-8 sm:pl-8 lg:pt-14">
              <span aria-hidden className="absolute bottom-0 left-0 top-0 w-px bg-[var(--ch-rule)]" />
              <Marqueur />
              <div data-ch-reveal="" className="bg-[var(--ch-raised)] p-6 sm:p-9">
                <p className="ch-mono text-[11.5px] font-medium tracking-[0.18em] text-[var(--dv-accent)]">
                  {CHAINE_STEPS[4].verbe} <span className="text-[var(--ch-faint)]">&amp;</span> {CHAINE_STEPS[5].verbe}
                </p>

                <FluxStatuts />

                <div className="mt-10 grid gap-8 border-t border-[var(--ch-rule)] pt-8 sm:grid-cols-2 sm:gap-10">
                  <div>
                    <h3 className="ch-display text-[clamp(1.2rem,2vw,1.5rem)] font-semibold leading-[1.2] tracking-[-0.02em]">
                      {CHAINE_STEPS[4].titre}
                      <span className="sr-only"> — étape 5 sur 6</span>
                    </h3>
                    <p className="mt-3 text-[15px] leading-[1.7] text-[var(--ch-muted)]">
                      Les commandes entrantes de votre boutique Shopify remontent dans Dropvio et sont préparées chez le
                      fournisseur, avec leur statut au même endroit.
                    </p>
                  </div>
                  <div data-chain-step="5" data-ch-acte="2">
                    <h3 className="ch-display text-[clamp(1.2rem,2vw,1.5rem)] font-semibold leading-[1.2] tracking-[-0.02em]">
                      {CHAINE_STEPS[5].titre}
                      <span className="sr-only"> — étape 6 sur 6</span>
                    </h3>
                    <p className="mt-3 text-[15px] leading-[1.7] text-[var(--ch-muted)]">
                      Dès que le numéro de suivi existe, il est envoyé automatiquement à Shopify. Le client est notifié,
                      votre SAV se vide.
                    </p>
                  </div>
                </div>
              </div>
            </li>
          </ol>

          {/* ── Fin de chaîne : une seule sortie ───────────────────────
              Même destination et même style que le CTA d'inscription du hero
              (app/page.tsx, /register). La ligne sous le bouton n'affirme que
              ce que le flux fait vraiment aujourd'hui : l'inscription ne demande
              aucune carte et il n'y a aucun engagement à résilier. */}
          <div className="border-t border-[var(--ch-rule)] pl-4 pt-10 sm:pl-8">
            <Link
              href="/register"
              className="dv-btn-primary inline-block rounded-2xl bg-[var(--dv-accent)] px-[26px] py-[15px] dv-display text-[16px] font-bold text-[var(--dv-accent-ink)] transition-colors duration-300"
            >
              Commencer gratuitement →
            </Link>
            <p className="ch-mono mt-4 text-[12px] tracking-[0.04em] text-[var(--ch-faint)]">
              Sans engagement · aucune carte requise
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
