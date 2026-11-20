import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Pas de routing par [locale]/ — createNextIntlPlugin() cherche par défaut ./i18n/request.ts,
// qui résout la langue via l'en-tête posé par middleware.ts (voir lib/locale.ts).
const withNextIntl = createNextIntlPlugin();

// Type dérivé de NextConfig plutôt qu'importé de next/dist/shared/lib/image-config :
// ce chemin interne n'est pas une API publique et change entre versions majeures.
type RemotePattern = NonNullable<NonNullable<NextConfig["images"]>["remotePatterns"]>[number];

/** Motif d'images du Storage Supabase, dérivé de NEXT_PUBLIC_SUPABASE_URL au lieu d'être codé
 *  en dur : changer de projet Supabase ne doit plus casser silencieusement l'affichage des
 *  images uploadées (bucket public, voir app/api/upload-image/route.ts) — le symptôme serait
 *  un 400 opaque de l'optimiseur Next, « hostname is not configured », sans rapport visible
 *  avec le changement de projet.
 *
 *  Variable absente : aucun motif ajouté plutôt qu'un build en échec. Ce fichier est chargé
 *  par des outils qui ne montent pas forcément l'environnement, et une app sans URL Supabase
 *  est de toute façon déjà cassée bien avant l'optimisation d'images.
 *
 *  Variable présente mais invalide : new URL() lève, et c'est voulu — mieux vaut un build qui
 *  s'arrête net qu'un motif silencieusement faux.
 *
 *  Le protocole est dérivé lui aussi, pour couvrir une instance Supabase locale en http. */
function motifStorageSupabase(): RemotePattern[] {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return [];

  const { protocol, hostname } = new URL(url);
  return [
    {
      protocol: protocol.replace(":", "") as "http" | "https",
      hostname,
      pathname: "/storage/v1/object/public/**",
    },
  ];
}

// En-têtes de sécurité sur toutes les réponses. frame-ancestors : l'app ne peut être affichée
// dans une iframe que par elle-même ou par l'admin Shopify (shopify.app.toml : embedded = true),
// ce qui bloque le clickjacking sans casser l'intégration Shopify.
const EN_TETES_SECURITE = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://admin.shopify.com https://*.myshopify.com" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: EN_TETES_SECURITE }];
  },
  images: {
    remotePatterns: [
      // Images produits AliExpress (Produits gagnants, alternatives) — plusieurs sous-domaines
      // (ae01, ae04...), d'où le wildcard. product_main_image_url (API Affiliate) pointe tantôt
      // vers alicdn.com (CDN historique), tantôt vers aliexpress-media.com (ex. ae-pic-a1, plus
      // récent) — les deux sont couverts.
      { protocol: "https", hostname: "*.alicdn.com" },
      { protocol: "https", hostname: "*.aliexpress-media.com" },
      // Images boutiques uploadées via app/api/upload-image/route.ts (Supabase Storage, bucket public).
      ...motifStorageSupabase(),
    ],
  },
};

export default withNextIntl(nextConfig);
