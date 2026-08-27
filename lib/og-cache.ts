import crypto from "crypto";
import type { ImageResponse } from "next/og";
import { createSupabaseAdminClient } from "./supabase-admin";

// Cache des images Open Graph générées dynamiquement (boutique/produit), sur le même
// bucket public que le reste des images de l'app (voir 007_storage_site_images.sql).
// Réutilise le pattern déjà établi dans app/api/upload-image/route.ts (upload via le
// client admin, URL publique via getPublicUrl).
const BUCKET = "site-images";

// Hash de contenu court à partir des champs qui changent visuellement l'image (nom, prix,
// image produit...) — sert de nom de fichier : tant que ces champs ne changent pas, le
// même hash pointe vers la même image déjà générée, donc plus jamais régénérée. Dès qu'un
// champ change (ex: prix mis à jour), le hash change -> nouveau fichier -> régénération
// automatique, sans jamais nettoyer/invalider explicitement l'ancien cache.
export function hashContent(parts: Array<string | number | null | undefined>): string {
  return crypto.createHash("sha256").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex").slice(0, 16);
}

// Sert l'image en cache pour `storagePath` si elle existe déjà ; sinon génère via
// `render()`, l'upload dans Supabase Storage pour les prochaines requêtes, puis la
// renvoie. `storagePath` doit intégrer le hash de contenu (cf. hashContent ci-dessus).
export async function getOrRenderOgImage(
  storagePath: string,
  render: () => ImageResponse
): Promise<Response> {
  const admin = createSupabaseAdminClient();
  const lastSlash = storagePath.lastIndexOf("/");
  const dir = lastSlash === -1 ? "" : storagePath.slice(0, lastSlash);
  const filename = lastSlash === -1 ? storagePath : storagePath.slice(lastSlash + 1);

  const { data: existing } = await admin.storage.from(BUCKET).list(dir, { search: filename, limit: 1 });
  if (existing && existing.length > 0) {
    const { data } = admin.storage.from(BUCKET).getPublicUrl(storagePath);
    return Response.redirect(data.publicUrl, 302);
  }

  const rendered = render();
  const buffer = Buffer.from(await rendered.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: "image/png", upsert: true });
  if (uploadError) {
    // Pas bloquant : l'image générée est quand même renvoyée à l'appelant, juste sans
    // être mise en cache pour la prochaine requête.
    console.error("[og-cache] upload échoué, image renvoyée sans mise en cache:", uploadError.message);
  }

  return new Response(buffer, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
