"use client";

// « Enregistrer » : associe des images de la médiathèque à un produit. Chaque image reçoit sa
// copie publique (URL stable), puis est ajoutée à la suite des photos du produit, sans limite de
// nombre. Produit de boutique : boutique_produits.image_urls. Produit du catalogue : photos de
// l'utilisateur pour ce produit (/api/catalogue/[id]/photos, table catalogue_photos).
import { publierImage } from "./importer-client";

export type ResultatAssociation = { ok: true; urls: string[] } | { ok: false; json: unknown };

async function publierTout(mediaIds: string[]): Promise<{ ok: true; urls: string[] } | { ok: false; json: unknown }> {
  const urls: string[] = [];
  for (const id of mediaIds) {
    const publication = await publierImage(id);
    if (!publication.ok) return { ok: false, json: publication.json };
    urls.push(publication.url);
  }
  return { ok: true, urls };
}

export async function associerAuProduitBoutique(
  boutiqueId: string,
  produitId: string,
  imagesActuelles: readonly string[],
  mediaIds: string[]
): Promise<ResultatAssociation> {
  const publication = await publierTout(mediaIds);
  if (!publication.ok) return publication;
  const image_urls = [...new Set([...imagesActuelles, ...publication.urls])];
  try {
    const res = await fetch(`/api/boutiques/${boutiqueId}/produits/${produitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_urls }),
    });
    if (!res.ok) return { ok: false, json: await res.json().catch(() => null) };
    return { ok: true, urls: image_urls };
  } catch {
    return { ok: false, json: { code: "network" } };
  }
}

export async function associerAuProduitCatalogue(produitId: string, mediaIds: string[]): Promise<ResultatAssociation> {
  const publication = await publierTout(mediaIds);
  if (!publication.ok) return publication;
  try {
    const res = await fetch(`/api/catalogue/${encodeURIComponent(produitId)}/photos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ajouter: publication.urls }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, json };
    return { ok: true, urls: Array.isArray(json?.photos) ? json.photos : publication.urls };
  } catch {
    return { ok: false, json: { code: "network" } };
  }
}
