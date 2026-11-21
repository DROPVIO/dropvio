import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ExpertPageContenu from "@/components/landing/ExpertPageContenu";

// Page publique du plan Expert, ouverte par « Découvrir » sur la carte Expert de la landing.
// Configurateur du mois et recharge de crédits ; aucun paiement ici, les CTA mènent à
// /register?plan=expert (et &mode=quota).

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing.expertPage");
  return { title: t("metaTitre"), description: t("metaDescription") };
}

export default function ExpertPage() {
  return <ExpertPageContenu />;
}
