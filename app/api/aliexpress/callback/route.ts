import { NextRequest, NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { exchangeCodeForToken, saveAliExpressTokens, type AliExpressTokenSet } from "@/lib/aliexpress-oauth";

const OAUTH_COOKIES = ["aliexpress_oauth_state", "aliexpress_oauth_return_to"];

// Étape 2 du flux OAuth AliExpress : AliExpress redirige ici avec ?code&state. On vérifie le
// state (CSRF, comparé au cookie posé par /connect) avant d'échanger le code contre les
// tokens, stockés chiffrés côté serveur (jamais renvoyés au client) et liés à l'utilisateur
// dropvio actuellement connecté.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code") ?? "";
  const state = searchParams.get("state") ?? "";

  const cookieState = request.cookies.get("aliexpress_oauth_state")?.value;
  const returnToCookie = request.cookies.get("aliexpress_oauth_return_to")?.value ?? "/dashboard";
  // Chemin interne uniquement : jamais de redirection vers un autre site après la connexion.
  const returnTo = returnToCookie.startsWith("/") && !returnToCookie.startsWith("//") ? returnToCookie : "/dashboard";

  // code = clé du namespace apiErrors, traduite à l'affichage (components/Sidebar.tsx).
  function fail(code: string) {
    const url = new URL(returnTo, request.url);
    url.searchParams.set("aliexpressError", code);
    const res = NextResponse.redirect(url);
    OAUTH_COOKIES.forEach((name) => res.cookies.delete(name));
    return res;
  }

  if (!code || !state) {
    return fail("aliexpress_oauth_refused");
  }
  if (!cookieState || state !== cookieState) {
    return fail("aliexpress_oauth_expired");
  }

  const { user } = await getServerUserAndPlan();
  if (!user) {
    return fail("aliexpress_oauth_session_expired");
  }

  let tokens: AliExpressTokenSet;
  try {
    tokens = await exchangeCodeForToken(code);
  } catch {
    return fail("aliexpress_oauth_exchange_failed");
  }

  const saveResult = await saveAliExpressTokens(user.id, tokens);
  if (!saveResult.ok) {
    return fail("aliexpress_oauth_save_failed");
  }

  const url = new URL(returnTo, request.url);
  url.searchParams.set("aliexpressConnected", "1");
  const res = NextResponse.redirect(url);
  OAUTH_COOKIES.forEach((name) => res.cookies.delete(name));
  return res;
}
