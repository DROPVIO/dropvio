// Prix des modèles Claude utilisés par Dropvio, en euros par million de tokens, convertis
// depuis les tarifs en dollars au taux de TAUX_EUR_PAR_USD.
// Prix à vérifier sur la page tarifaire Anthropic ; à mettre à jour si elle change.

export const TAUX_EUR_PAR_USD = 0.9;

// Tarifs Anthropic en dollars par million de tokens (entrée, sortie).
const PRIX_USD = {
  "claude-sonnet-5-5": { entree: 2, sortie: 10 }, // génération de site
  "claude-sonnet-4-6": { entree: 3, sortie: 15 }, // audit IA, analyse d'inspiration
  "claude-opus-5-5": { entree: 4, sortie: 20 }, // tri, réécriture et prix de la boutique
  "claude-opus-4-8": { entree: 5, sortie: 25 }, // relais si claude-opus-5-5 refuse une requête
  "claude-haiku-4-5": { entree: 1, sortie: 5 }, // textes produit, contenu de boutique
} as const;

export type ModeleIa = keyof typeof PRIX_USD;

export const PRIX_EUR_PAR_MILLION: Record<ModeleIa, { entree: number; sortie: number }> = Object.fromEntries(
  Object.entries(PRIX_USD).map(([modele, p]) => [modele, { entree: p.entree * TAUX_EUR_PAR_USD, sortie: p.sortie * TAUX_EUR_PAR_USD }])
) as Record<ModeleIa, { entree: number; sortie: number }>;

export function estModeleConnu(modele: string): modele is ModeleIa {
  return modele in PRIX_EUR_PAR_MILLION;
}

// Un modèle absent de la table (nouvel identifiant, alias renvoyé par l'API) est compté au prix
// le plus élevé de la table : le budget peut être surestimé, jamais sous-estimé.
const PRIX_MAXIMAL = Object.values(PRIX_EUR_PAR_MILLION).reduce((max, p) =>
  p.entree + p.sortie > max.entree + max.sortie ? p : max
);

export function prixEuros(modele: string): { entree: number; sortie: number } {
  return estModeleConnu(modele) ? PRIX_EUR_PAR_MILLION[modele] : PRIX_MAXIMAL;
}

/** Coût en euros d'un appel (ou d'un cumul d'appels) sur un modèle. */
export function coutEuros(modele: string, tokensEntree: number, tokensSortie: number): number {
  const p = prixEuros(modele);
  return (tokensEntree * p.entree + tokensSortie * p.sortie) / 1_000_000;
}
