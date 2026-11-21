import type { SourceQuotaImages } from "./quota-images-regles";
import type { OutilIa } from "@/lib/pauses-outils";
import type { EtatOutil } from "@/lib/pauses-outils-regles";

export type QuotaImagesClient = { source: SourceQuotaImages; imagesRestantes: number; coutImageEur: number };
/** État d'un outil (Pro, Agency) ; « migration » : pauses indisponibles (054 non appliquée). */
export type EtatOutilClient = EtatOutil | { statut: "migration" };

// Quota d'images du mois lu dans le navigateur via /api/media/quota (tous les plans payants :
// quota Expert, ou budget IA pour Pro et Agency). null : quota illisible ou plan sans génération.
// Avec `outil` : état de cet outil en plus (null pour un plan sans pause).
export async function lireQuotaEtOutil(outil?: OutilIa): Promise<{ quota: QuotaImagesClient | null; outil: EtatOutilClient | null }> {
  try {
    const res = await fetch(`/api/media/quota${outil ? `?outil=${outil}` : ""}`);
    if (!res.ok) return { quota: null, outil: null };
    const json = await res.json();
    return { quota: (json?.quota as QuotaImagesClient) ?? null, outil: (json?.outil as EtatOutilClient) ?? null };
  } catch {
    return { quota: null, outil: null };
  }
}

export async function lireQuotaImagesClient(): Promise<QuotaImagesClient | null> {
  return (await lireQuotaEtOutil()).quota;
}

/** Images restantes ce mois-ci, ou null si le quota n'est pas lisible. */
export async function lireImagesRestantes(): Promise<number | null> {
  return (await lireQuotaImagesClient())?.imagesRestantes ?? null;
}

/** Images réellement possibles : le plus petit du quota du mois et des crédits de l'outil.
 *  null : inconnu (le serveur tranchera). 0 si l'outil est en pause ou sans réglages. */
export function imagesPossibles(quota: QuotaImagesClient | null, outil: EtatOutilClient | null): number | null {
  const mensuel = quota ? quota.imagesRestantes : null;
  if (!outil) return mensuel;
  if (outil.statut !== "actif") return 0;
  return mensuel === null ? outil.imagesPossibles : Math.min(mensuel, outil.imagesPossibles);
}
