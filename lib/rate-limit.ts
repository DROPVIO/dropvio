type Bucket = { count: number; resetAt: number };

// Limiteur en mémoire, par instance de fonction serverless — best-effort seulement
// (pas de compteur partagé entre instances/cold starts). Utile en défense en profondeur
// derrière une vérification d'auth, pas comme seule protection anti-abus.
const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, options: { max: number; windowMs: number }): boolean {
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
