import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { getBaseUrl } from "@/lib/get-base-url";
import { isShopifyConfigured, isValidShopDomain, buildAuthorizeUrl } from "@/lib/shopify";

// Étape 1 du flux OAuth : redirige vers l'écran d'autorisation Shopify. Le domaine de
// boutique est fourni par l'utilisateur (formulaire "Connecter ma boutique Shopify"),
// on ne le devine jamais. L'utilisateur dropvio doit être connecté — le token récupéré
// au callback sera lié à son user_id.
export async function GET(request: NextRequest) {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json(
      { error: "Connecte-toi à ton compte dropvio avant de connecter Shopify." },
      { status: 401 }
    );
  }

  if (!isShopifyConfigured()) {
    return NextResponse.json(
      {
        error:
          "L'intégration Shopify n'est pas encore configurée côté serveur (SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET manquants).",
      },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const shop = (searchParams.get("shop") ?? "").trim().toLowerCase();
  const returnTo = searchParams.get("returnTo") ?? "/dashboard";

  if (!isValidShopDomain(shop)) {
    return NextResponse.json(
      { error: "Domaine de boutique invalide. Format attendu : ma-boutique.myshopify.com" },
      { status: 400 }
    );
  }

  const state = crypto.randomBytes(24).toString("hex");
  const baseUrl = await getBaseUrl();
  const redirectUri = `${baseUrl}/api/shopify/callback`;
  const authorizeUrl = buildAuthorizeUrl({ shop, state, redirectUri });

  const response = NextResponse.redirect(authorizeUrl);
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 min — largement suffisant pour le round-trip OAuth
  };
  response.cookies.set("shopify_oauth_state", state, cookieOptions);
  response.cookies.set("shopify_oauth_shop", shop, cookieOptions);
  response.cookies.set("shopify_oauth_return_to", returnTo, cookieOptions);
  return response;
}
