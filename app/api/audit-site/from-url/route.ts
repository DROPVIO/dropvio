import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isUrlAllowed, normalizeUrl } from "@/lib/ssrf-guard";

const MAX_BYTES = 2 * 1024 * 1024; // 2 Mo — l'audit tronque de toute façon à 100 000 caractères
// (AUDIT_HTML_MAX_CHARS, lib/audit-config.ts), ce plafond n'existe que pour éviter de
// télécharger une réponse énorme avant d'en arriver là.
const FETCH_TIMEOUT_MS = 10_000;

// Récupère le HTML d'une URL fournie par l'utilisateur, protection SSRF identique au Spy
// concurrent (voir lib/ssrf-guard.ts). Ne fait aucun appel Claude et ne consomme pas le
// quota audit_ia — celui-ci n'est décompté que par /api/audit-site, au moment de l'analyse
// réelle, exactement comme pour le HTML collé à la main.
export async function POST(request: NextRequest) {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour utiliser cette fonctionnalité." }, { status: 401 });
  }

  if (!checkRateLimit(`audit-site-from-url:${user.id}`, { max: 10, windowMs: 60_000 })) {
    return NextResponse.json(
      { error: "Trop de requêtes. Réessaie dans une minute." },
      { status: 429 }
    );
  }

  const { url: rawUrl } = await request.json().catch(() => ({ url: null }));
  if (!rawUrl || typeof rawUrl !== "string") {
    return NextResponse.json({ error: "URL manquante." }, { status: 400 });
  }

  const url = normalizeUrl(rawUrl);
  if (!(await isUrlAllowed(url))) {
    return NextResponse.json({ error: "URL non autorisée." }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: controller.signal,
    });
  } catch {
    return NextResponse.json({ error: "Page inaccessible ou URL invalide." }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `Impossible d'accéder à cette page (HTTP ${res.status}).` },
      { status: 502 }
    );
  }

  if (!res.body) {
    return NextResponse.json({ error: "Réponse vide." }, { status: 502 });
  }

  // Lecture en flux plutôt que res.text() direct : on doit pouvoir couper avant MAX_BYTES
  // sans avoir déjà tout téléchargé (Content-Length n'est pas fiable/toujours présent).
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BYTES) {
      await reader.cancel().catch(() => {});
      return NextResponse.json(
        { error: "Cette page est trop volumineuse (> 2 Mo)." },
        { status: 413 }
      );
    }
    chunks.push(value);
  }

  const html = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf-8");

  if (html.trim().length < 50) {
    return NextResponse.json({ error: "Contenu HTML introuvable ou trop court sur cette page." }, { status: 422 });
  }

  return NextResponse.json({ html });
}
