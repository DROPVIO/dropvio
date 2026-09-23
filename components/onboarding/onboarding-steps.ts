export interface OnboardingStep {
  id: string;
  /** Doit correspondre à un attribut data-onboarding-target dans le DOM. */
  target: string;
  /** Clés de traduction sous dashboard.onboarding — résolues au rendu (OnboardingTour). */
  titleKey: string;
  bodyKey: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "welcome",            target: "logo",               titleKey: "welcomeTitle",           bodyKey: "welcomeBody" },
  { id: "dashboard",          target: "dashboard",          titleKey: "dashboardTitle",         bodyKey: "dashboardBody" },
  { id: "produits-gagnants",  target: "produits-gagnants",  titleKey: "produitsGagnantsTitle",  bodyKey: "produitsGagnantsBody" },
  { id: "site-builder",       target: "site-builder",       titleKey: "siteBuilderTitle",       bodyKey: "siteBuilderBody" },
  { id: "audit",              target: "audit",              titleKey: "auditTitle",             bodyKey: "auditBody" },
  { id: "calculateur-marge",  target: "calculateur-marge",  titleKey: "calculateurMargeTitle",  bodyKey: "calculateurMargeBody" },
];
