import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import ProductGrid from "@/app/components/boutique/ProductGrid";
import TestimonialsMarquee, { type Temoignage } from "@/app/components/boutique/TestimonialsMarquee";
import VideoCarousel from "@/app/components/boutique/VideoCarousel";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiqueBasePath } from "@/lib/boutique-links";
import { fetchBoutiqueApi } from "@/lib/boutique-internal-fetch";
import {
  chargerBoutiquePublique,
  metadonneesBoutique,
  metadonneesIntrouvable,
  traductionsBoutique,
  tronquer,
  urlAbsolueBoutique,
} from "@/lib/boutique-public";
import JsonLd from "@/app/components/boutique/JsonLd";
import { formatPrix } from "@/lib/boutique-format";

// Titre, description et données structurées dans la langue de la boutique (jamais celle du
// visiteur) ; une boutique privée (aperçu du propriétaire) n'est pas indexée.
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
    titre: boutique.nom,
    description: boutique.description?.trim()
      ? tronquer(boutique.description.trim(), 155)
      : t("meta.accueilDescription", { nom: boutique.nom }),
    canonical: await urlAbsolueBoutique(slug),
  });
}

type ProduitCarte = {
  id: string;
  nom: string;
  description: string | null;
  prix_vente: number;
  prix_original: number | null;
  image_urls: string[] | null;
  boutique_categories: { nom: string; slug: string } | null;
};

