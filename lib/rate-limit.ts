import { createSupabaseAdminClient } from "@/lib/supabase-admin";

type Bucket = { count: number; resetAt: number };

// Limiteur à deux niveaux :
// 1. en mémoire, par instance de fonction serverless : coupe tout de suite les rafales sans
//    aller en base ;
// 2. compteur partagé en base (fonction SQL rate_limit_consommer, migration 056), atomique et
//    commun à toutes les instances Vercel : c'est lui qui fait foi.
// Base indisponible ou migration 056 absente : seul le niveau 1 s'applique (comportement
// d'avant), pour ne jamais bloquer toute l'app sur une panne du limiteur.
const buckets = new Map<string, Bucket>();
const OBJET_ABSENT = new Set(["42883", "PGRST202", "42P01"]);
let migrationAbsenteSignalee = false;

function checkMemoire(key: string, options: { max: number; windowMs: number }): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return true;
  }

  if (bucket.count >= options.max) {
    return false;
  }

  bucket.count += 1;
  return true;
}

export async function checkRateLimit(key: string, options: { max: number; windowMs: number }): Promise<boolean> {
  if (!checkMemoire(key, options)) return false;

  try {
    const { data, error } = await createSupabaseAdminClient().rpc("rate_limit_consommer", {
      p_cle: key,
      p_max: options.max,
      p_fenetre_ms: options.windowMs,
    });
    if (error) {
      if (OBJET_ABSENT.has(error.code)) {
        if (!migrationAbsenteSignalee) {
          console.warn("[rate-limit] Limiteur partagé indisponible : applique la migration 056_rate_limit_partage.sql.");
          migrationAbsenteSignalee = true;
        }
      } else {
        console.error("[rate-limit] Compteur partagé illisible :", error.message);
      }
      return true;
    }
    return data === true;
  } catch (err) {
    console.error("[rate-limit] Compteur partagé indisponible :", err instanceof Error ? err.message : err);
    return true;
  }
}
