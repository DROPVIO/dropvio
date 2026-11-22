import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { erreurServeur } from "@/lib/api-errors";

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 Mo en entrée

const SLOT_CONFIG: Record<string, { width: number; quality: number }> = {
  hero:    { width: 1600, quality: 80 },
  galerie: { width: 1000, quality: 75 },
  avant:   { width: 1000, quality: 75 },
  apres:   { width: 1000, quality: 75 },
};

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest) {
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé", code: "auth_required" }, { status: 401 });
  }
  // Envoi vers un bucket public, avec traitement d'image côté serveur : plafonné pour éviter
  // qu'un compte ne s'en serve comme hébergement ou ne monopolise le CPU.
  if (!(await checkRateLimit(`upload-image:${user.id}`, { max: 60, windowMs: 3_600_000 }))) {
    return NextResponse.json({ error: "Trop d'envois en peu de temps. Réessayez dans quelques minutes.", code: "rate_limit" }, { status: 429 });
  }

  const form = await request.formData();
  const file = form.get("file");
  const slotRaw = String(form.get("slot") || "galerie");
  const slot = slotRaw in SLOT_CONFIG ? slotRaw : "galerie";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant", code: "file_missing" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Format non supporté — envoie une image (JPEG, PNG, WebP...)", code: "image_format" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image trop lourde (8 Mo max)", code: "image_too_large" }, { status: 400 });
  }

  try {
    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const config = SLOT_CONFIG[slot];

    const compressed = await sharp(inputBuffer)
      .rotate() // corrige l'orientation depuis les métadonnées EXIF
      .resize({ width: config.width, withoutEnlargement: true })
      .webp({ quality: config.quality })
      .toBuffer();

    const path = `${user.id}/${slot}-${Date.now()}.webp`;
    const admin = createSupabaseAdminClient();

    const { error: uploadError } = await admin.storage
      .from("site-images")
      .upload(path, compressed, { contentType: "image/webp", upsert: false });

    if (uploadError) {
      console.error("[upload-image] Erreur storage:", uploadError.message);
      return erreurServeur("api/upload-image", uploadError);
    }

    const { data } = admin.storage.from("site-images").getPublicUrl(path);

    return NextResponse.json({
      url: data.publicUrl,
      tailleAvant: inputBuffer.length,
      tailleApres: compressed.length,
    });
  } catch (err) {
    console.error("[upload-image] Erreur compression/upload:", err);
    return NextResponse.json({ error: "Erreur lors du traitement de l'image", code: "image_processing_failed" }, { status: 500 });
  }
}
