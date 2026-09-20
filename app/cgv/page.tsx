import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = { title: "Conditions générales de vente — Dropvio" };

export default function CgvPage() {
  return (
    <LegalPageLayout eyebrow="Conditions contractuelles" title="Conditions générales de vente" updated="20 septembre 2026">
      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">1. Objet</h2>
        <p>
          Les présentes conditions générales de vente (CGV) régissent l&apos;utilisation payante
          de la plateforme Dropvio, éditée par l&apos;auto-entrepreneur identifié dans les{" "}
          <a href="/mentions-legales" className="text-[var(--accent)] hover:opacity-80">mentions légales</a>,
          proposant des outils d&apos;aide au dropshipping (recherche de produits, calculateur de
          marge, générateur de site, audit de page).
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">2. Offres et tarifs</h2>
        <p>Dropvio propose trois formules d&apos;abonnement mensuel sans engagement :</p>
        <ul className="list-disc pl-5 mt-2 flex flex-col gap-1.5">
          <li><strong className="text-[var(--text-primary)]">Free</strong> — 0€/mois : accès limité aux fonctionnalités de base.</li>
          <li><strong className="text-[var(--text-primary)]">Pro</strong> — 29€/mois : accès complet aux outils Dropvio.</li>
          <li><strong className="text-[var(--text-primary)]">Agency</strong> — 59€/mois : comme Pro, avec un volume d&apos;utilisation plus élevé.</li>
        </ul>
        <p className="mt-2">
          Les tarifs sont indiqués toutes taxes comprises (TTC) en euros. Dropvio se réserve le
          droit de faire évoluer ses tarifs ; toute modification est annoncée avant son entrée en
          vigueur et ne s&apos;applique pas rétroactivement à une période déjà payée.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">3. Souscription et paiement</h2>
        <p>
          La souscription à une offre payante suppose la création d&apos;un compte et la
          fourniture d&apos;un moyen de paiement valide, traité par notre prestataire Stripe.
          Dropvio ne stocke jamais ton numéro de carte bancaire. Le prélèvement est mensuel, à la
          date anniversaire de la souscription.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">4. Durée et résiliation</h2>
        <p>
          Les abonnements sont sans engagement de durée. Tu peux résilier à tout moment depuis
          Paramètres → Facturation. La résiliation prend effet à la fin de la période déjà payée
          ; aucun remboursement au prorata n&apos;est effectué pour la période en cours, sauf
          disposition légale contraire.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">5. Droit de rétractation</h2>
        <p>
          Conformément à l&apos;article L221-28 13° du Code de la consommation, le droit de
          rétractation ne s&apos;applique pas aux contenus numériques fournis sur un support
          immatériel dont l&apos;exécution a commencé avec ton accord préalable exprès et ta
          renonciation expresse à ton droit de rétractation — ce que tu acceptes en souscrivant à
          une offre payante et en accédant immédiatement au service. En dehors de ce cas, tu
          disposes d&apos;un délai de 14 jours pour te rétracter, conformément à la loi.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">6. Responsabilité</h2>
        <p>
          Dropvio met à disposition des outils d&apos;aide à la décision (estimation de marge,
          suggestions de produits, audits automatisés) fournis à titre indicatif. Dropvio ne
          garantit ni la rentabilité d&apos;une activité, ni la disponibilité des produits tiers
          (AliExpress), ni l&apos;exactitude absolue des données affichées, qui peuvent évoluer
          indépendamment de la plateforme. Tu restes seul responsable de tes décisions
          commerciales et du respect de tes propres obligations légales et fiscales.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">7. Droit applicable et litiges</h2>
        <p>
          Les présentes CGV sont soumises au droit français. En cas de litige, une solution
          amiable sera recherchée en priorité en contactant{" "}
          <a href="mailto:legal@dropvio.com" className="text-[var(--accent)] hover:opacity-80">legal@dropvio.com</a>{" "}
          avant toute action judiciaire. À défaut d&apos;accord amiable, les tribunaux français
          compétents seront saisis, sous réserve des dispositions d&apos;ordre public applicables
          aux consommateurs.
        </p>
      </section>
    </LegalPageLayout>
  );
}