export default async function BoutiquePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const baseUrl = await getBaseUrl();

  const donnees = await chargerBoutiquePublique(slug);
  if (!donnees) {
    notFound();
  }
  const { boutique } = donnees;
  const urlBoutique = await urlAbsolueBoutique(slug);
  const t = await traductionsBoutique(boutique.langue);

  // La page d'accueil ne montre plus qu'un aperçu (bestsellers + spotlight) — le catalogue
  // complet avec filtres/recherche/pagination vit désormais sur /produits (voir ce fichier
  // pour la logique de tri commandes DESC : rang 1 = spotlight, rangs 2-4 = bestsellers,
  // jamais le même produit dans les deux).
  const [bestsellersRes, spotlightRes] = await Promise.all([
    fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}/produits?bestsellers=1`),
    fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}/produits?spotlight=1`),
  ]);
  const { products: bestsellers } = bestsellersRes.ok
    ? ((await bestsellersRes.json()) as { products: ProduitCarte[] })
    : { products: [] };
  const { products: spotlightResults } = spotlightRes.ok
    ? ((await spotlightRes.json()) as { products: ProduitCarte[] })
    : { products: [] };
  const spotlight = spotlightResults[0] ?? null;

  // Pas d'avis natifs côté Shopify (vérifié avant de construire ce composant : aucun scope
  // Admin API dédié, l'app officielle "Product Reviews" a fermé en mai 2024 — les avis
  // viennent aujourd'hui exclusivement d'apps tierces type Judge.me/Loox/Yotpo, chacune
  // avec sa propre API, distincte de l'intégration Shopify déjà en place). Reste
  // volontairement vide tant qu'aucune synchronisation réelle n'est branchée —
  // TestimonialsMarquee ne rend rien dans ce cas, jamais de faux avis affiché.
  const avis: Temoignage[] = [];

  const basePath = await getBoutiqueBasePath(slug);

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Store",
          name: boutique.nom,
          ...(boutique.description?.trim() && { description: boutique.description.trim() }),
          url: urlBoutique,
          inLanguage: boutique.langue,
          currenciesAccepted: "EUR",
        }}
      />
      {/* HERO — pleine largeur, accroche générique fixe (jamais boutique.description : le
          vrai texte de la boutique est l'exclusivité de la section "À propos" plus bas,
          pour ne pas recréer le doublon corrigé plus tôt ce soir). Dégradé en style inline
          plutôt qu'en classe Tailwind arbitraire : var(--x, var(--y)) imbriqué dans un
          crochet Tailwind ne compile jamais (bug constaté et corrigé ici même) — un style
          inline est évalué directement par le navigateur, sans passer par Tailwind. */}
      <section
        className="relative overflow-hidden border-b border-[var(--border)]"
        style={{
          backgroundImage:
            "linear-gradient(to bottom right, var(--boutique-palette-primary, var(--accent)), var(--boutique-palette-accent, var(--accent-secondary)))",
        }}
      >
        <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold text-white sm:text-5xl">{boutique.nom}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-white/90">{t("accueil.accroche")}</p>
          <Link
            href={`${basePath}/produits`}
            className="mt-8 inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-[var(--bg)] transition hover:scale-[1.03] hover:bg-white/90"
          >
            {t("accueil.voirProduits")}
          </Link>
        </div>
      </section>

      {/* RÉASSURANCE — bande fine pleine largeur, pas une carte de dashboard. Classe
          boutique-reassurance : seul emplacement où la couleur "secondaire" de la palette
          personnalisée s'applique (voir app/globals.css). */}
      <section className="boutique-reassurance border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 py-6 text-center text-sm text-[var(--text-muted)] sm:grid-cols-3 sm:px-6 lg:px-8">
          <div>{t("accueil.reassuranceLivraison")}</div>
          <div>{t("accueil.reassuranceRetour")}</div>
          <div>{t("accueil.reassuranceVerifiee")}</div>
        </div>
      </section>

      {/* À PROPOS — seule utilisation de boutique.description sur cette page (avant :
          dupliquée entre "Nos collections" et "À propos" ; ce soir, remplacée par une
          accroche fixe dans le hero pour éviter de recréer ce doublon). Bloc texte centré,
          sans bordure ni carte, même traitement visuel que le hero. */}
      <section id="a-propos" className="mx-auto max-w-3xl scroll-mt-24 px-4 py-16 text-center sm:px-6 lg:px-8">
        <p className="text-sm uppercase tracking-[0.3em] text-violet-300">{t("layout.aPropos")}</p>
        <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">{boutique.description || t("accueil.aProposDefaut", { nom: boutique.nom })}</p>
      </section>

      {/* BESTSELLERS — rangs 2 à 4 par commandes réelles (le rang 1 est le spotlight
          ci-dessous, jamais le même produit dans les deux sections). Absente si aucun
          produit n'a de donnée de commandes connue (import manuel, jamais lié au
          catalogue) — pas de "bestseller" arbitraire sans donnée réelle derrière. */}
      {bestsellers.length > 0 ? (
        <section id="bestsellers" className="mx-auto max-w-7xl scroll-mt-24 px-4 pt-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-[var(--text-primary)]">{t("accueil.bestsellers")}</h2>
          <div className="mt-6">
            <ProductGrid produits={bestsellers} basePath={basePath} langue={boutique.langue} emptyMessage={t("produitsVide")} />
          </div>
        </section>
      ) : null}

      {/* SPOTLIGHT — un seul produit mis en avant en détail (rang 1 par commandes), pas
          une grille. Pleine largeur, sans carte bordée — même esprit que le hero/à propos. */}
      {spotlight ? (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm uppercase tracking-[0.3em] text-violet-300">{t("accueil.produitPhare")}</p>
          <div className="mt-6 grid gap-8 md:grid-cols-2 md:items-center">
            <div className="relative aspect-square overflow-hidden rounded-2xl bg-[var(--surface-2)]">
              {spotlight.image_urls?.[0] ? (
                <Image
                  src={spotlight.image_urls[0]}
                  alt={spotlight.nom}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-5xl text-[var(--text-faint)]">🖼️</div>
              )}
            </div>
            <div>
              <h2 className="text-3xl font-bold text-[var(--text-primary)]">{spotlight.nom}</h2>
              <p className="mt-4 text-base leading-7 text-[var(--text-muted)]">
                {spotlight.description || t("produit.sansDescription")}
              </p>
              <div className="mt-6 flex items-center gap-3">
                <span className="price-tag text-2xl font-bold">{formatPrix(spotlight.prix_vente, boutique.langue)}</span>
                {spotlight.prix_original ? (
                  <span className="text-[var(--text-faint)] line-through">{formatPrix(spotlight.prix_original, boutique.langue)}</span>
                ) : null}
              </div>
              <Link
                href={`${basePath}/produits/${spotlight.id}`}
                className="mt-6 inline-block rounded-full bg-violet-500 px-6 py-3 text-sm font-semibold text-white transition hover:scale-[1.03] hover:bg-violet-400"
              >
                {t("accueil.voirProduit")}
              </Link>
            </div>
          </div>
        </section>
      ) : null}

      {/* VIDÉOS — juste après le spotlight (voir la vidéo du produit qu'on vient de
          présenter en détail), avant le renvoi vers le catalogue complet. Indépendant du
          bandeau texte défilant (SecondaryBanner, sous le header) depuis ce soir. */}
      <VideoCarousel
        videos={(boutique.settings as Record<string, unknown> | null)?.bandeauVideos as string[] | undefined}
        titreVideo={(numero) => t("accueil.titreVideo", { numero })}
      />

      {/* Le catalogue complet (filtres, recherche, pagination) vit sur /produits — la page
          d'accueil ne montre plus qu'un aperçu (bestsellers + spotlight ci-dessus). */}
      <section className="mx-auto max-w-7xl px-4 pb-16 text-center sm:px-6 lg:px-8">
        <Link
          href={`${basePath}/produits`}
          className="inline-block rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-6 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-400/60 hover:bg-violet-500/10"
        >
          {t("accueil.voirCatalogue")}
        </Link>
      </section>

      {/* AVIS CLIENTS — tout en bas de la page. Ne rend rien tant que `avis` est vide (voir
          plus haut) : pas de titre "Avis clients" ni de section orpheline sans donnée
          réelle derrière. */}
      <TestimonialsMarquee avis={avis} titre={t("accueil.avis")} />
    </main>
  );
}
