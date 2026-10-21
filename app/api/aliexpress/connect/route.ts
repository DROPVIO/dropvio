import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/get-base-url";
import { isAliExpressOAuthConfigured, buildAuthorizeUrl } from "@/lib/aliexpress-oauth";

// Étape 1 du flux OAuth AliExpress (même schéma que /api/shopify/connect) : redirige vers
// l'écran d'autorisation AliExpress. L'utilisateur s'y authentifie directement chez
// AliExpress — Dropvio ne voit ni ne stocke jamais son mot de passe. Le token récupéré au
// callback sera lié à l'utilisateur Dropvio connecté.
export async function GET(request: NextRequest) {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json(
      { error: "Connecte-toi à ton compte dropvio avant de connecter AliExpress.", code: "auth_required" },
      { status: 401 }
    );
  }

  if (!isAliExpressOAuthConfigured()) {
    return NextResponse.json(
      {
        error: "L'intégration AliExpress n'est pas configurée côté serveur (ALIEXPRESS_APP_KEY / ALIEXPRESS_APP_SECRET manquants).",
        code: "aliexpress_not_configured",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const returnTo = searchParams.get("returnTo") ?? "/dashboard";

  const state = crypto.randomBytes(24).toString("hex");
  const baseUrl = await getBaseUrl();
  const authorizeUrl = buildAuthorizeUrl({ state, redirectUri: `${baseUrl}/api/aliexpress/callback` });

  const response = NextResponse.redirect(authorizeUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 min — largement suffisant pour le round-trip OAuth
  };
  response.cookies.set("aliexpress_oauth_state", state, cookieOptions);
  response.cookies.set("aliexpress_oauth_return_to", returnTo, cookieOptions);
  return response;
}
