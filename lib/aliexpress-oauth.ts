import crypto from "crypto";
import { createSupabaseAdminClient } from "./supabase-admin";
import { encryptSecret, decryptSecret } from "./crypto";

// OAuth AliExpress Open Platform : chaque utilisateur Dropvio connecte SON compte AliExpress,
// le token obtenu sert aux API Dropshipping (aliexpress.ds.*) qui l'exigent. Même principe que
// lib/shopify.ts : les tokens ne sont jamais renvoyés au client, toujours chiffrés en base
// (aliexpress_tokens, voir 037_aliexpress_tokens.sql), lus/écrits via le service role.
// Dropvio ne voit jamais le mot de passe AliExpress : l'utilisateur s'authentifie sur
// l'écran d'autorisation d'AliExpress, qui nous renvoie seulement un code à usage unique.

const AUTHORIZE_URL = "https://api-sg.aliexpress.com/oauth/authorize";
const SYSTEM_API_URL = "https://api-sg.aliexpress.com/rest";
// Rafraîchit un peu avant l'expiration réelle, pour ne pas envoyer un token qui expire pendant l'appel.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

function getCredentials(): { appKey: string; appSecret: string } {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const appSecret = process.env.ALIEXPRESS_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error("ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET manquants dans l'environnement");
  }
  return { appKey, appSecret };
}

export function isAliExpressOAuthConfigured(): boolean {
  return Boolean(process.env.ALIEXPRESS_APP_KEY && process.env.ALIEXPRESS_APP_SECRET);
}

// redirectUri doit correspondre exactement à la Callback URL déclarée dans la console de
// l'app sur open.aliexpress.com, sinon AliExpress refuse l'autorisation.
export function buildAuthorizeUrl(params: { state: string; redirectUri: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("force_auth", "true");
  url.searchParams.set("client_id", getCredentials().appKey);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export type AliExpressTokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

export class AliExpressOAuthError extends Error {
  constructor(message: string, public code: string) {
    super(message);
  }
}

// API « System Interface » (/auth/token/*) : signature différente des API métier de
// lib/aliexpress.ts — HMAC-SHA256 avec l'App Secret sur chemin de l'API + paires clé/valeur
// triées, timestamp en millisecondes.
async function callSystemApi(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const { appKey, appSecret } = getCredentials();
  const allParams: Record<string, string> = {
    app_key: appKey,
    timestamp: String(Date.now()),
    sign_method: "sha256",
    ...params,
  };
  let signStr = path;
  for (const key of Object.keys(allParams).sort()) signStr += key + allParams[key];
  allParams.sign = crypto.createHmac("sha256", appSecret).update(signStr).digest("hex").toUpperCase();

  const res = await fetch(`${SYSTEM_API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(allParams),
  });
  return res.json();
}

// Réponse en succès : code "0" + access_token, refresh_token et expire_time (epoch en ms) ;
// expires_in (secondes) en repli si expire_time manque.
function parseTokenResponse(data: Record<string, unknown>): AliExpressTokenSet {
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  if (String(data.code ?? "0") !== "0" || typeof accessToken !== "string" || typeof refreshToken !== "string") {
    throw new AliExpressOAuthError(
      typeof data.message === "string" ? data.message : "Réponse token AliExpress invalide",
      typeof data.code === "string" ? data.code : "unknown"
    );
  }
  const expireTime = Number(data.expire_time);
  const expiresIn = Number(data.expires_in);
  const expiresAt = Number.isFinite(expireTime) && expireTime > 0
    ? new Date(expireTime)
    : new Date(Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn * 1000 : 0));
  return { accessToken, refreshToken, expiresAt };
}

export async function exchangeCodeForToken(code: string): Promise<AliExpressTokenSet> {
  return parseTokenResponse(await callSystemApi("/auth/token/create", { code }));
}

export async function refreshToken(refreshTokenValue: string): Promise<AliExpressTokenSet> {
  return parseTokenResponse(await callSystemApi("/auth/token/refresh", { refresh_token: refreshTokenValue }));
}

// Point d'entrée unique pour écrire dans aliexpress_tokens : jamais de token en clair en base.
export async function saveAliExpressTokens(
  userId: string,
  tokens: AliExpressTokenSet
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin.from("aliexpress_tokens").upsert(
    {
      user_id: userId,
      access_token_chiffre: encryptSecret(tokens.accessToken),
      refresh_token_chiffre: encryptSecret(tokens.refreshToken),
      expire_le: tokens.expiresAt.toISOString(),
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Token utilisable pour les API Dropshipping, rafraîchi au besoin. null = pas de connexion,
// ou refresh refusé (refresh_token expiré, accès révoqué côté AliExpress) : l'utilisateur doit
// se reconnecter depuis les paramètres. Ne lève jamais d'erreur vers l'appelant.
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("aliexpress_tokens")
    .select("access_token_chiffre, refresh_token_chiffre, expire_le")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data?.access_token_chiffre) return null;

  try {
    const expireLe = data.expire_le ? new Date(data.expire_le).getTime() : 0;
    if (expireLe - EXPIRY_MARGIN_MS > Date.now()) {
      return decryptSecret(data.access_token_chiffre);
    }
    if (!data.refresh_token_chiffre) return null;

    const tokens = await refreshToken(decryptSecret(data.refresh_token_chiffre));
    const saved = await saveAliExpressTokens(userId, tokens);
    if (!saved.ok) {
      console.warn("[aliexpress-oauth] Token rafraîchi mais non enregistré :", saved.error);
    }
    return tokens.accessToken;
  } catch (err) {
    console.warn("[aliexpress-oauth] Rafraîchissement du token impossible :", err);
    return null;
  }
}
