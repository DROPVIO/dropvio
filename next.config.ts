import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Pas de routing par [locale]/ — createNextIntlPlugin() cherche par défaut ./i18n/request.ts,
// qui résout la langue via l'en-tête posé par middleware.ts (voir lib/locale.ts).
const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Images produits AliExpress (Produits gagnants, alternatives) — plusieurs sous-domaines
      // (ae01, ae04...), d'où le wildcard. product_main_image_url (API Affiliate) pointe tantôt
      // vers alicdn.com (CDN historique), tantôt vers aliexpress-media.com (ex. ae-pic-a1, plus
      // récent) — les deux sont couverts.
      { protocol: "https", hostname: "*.alicdn.com" },
      { protocol: "https", hostname: "*.aliexpress-media.com" },
      // Images boutiques uploadées via app/api/upload-image/route.ts (Supabase Storage, bucket public).
      { protocol: "https", hostname: "mnwdvkkbzymscnpwmabs.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default withNextIntl(nextConfig);
