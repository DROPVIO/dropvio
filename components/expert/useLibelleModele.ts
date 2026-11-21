"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

// Libellé affiché d'une offre de modèle Expert (« Qualité standard », « Qualité avancée »), sans
// nom de modèle. Le modèle réellement appelé et son nom technique restent dans le code
// (EXPERT_MODELS dans lib/expert-pricing.ts : apiId, label pour la ligne de paiement Stripe).
// Clé inconnue (ancienne valeur en base) : la valeur brute, comme avant.
export function useLibelleModele() {
  const t = useTranslations("expertModeles");
  return useCallback((modele: string) => (t.has(modele) ? t(modele) : modele), [t]);
}
