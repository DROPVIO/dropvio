import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { resolveBoutiqueSlugFromHost } from "@/lib/boutique-subdomains";
import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_HEADER, isAppLocale, type AppLocale } from "@/lib/locale";
import { planEffectif } from "@/lib/plan-effectif";

// /formation est une page de vente publique (achat unique par formation) — le contrôle
// d'accès réel se joue sur /api/formation/checkout, pas ici.
const PROTECTED_PATHS = ["/studio", "/quota", "/produits-gagnants", "/site-builder", "/mes-sites", "/dashboard", "/audit", "/tools/calculateur-marge", "/ventes"];

// Page de choix du plan : connexion requise, mais pas d'abonnement (c'est là qu'on en prend un).
const ABONNEMENT_PATH = "/abonnement";

function parseAcceptLanguage(header: string | null): AppLocale {
  if (!header) return DEFAULT_LOCALE;
  const langs = header
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .filter((v): v is string => Boolean(v));
  for (const lang of langs) {
    // Découpe sur "-" pour matcher la variante régionale sur son code de base
    // (es-MX, es-ES -> es ; it-CH, it-IT -> it ; etc.).
    const base = lang.split("-")[0];
    if (isAppLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}

// Cookie NEXT_LOCALE > Accept-Language (fr/en/es/it, fallback fr) > profils.langue si
// l'utilisateur est connecté (préférence explicite enregistrée depuis Paramètres >
// Préférences, migration 034) — cette dernière prime sur les deux premières.
function resolveLocale(request: NextRequest, profil: { langue?: string | null } | null): AppLocale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = isAppLocale(cookieLocale)
    ? cookieLocale
    : parseAcceptLanguage(request.headers.get("accept-language"));

  return isAppLocale(profil?.langue) ? profil.langue : locale;
}

// Une seule lecture de profils par requête, partagée entre la langue et la garde d'abonnement.
async function readProfil(supabase: SupabaseClient, user: User | null) {
  if (!user) return null;
  const { data } = await supabase.from("profils").select("langue, plan").eq("id", user.id).maybeSingle();
  const profil = data as { langue: string | null; plan: string | null } | null;
  // Même règle que resolvePlan (lib/supabase-server.ts) et que la fonction SQL a_un_plan_payant :
  // « expert » sans période payée en cours ne donne aucun droit, le compte n'a alors aucun plan.
  if (profil?.plan === "expert") {
    const { data: periodes } = await supabase
      .from("expert_periodes")
      .select("id")
      .eq("user_id", user.id)
      .gt("periode_fin", new Date().toISOString())
      .limit(1);
    return { ...profil, plan: planEffectif(profil.plan, Boolean(periodes?.length)) };
  }
  return profil ? { ...profil, plan: planEffectif(profil.plan, false) } : null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // sitemap.xml et robots.txt sont générés à la racine (app/sitemap.ts, app/robots.ts) et
  // doivent rester joignables tels quels quel que soit le host — sans ce court-circuit, le
  // rewrite par sous-domaine ci-dessous les réécrirait en /boutiques/{slug}/sitemap.xml
  // (inexistant) dès qu'on les demande depuis le sous-domaine d'une boutique.
  if (pathname === "/sitemap.xml" || pathname === "/robots.txt") {
    return NextResponse.next();
  }

  // Routage par sous-domaine de boutique ({slug}.ROOT_DOMAIN -> /boutiques/{slug}/...).
  // No-op tant que NEXT_PUBLIC_ROOT_DOMAIN n'est pas configuré (aucun domaine acheté) :
  // resolveBoutiqueSlugFromHost renvoie alors toujours null. Les boutiques (storefronts
  // publics) sont hors périmètre i18n de l'app — pas de résolution de langue ici, on
  // court-circuite avant.
  const boutiqueSlug = resolveBoutiqueSlugFromHost(
    request.headers.get("host"),
    process.env.NEXT_PUBLIC_ROOT_DOMAIN
  );

  if (boutiqueSlug) {
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/boutiques/${boutiqueSlug}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(rewriteUrl);
  }

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  // Cookies à réémettre sur la réponse (rafraîchissement de session Supabase) — collectées
  // plutôt qu'appliquées au fur et à mesure, pour ne construire la réponse finale qu'une
  // seule fois, avec à la fois ces cookies ET l'en-tête de langue posé plus bas.
  const cookiesToApply: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToApply.push(...cookiesToSet);
        },
      },
    }
  );

  // Résolu une seule fois, réutilisé à la fois pour la garde d'accès ci-dessous et pour la
  // priorité profils.langue dans resolveLocale(). hasAuthCookie évite l'appel réseau
  // getUser() (mesuré 125-195ms ailleurs dans ce repo, voir lib/supabase-server.ts) pour un
  // visiteur anonyme qui n'a jamais eu de session — cas de loin le plus fréquent sur les
  // pages publiques (marketing, login, register...) désormais aussi couvertes par ce
  // middleware pour la résolution de langue.
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  const { data: { user } } = hasAuthCookie ? await supabase.auth.getUser() : { data: { user: null } };

  const needsLogin = isProtected || pathname.startsWith(ABONNEMENT_PATH);
  if (needsLogin && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  const profil = await readProfil(supabase, user);

  // Les outils (PROTECTED_PATHS) demandent un abonnement actif ou en essai : un compte connecté
  // sans plan (jamais abonné, essai terminé sans paiement, abonnement résilié ou impayé, Expert
  // sans période en cours) est renvoyé vers /abonnement, pas vers /login. Profil absent = ligne
  // pas encore créée (022) : même traitement.
  if (user && isProtected && !profil?.plan) {
    const abonnementUrl = new URL(ABONNEMENT_PATH, request.url);
    const redirection = NextResponse.redirect(abonnementUrl);
    cookiesToApply.forEach(({ name, value, options }) => redirection.cookies.set(name, value, options));
    return redirection;
  }

  const locale = resolveLocale(request, profil);

  // Transmis à i18n/request.ts via un en-tête de requête (seul canal entre ce middleware Edge
  // et le contexte RSC où tourne getRequestConfig) — voir lib/locale.ts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesToApply.forEach(({ name, value, options }) => response.cookies.set(name, value, options));

  return response;
}

export const config = {
  // Doit tourner sur toutes les pages (pas seulement les chemins protégés) pour que
  // le rewrite par sous-domaine de boutique s'applique aussi à "/" et aux autres
  // routes publiques, et pour que la résolution de langue couvre toute l'app. Exclut les
  // assets Next.js internes et les fichiers statiques.
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|json)$).*)"],
};
