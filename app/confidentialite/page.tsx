import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = { title: "Politique de confidentialité — Dropvio" };

export default function ConfidentialitePage() {
  return (
    <LegalPageLayout eyebrow="Protection des données" title="Politique de confidentialité" updated="20 septembre 2026">
      <section>
        <p>
          Cette politique explique quelles données Dropvio collecte, pourquoi, et comment tu peux
          exercer tes droits, conformément au Règlement (UE) 2016/679 (RGPD).
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">1. Responsable de traitement</h2>
        <p>
          Le responsable du traitement des données est l&apos;éditeur de Dropvio identifié dans
          les <a href="/mentions-legales" className="text-[var(--accent)] hover:opacity-80">mentions légales</a>.
          Contact : <a href="mailto:legal@dropvio.com" className="text-[var(--accent)] hover:opacity-80">legal@dropvio.com</a>.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">2. Données collectées</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li><strong className="text-[var(--text-primary)]">Données de compte</strong> — email, mot de passe (chiffré), nom complet (facultatif).</li>
          <li><strong className="text-[var(--text-primary)]">Données d&apos;utilisation</strong> — produits consultés, simulations enregistrées, boutiques et sites créés, historique d&apos;utilisation des outils.</li>
          <li><strong className="text-[var(--text-primary)]">Données de facturation</strong> — gérées directement par Stripe ; Dropvio ne stocke jamais ton numéro de carte bancaire.</li>
          <li><strong className="text-[var(--text-primary)]">Contenus soumis aux outils IA</strong> — URL ou HTML que tu soumets pour audit, transmis à notre prestataire d&apos;intelligence artificielle pour générer l&apos;analyse demandée.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">3. Finalités et base légale</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li><strong className="text-[var(--text-primary)]">Exécution du contrat</strong> — gestion du compte, des abonnements, des boutiques et des outils.</li>
          <li><strong className="text-[var(--text-primary)]">Intérêt légitime</strong> — statistiques d&apos;usage agrégées pour améliorer le service.</li>
          <li><strong className="text-[var(--text-primary)]">Consentement</strong> — emails de suivi, uniquement si tu les as activés depuis Paramètres → Préférences.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">4. Durée de conservation</h2>
        <p>
          Les données de compte sont conservées tant que le compte est actif, puis supprimées ou
          anonymisées dans un délai raisonnable après une demande de suppression ou une
          inactivité prolongée. Les données de facturation sont conservées selon les obligations
          légales comptables applicables (10 ans).
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">5. Destinataires et sous-traitants</h2>
        <p>Tes données peuvent être transmises aux prestataires suivants, dans la stricte mesure nécessaire au fonctionnement du service :</p>
        <ul className="list-disc pl-5 mt-2 flex flex-col gap-1.5">
          <li><strong className="text-[var(--text-primary)]">Supabase Inc.</strong> — hébergement de la base de données.</li>
          <li><strong className="text-[var(--text-primary)]">Vercel Inc.</strong> — hébergement de l&apos;application.</li>
          <li><strong className="text-[var(--text-primary)]">Stripe Payments Europe, Ltd.</strong> — traitement des paiements.</li>
          <li><strong className="text-[var(--text-primary)]">Anthropic</strong> — traitement des demandes soumises aux outils d&apos;intelligence artificielle (audit de page).</li>
          <li><strong className="text-[var(--text-primary)]">Shopify Inc.</strong> — uniquement si tu connectes volontairement ta boutique Shopify.</li>
        </ul>
        <p className="mt-2">
          Certains de ces prestataires sont situés hors de l&apos;Union européenne (États-Unis) ;
          les transferts de données sont encadrés par leurs clauses contractuelles types
          respectives.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">6. Tes droits</h2>
        <p>
          Conformément au RGPD, tu disposes d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement, de limitation, d&apos;opposition et de portabilité sur tes données.
          Tu peux exercer ces droits en écrivant à{" "}
          <a href="mailto:legal@dropvio.com" className="text-[var(--accent)] hover:opacity-80">legal@dropvio.com</a>.
          Tu disposes également du droit d&apos;introduire une réclamation auprès de la CNIL
          (cnil.fr).
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">7. Cookies</h2>
        <p>
          Dropvio utilise un cookie technique (NEXT_LOCALE) pour mémoriser ta préférence de
          langue, ainsi que les cookies de session nécessaires à l&apos;authentification. Aucun
          cookie publicitaire ou de traçage tiers n&apos;est déposé par Dropvio lui-même.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">8. Contact</h2>
        <p>
          Pour toute question relative à tes données :{" "}
          <a href="mailto:legal@dropvio.com" className="text-[var(--accent)] hover:opacity-80">legal@dropvio.com</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
}
