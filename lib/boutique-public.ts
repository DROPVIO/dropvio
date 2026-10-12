import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";
import { fetchBoutiqueApi } from "@/lib/boutique-internal-fetch";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/locale";

// Données communes des pages publiques d'une boutique (/boutiques/[slug]/**), renvoyées par
// GET /api/boutiques/slug/[slug]. Le fetch est dédoublonné par Next.js pendant le rendu d'une
// même requête : layout, page et generateMetadata peuvent tous l'appeler.
export type BoutiquePublique = {
  id: string;
  nom: string;
  slug: string;
  description: string | null;
  theme: string | null;
  settings: Record<string, unknown> | null;
  mentions_legales: string | null;
  est_publique: boolean;
  langue: AppLocale;
};

export type CategoriePublique = { id: string; nom: string; slug: string };

export async function chargerBoutiquePublique(
  slug: string
): Promise<{ boutique: BoutiquePublique; categories: CategoriePublique[] } | null> {
  const baseUrl = await getBaseUrl();
  const res = await fetchBoutiqueApi(`${baseUrl}/api/boutiques/slug/${slug}`);
  if (!res.ok) return null;
  const json = (await res.json()) as { boutique: BoutiquePublique; categories: CategoriePublique[] };
  const langue = isAppLocale(json.boutique.langue) ? json.boutique.langue : DEFAULT_LOCALE;
  return { boutique: { ...json.boutique, langue }, categories: json.categories ?? [] };
}

// Traductions du namespace `boutique` dans la langue de la boutique, jamais celle du visiteur.
export function traductionsBoutique(langue: AppLocale) {
  return getTranslations({ locale: langue, namespace: "boutique" });
}

// URL publique absolue de la boutique (sous-domaine si NEXT_PUBLIC_ROOT_DOMAIN, sinon
// /boutiques/{slug} sur l'origine de l'app).
export async function urlAbsolueBoutique(slug: string): Promise<string> {
  const url = getBoutiquePublicUrl(slug);
  return url.startsWith("http") ? url : `${await getBaseUrl()}${url}`;
}

export function tronquer(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte;
}

const OG_LOCALE: Record<AppLocale, string> = { fr: "fr_FR", en: "en_US", es: "es_ES", it: "it_IT" };

// Métadonnées d'une page publique : titre et description dans la langue de la boutique,
// canonical, Open Graph. Une boutique privée (aperçu du propriétaire) n'est jamais indexée.
export function metadonneesBoutique(params: {
  boutique: BoutiquePublique;
  titre: string;
  description: string;
  canonical: string;
  indexable?: boolean;
}): Metadata {
  const { boutique, titre, description, canonical } = params;
  const indexable = boutique.est_publique && params.indexable !== false;
  return {
    title: titre,
    description,
    alternates: { canonical },
    openGraph: {
      title: titre,
      description,
      url: canonical,
      type: "website",
      siteName: boutique.nom,
      locale: OG_LOCALE[boutique.langue],
    },
    twitter: { card: "summary_large_image", title: titre, description },
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
  };
}

// Métadonnées d'une boutique introuvable (ou privée pour ce visiteur) : jamais indexée. La
// langue de la boutique est inconnue, celle du visiteur s'applique.
export async function metadonneesIntrouvable(): Promise<Metadata> {
  const t = await getTranslations("boutique.meta");
  return { title: t("introuvable"), robots: { index: false, follow: false } };
}
