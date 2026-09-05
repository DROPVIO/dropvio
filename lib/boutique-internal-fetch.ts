import { headers } from "next/headers";

// Un fetch() serveur-vers-serveur ne transmet jamais automatiquement les cookies de la
// requête entrante (contrairement à une requête de navigateur) — sans ce transfert
// explicite, les routes /api/boutiques/slug/... n'ont aucun moyen de savoir qui est
// connecté, et donc aucun moyen de distinguer un propriétaire en aperçu d'un visiteur
// anonyme (voir lib/boutique-access.ts).
export async function fetchBoutiqueApi(url: string): Promise<Response> {
  const cookie = (await headers()).get("cookie") ?? "";
  return fetch(url, { cache: "no-store", headers: { cookie } });
}
