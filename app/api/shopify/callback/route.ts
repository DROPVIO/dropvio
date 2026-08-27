import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/get-base-url";
import {
  isValidShopDomain,
  verifyShopifyHmac,
  exchangeCodeForToken,
  shopifyFetch,
  saveShopifyConnection,
  registerShopifyWebhooks,
} from "@/lib/shopify";

const OAUTH_COOKIES = ["shopify_oauth_state", "shopify_oauth_shop", "shopify_oauth_return_to"];

// Étape 2 du flux OAuth : Shopify redirige ici avec ?shop&code&state&hmac. On vérifie
// le state (CSRF, comparé au cookie posé par /connect) puis la signature hmac (garantit
// que la requête vient bien de Shopify) avant d'échanger le code contre un access_token,
// qu'on stocke côté serveur (service role, jamais renvoyé au client) lié à l'utilisateur
// dropvio actuellement connecté.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const shop = searchParams.get("shop") ?? "";
  const code = searchParams.get("code") ?? "";
  const state = searchParams.get("state") ?? "";

  const cookieState = request.cookies.get("shopify_oauth_state")?.value;
  const cookieShop = request.cookies.get("shopify_oauth_shop")?.value;
  const returnTo = request.cookies.get("shopify_oauth_return_to")?.value ?? "/dashboard";

  function fail(message: string) {
    const url = new URL(returnTo, request.url);
    url.searchParams.set("shopifyError", message);
    const res = NextResponse.redirect(url);
    OAUTH_COOKIES.forEach((name) => res.cookies.delete(name));
    return res;
  }

  if (!shop || !code || !state || !isValidShopDomain(shop)) {
    return fail("Réponse Shopify invalide.");
  }
  if (!cookieState || state !== cookieState || !cookieShop || shop !== cookieShop) {
    return fail("La demande de connexion Shopify a expiré ou est invalide. Réessaie.");
  }
  if (!verifyShopifyHmac(searchParams)) {
    return fail("Signature Shopify invalide — connexion refusée par sécurité.");
  }

  const { user } = await getServerUserAndPlan();
  if (!user) {
    return fail("Ta session dropvio a expiré pendant la connexion Shopify. Reconnecte-toi puis réessaie.");
  }

  let accessToken: string;
  let scope: string;
  try {
    const tokenRes = await exchangeCodeForToken(shop, code);
    accessToken = tokenRes.access_token;
    scope = tokenRes.scope;
  } catch {
    return fail("Impossible d'échanger le code d'autorisation avec Shopify. Réessaie.");
  }

  let shopName: string | null = null;
  try {
    const shopInfo = await shopifyFetch<{ shop?: { name?: string } }>(shop, accessToken, "/shop.json");
    shopName = shopInfo?.shop?.name ?? null;
  } catch {
    // best-effort seulement : la connexion reste valide même si /shop.json échoue
  }

  const saveResult = await saveShopifyConnection({ userId: user.id, shop, shopName, accessToken, scope });
  if (!saveResult.ok) {
    return fail("Impossible d'enregistrer la connexion Shopify. Réessaie.");
  }

  // Best-effort : un échec d'enregistrement webhook ne doit pas faire échouer toute la
  // connexion (la réconciliation périodique rattrape les données même sans webhook actif).
  const baseUrl = await getBaseUrl();
  await registerShopifyWebhooks(shop, accessToken, `${baseUrl}/api/webhooks/shopify`, saveResult.disputesGranted);

  const url = new URL(returnTo, request.url);
  url.searchParams.set("shopifyConnected", "1");
  const res = NextResponse.redirect(url);
  OAUTH_COOKIES.forEach((name) => res.cookies.delete(name));
  return res;
}
