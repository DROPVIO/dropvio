import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      // Images produits AliExpress (Produits gagnants, alternatives) — plusieurs sous-domaines
      // (ae01, ae04...), d'où le wildcard.
      { protocol: "https", hostname: "*.alicdn.com" },
      // Images boutiques uploadées via app/api/upload-image/route.ts (Supabase Storage, bucket public).
      { protocol: "https", hostname: "mnwdvkkbzymscnpwmabs.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;
