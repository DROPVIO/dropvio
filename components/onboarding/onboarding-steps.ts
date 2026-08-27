export interface OnboardingStep {
  id: string;
  /** Doit correspondre à un attribut data-onboarding-target dans le DOM. */
  target: string;
  title: string;
  body: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "welcome",
    target: "logo",
    title: "Bienvenue sur Dropvio 👋",
    body: "Un rapide tour des outils essentiels pour trouver et lancer tes produits gagnants. Ça prend 30 secondes.",
  },
  {
    id: "dashboard",
    target: "dashboard",
    title: "Ton dashboard",
    body: "Suis ton activité : sites générés, simulations de marge et audits, tout au même endroit.",
  },
  {
    id: "produits-gagnants",
    target: "produits-gagnants",
    title: "Produits gagnants",
    body: "Explore le catalogue de produits tendance et repère ceux à fort potentiel de marge.",
  },
  {
    id: "site-builder",
    target: "site-builder",
    title: "Site Builder",
    body: "Génère une landing page complète pour un produit en quelques clics.",
  },
  {
    id: "audit",
    target: "audit",
    title: "Audit de site",
    body: "Fais auditer ton site par l'IA et reçois un score détaillé pour l'optimiser.",
  },
  {
    id: "calculateur-marge",
    target: "calculateur-marge",
    title: "Calculateur de marge",
    body: "Simule tes prix de vente et ta marge nette avant de te lancer.",
  },
];
