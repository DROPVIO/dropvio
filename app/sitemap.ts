import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// Un seul fichier suffit tant que le nombre total d'URLs (boutiques publiques + leurs
// produits) reste sous la limite de 50 000 imposée par Google — largement le cas au vu
// des plafonds actuels (200 produits/boutique max, cf. lib/plan-limits.ts). Si le
// catalogue grossit significativement, passer à generateSitemaps() pour paginer.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = await getBaseUrl();
  const supabase = createSupabaseAdminClient();

  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "monthly", priority: 1 },
  ];

  const { data: boutiques } = await supabase
    .from("boutiques")
    .select("id, slug, updated_at")
    .eq("est_publique", true);

  for (const boutique of boutiques ?? []) {
    const boutiqueUrl = getBoutiquePublicUrl(boutique.slug);
    const absoluteBoutiqueUrl = boutiqueUrl.startsWith("http") ? boutiqueUrl : `${baseUrl}${boutiqueUrl}`;

    entries.push({
      url: absoluteBoutiqueUrl,
      lastModified: boutique.updated_at ?? undefined,
      changeFrequency: "daily",
      priority: 0.8,
    });

    const { data: produits } = await supabase
      .from("boutique_produits")
      .select("id, updated_at")
      .eq("boutique_id", boutique.id);

    for (const produit of produits ?? []) {
      entries.push({
        url: `${absoluteBoutiqueUrl}/produits/${produit.id}`,
        lastModified: produit.updated_at ?? undefined,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }
  }

  return entries;
}
