import { ImageResponse } from "next/og";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getOrRenderOgImage, hashContent } from "@/lib/og-cache";

export const alt = "Image de la boutique";
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
          background: "#1a0533",
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

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const supabase = createSupabaseAdminClient();
    const { data: boutique } = await supabase
      .from("boutiques")
      .select("id, nom, description")
      .eq("slug", slug)
      .eq("est_publique", true)
      .maybeSingle();

    if (!boutique) {
      return fallbackImage("Boutique introuvable");
    }

    const description = (boutique.description ?? "").trim();
    const hash = hashContent([boutique.nom, description]);

    return await getOrRenderOgImage(`og/boutique/${boutique.id}/${hash}.png`, () =>
      new ImageResponse(
        (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(135deg, #1a0533, #7c3aed)",
              color: "white",
              padding: 80,
              textAlign: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 28,
                letterSpacing: 8,
                textTransform: "uppercase",
                opacity: 0.7,
              }}
            >
              Boutique
            </div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 700, marginTop: 24, maxWidth: 1000 }}>
              {boutique.nom}
            </div>
            {description && (
              <div style={{ display: "flex", fontSize: 28, marginTop: 24, opacity: 0.85, maxWidth: 900 }}>
                {description.slice(0, 140)}
              </div>
            )}
          </div>
        ),
        size
      )
    );
  } catch (err) {
    console.error("[opengraph-image boutique]", err);
    return fallbackImage("Boutique");
  }
}
