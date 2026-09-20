import type { Metadata } from "next";
import LegalPageLayout from "@/components/LegalPageLayout";

export const metadata: Metadata = { title: "Mentions légales — Dropvio" };

// ⚠️ Champs d'identité de l'éditeur (nom, SIRET, adresse) volontairement laissés en
// placeholder plutôt qu'inventés — voir l'encart d'avertissement plus bas. Même convention
// que lib/site-templates.ts (mentionsLegalesModal) pour les boutiques générées.
export default function MentionsLegalesPage() {
  return (
    <LegalPageLayout eyebrow="Informations légales" title="Mentions légales" updated="20 septembre 2026">
      <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[13px] text-[var(--warning)]">
        ⚠️ Section « Éditeur du site » à compléter avant mise en production : nom ou raison
        sociale, numéro SIRET et adresse du siège de l&apos;auto-entrepreneur éditeur de
        Dropvio ne sont pas encore renseignés ici.
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">1. Éditeur du site</h2>
        <p>
          Dropvio est édité par [nom ou raison sociale à compléter], auto-entrepreneur
          (micro-entreprise) immatriculé en France sous le numéro SIRET [à compléter], domicilié
          à [adresse à compléter].
        </p>
        <p className="mt-2">
          Directeur de la publication : [nom à compléter] — Contact :{" "}
          <a href="mailto:legal@dropvio.com" className="text-[var(--accent)] hover:opacity-80">legal@dropvio.com</a>.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">2. Hébergement</h2>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>Application hébergée par <strong className="text-[var(--text-primary)]">Vercel Inc.</strong> — voir vercel.com/legal/privacy-policy.</li>
          <li>Base de données hébergée par <strong className="text-[var(--text-primary)]">Supabase Inc.</strong> — voir supabase.com/privacy.</li>
          <li>Paiements traités par <strong className="text-[var(--text-primary)]">Stripe Payments Europe, Ltd.</strong> — voir stripe.com/fr/privacy.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">3. Propriété intellectuelle</h2>
        <p>
          L&apos;ensemble des éléments composant Dropvio (structure, textes, logos, interface,
          code source) est protégé par le droit de la propriété intellectuelle. Toute
          reproduction non autorisée est interdite, à l&apos;exception des contenus que tu
          génères toi-même via l&apos;outil (boutiques, textes produits, sites générés), qui
          restent ta propriété.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold text-[var(--text-primary)]">4. Contact</h2>
        <p>
          Pour toute question relative au site :{" "}
          <a href="mailto:legal@dropvio.com" className="text-[var(--accent)] hover:opacity-80">legal@dropvio.com</a>.
        </p>
      </section>
    </LegalPageLayout>
  );
}
