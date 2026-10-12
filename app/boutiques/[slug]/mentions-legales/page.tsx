import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  chargerBoutiquePublique,
  metadonneesBoutique,
  metadonneesIntrouvable,
  traductionsBoutique,
  urlAbsolueBoutique,
} from "@/lib/boutique-public";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const donnees = await chargerBoutiquePublique(slug);
  if (!donnees) return metadonneesIntrouvable();
  const { boutique } = donnees;
  const t = await traductionsBoutique(boutique.langue);

  return metadonneesBoutique({
    boutique,
    titre: t("meta.mentionsTitre", { nom: boutique.nom }),
    description: t("meta.mentionsDescription", { nom: boutique.nom }),
    canonical: `${await urlAbsolueBoutique(slug)}/mentions-legales`,
  });
}

export default async function MentionsLegalesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const donnees = await chargerBoutiquePublique(slug);
  if (!donnees) {
    notFound();
  }
  const { boutique } = donnees;
  const t = await traductionsBoutique(boutique.langue);

  // Texte libre saisi par le vendeur, affiché tel quel (non traduit).
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-violet-300">{t("layout.mentions")}</p>
          <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)]">{boutique.nom}</h1>
          {boutique.mentions_legales?.trim() ? (
            <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-[var(--text-muted)]">
              {boutique.mentions_legales}
            </p>
          ) : (
            <p className="mt-6 text-sm text-[var(--text-faint)]">{t("mentions.vide")}</p>
          )}
        </div>
      </section>
    </main>
  );
}
