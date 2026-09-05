import { ImageResponse } from "next/og";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getOrRenderOgImage, hashContent } from "@/lib/og-cache";

export const alt = "Image du produit";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function fallbackImage(text: string) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07080e",
          color: "white",
          fontSize: 48,
        }}
      >
        {text}
      </div>
    ),
    size
  );
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string; produitId: string }>;
}) {
  const { slug, produitId } = await params;

  try {
    const supabase = createSupabaseAdminClient();
    const { data: boutique } = await supabase
      .from("boutiques")
      .select("id")
      .eq("slug", slug)
      .eq("est_publique", true)
      .maybeSingle();

    if (!boutique) {
      return fallbackImage("Boutique introuvable");
    }

    const { data: produit } = await supabase
      .from("boutique_produits")
      .select("id, nom, prix_vente, prix_original, image_urls")
      .eq("id", produitId)
      .eq("boutique_id", boutique.id)
      .maybeSingle();

    if (!produit) {
      return fallbackImage("Produit introuvable");
    }

    const imageUrl: string | null = produit.image_urls?.[0] ?? null;
    const hash = hashContent([produit.nom, produit.prix_vente, produit.prix_original, imageUrl]);

    return await getOrRenderOgImage(`og/produit/${produit.id}/${hash}.png`, () =>
      new ImageResponse(
        (
          <div style={{ width: "100%", height: "100%", display: "flex", background: "#07080e", color: "white" }}>
            <div
              style={{
                width: "45%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#0f1320",
              }}
            >
              {imageUrl ? (
                <img
                  src={imageUrl}
                  width={480}
                  height={480}
                  alt=""
                  style={{ objectFit: "cover", borderRadius: 24 }}
                />
              ) : (
                <div style={{ display: "flex", fontSize: 40, opacity: 0.4 }}>Pas d&apos;image</div>
              )}
            </div>
            <div
              style={{
                width: "55%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: 60,
              }}
            >
              <div style={{ display: "flex", fontSize: 52, fontWeight: 700 }}>{produit.nom.slice(0, 60)}</div>
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 28 }}>
                <div style={{ display: "flex", fontSize: 44, color: "#a78bfa", fontWeight: 700 }}>
                  {produit.prix_vente.toFixed(2)}€
                </div>
                {produit.prix_original && (
                  <div style={{ display: "flex", fontSize: 28, marginLeft: 16, opacity: 0.5, textDecoration: "line-through" }}>
                    {produit.prix_original.toFixed(2)}€
                  </div>
                )}
              </div>
            </div>
          </div>
        ),
        size
      )
    );
  } catch (err) {
    console.error("[opengraph-image produit]", err);
    return fallbackImage("Produit");
  }
}
