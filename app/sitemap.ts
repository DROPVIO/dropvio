import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/get-base-url";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// Un seul fichier suffit tant que le nombre total d'URLs (boutiques publiques + leurs
// produits et collections) reste sous la limite de 50 000 imposée par Google — largement le
// cas au vu des plafonds actuels (200 produits/boutique max, cf. lib/plan-limits.ts). Si le
// catalogue grossit significativement, passer à generateSitemaps() pour paginer.
// Seules les boutiques publiques (est_publique) y figurent : une boutique privée n'est
// visible que de son propriétaire.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = await getBaseUrl();
  const supabase = createSupabaseAdminClient();

  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "monthly", priority: 1 },
    { url: `${baseUrl}/faq`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/boutiques`, changeFrequency: "daily", priority: 0.5 },
    { url: `${baseUrl}/cgv`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/confidentialite`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${baseUrl}/mentions-legales`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const { data: boutiques } = await supabase
    .from("boutiques")
    .select("id, slug, updated_at")
    .eq("est_publique", true);
  if (!boutiques || boutiques.length === 0) return entries;

  const ids = boutiques.map((b) => b.id);
  const [{ data: produits }, { data: categories }] = await Promise.all([
    supabase.from("boutique_produits").select("id, boutique_id, updated_at").in("boutique_id", ids),
    supabase.from("boutique_categories").select("slug, boutique_id, updated_at").in("boutique_id", ids),
  ]);

  for (const boutique of boutiques) {
    const boutiqueUrl = getBoutiquePublicUrl(boutique.slug);
    const absoluteBoutiqueUrl = boutiqueUrl.startsWith("http") ? boutiqueUrl : `${baseUrl}${boutiqueUrl}`;

    entries.push(
      {
        url: absoluteBoutiqueUrl,
        lastModified: boutique.updated_at ?? undefined,
        changeFrequency: "daily",
        priority: 0.8,
      },
      {
        url: `${absoluteBoutiqueUrl}/produits`,
        lastModified: boutique.updated_at ?? undefined,
        changeFrequency: "daily",
        priority: 0.7,
      }
    );

    for (const categorie of categories ?? []) {
      if (categorie.boutique_id !== boutique.id) continue;
      entries.push({
        url: `${absoluteBoutiqueUrl}/collections/${categorie.slug}`,
        lastModified: categorie.updated_at ?? undefined,
        changeFrequency: "weekly",
        priority: 0.6,
      });
    }

    for (const produit of produits ?? []) {
      if (produit.boutique_id !== boutique.id) continue;
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
