import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveBoutiqueSlugFromHost } from "@/lib/boutique-subdomains";

// /formation est une page de vente publique (achat unique par formation) — le contrôle
// d'accès réel se joue sur /api/formation/checkout, pas ici.
const PROTECTED_PATHS = ["/produits-gagnants", "/site-builder", "/mes-sites", "/dashboard", "/audit", "/tools/calculateur-marge"];

export async function middleware(request: NextRequest) {
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
  // resolveBoutiqueSlugFromHost renvoie alors toujours null.
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
  if (!isProtected) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  // Doit tourner sur toutes les pages (pas seulement les chemins protégés) pour que
  // le rewrite par sous-domaine de boutique s'applique aussi à "/" et aux autres
  // routes publiques. Exclut les assets Next.js internes et les fichiers statiques.
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|json)$).*)"],
};
