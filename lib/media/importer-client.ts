"use client";

// Envoi d'une image depuis l'ordinateur vers la médiathèque (origine « import ») : préparation
// (/api/media/import), envoi direct au stockage par URL signée, puis confirmation. Partagé par la
// médiathèque et la section Photos du Catalogue.
import { MEDIA_MAX_OCTETS, MEDIA_MIMES } from "./constantes";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export type ResultatImport =
  | { ok: true; id: string }
  // raison « type » / « taille » : refus local ; « api » : réponse d'erreur (json à traduire) ;
  // « envoi » : échec du dépôt dans le stockage ; « reseau » : fetch rejeté.
  | { ok: false; raison: "type" | "taille" | "envoi" | "reseau" }
  | { ok: false; raison: "api"; json: unknown };

export async function importerImage(fichier: File): Promise<ResultatImport> {
  if (!(MEDIA_MIMES as readonly string[]).includes(fichier.type)) return { ok: false, raison: "type" };
  if (fichier.size > MEDIA_MAX_OCTETS) return { ok: false, raison: "taille" };
  try {
    const preparation = await fetch("/api/media/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mime: fichier.type, taille: fichier.size }),
    });
    const envoiAutorise = await preparation.json().catch(() => null);
    if (!preparation.ok || !envoiAutorise) return { ok: false, raison: "api", json: envoiAutorise };

    const { error } = await createSupabaseBrowserClient()
      .storage.from("mediatheque")
      .uploadToSignedUrl(envoiAutorise.chemin, envoiAutorise.token, fichier, { contentType: fichier.type });
    if (error) return { ok: false, raison: "envoi" };

    const confirmation = await fetch("/api/media/import/confirmer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chemin: envoiAutorise.chemin }),
    });
    const json = await confirmation.json().catch(() => null);
    if (!confirmation.ok || typeof json?.id !== "string") return { ok: false, raison: "api", json };
    return { ok: true, id: json.id };
  } catch {
    return { ok: false, raison: "reseau" };
  }
}

/** Copie publique d'une image de la médiathèque (URL stable, utilisable sur une fiche produit). */
export async function publierImage(id: string): Promise<{ ok: true; url: string } | { ok: false; json: unknown }> {
  try {
    const res = await fetch(`/api/media/${id}/publier`, { method: "POST" });
    const json = await res.json().catch(() => null);
    if (!res.ok || typeof json?.url !== "string") return { ok: false, json };
    return { ok: true, url: json.url };
  } catch {
    return { ok: false, json: { code: "network" } };
  }
}
