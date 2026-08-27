import crypto from "crypto";

// Chiffrement symétrique générique pour les secrets stockés en base (ex: access_token
// Shopify dans shopify_connections.access_token_encrypted, voir 018_shopify_incidents_scopes.sql).
// AES-256-GCM : authentifié (empêche une modification silencieuse du blob chiffré en base).

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommandé pour GCM

// Lue à l'appel plutôt qu'au chargement du module — même raison que lib/aliexpress.ts :
// un script standalone qui charge dotenv après ses imports figerait sinon une clé vide.
function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY manquant dans l'environnement");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY doit décoder en 32 octets (AES-256) — génère-la avec `openssl rand -base64 32`."
    );
  }
  return key;
}

// Format stocké : "iv:tag:ciphertext", chaque segment en base64 — un seul champ texte en
// base, pas de colonnes séparées pour l'iv/le tag.
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Format de secret chiffré invalide");
  }
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
