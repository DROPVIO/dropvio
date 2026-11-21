export type ImageQuality = "low" | "medium" | "high";

export type GenerateImageOptions = {
  quality?: ImageQuality;
  size?: "1024x1024" | "1536x1024" | "1024x1536";
  // Photo du produit à reprendre (option Images produits). L'URL doit avoir été validée par
  // photoAutorisee (lib/media/images-produits.ts) avant d'arriver ici.
  reference?: string;
};

export type GeneratedImage = {
  base64: string;
  mimeType: string;
  model: string;
  tokensEntree: number;
  tokensSortie: number;
  // null si le fournisseur ne renvoie pas sa consommation.
  coutUsd: number | null;
};

export class MediaProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Fournisseur non configuré : ${provider}.`);
    this.name = "MediaProviderNotConfiguredError";
  }
}

// Cause d'un échec chez le fournisseur, pour choisir le message montré à l'utilisateur :
// - limite : crédit épuisé ou limite de débit (429, insufficient_quota, billing_hard_limit_reached)
// - refus : prompt refusé par la modération
// - cle : clé refusée (401/403)
// - modele : modèle inconnu ou retiré
// - parametre : requête refusée pour un autre paramètre (taille, qualité…)
// - indisponible : erreur 5xx, délai dépassé, réseau
// - reponse : réponse sans image exploitable
export type MediaErreurType = "limite" | "refus" | "cle" | "modele" | "parametre" | "indisponible" | "reponse";

export class MediaProviderError extends Error {
  constructor(
    readonly type: MediaErreurType,
    // Détail technique pour les logs serveur, jamais montré à l'utilisateur.
    readonly detail: { fournisseur: string; status?: number; code?: string; message?: string }
  ) {
    super(`${detail.fournisseur} [${type}]${detail.status ? ` HTTP ${detail.status}` : ""}${detail.code ? ` ${detail.code}` : ""} : ${detail.message ?? ""}`);
    this.name = "MediaProviderError";
  }
}
