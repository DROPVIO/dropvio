import { NextRequest, NextResponse } from "next/server";
import { chargerTextesSite, langueSite } from "@/lib/site-textes";

// Textes livrés dans les sites générés (namespace siteContenu), pour une langue de site
// donnée : l'éditeur de templates en a besoin côté client, dans une langue qui peut différer
// de celle de l'interface. Contenu public et statique (aucune donnée utilisateur).
export async function GET(request: NextRequest) {
  const langue = langueSite(new URL(request.url).searchParams.get("langue"));
  return NextResponse.json(
    { langue, textes: await chargerTextesSite(langue) },
    { headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
