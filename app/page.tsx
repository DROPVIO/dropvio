import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LandingContenu from "@/components/landing/LandingContenu";

// Page serveur : seule une page serveur peut fixer le titre et la description de la landing
// (le contenu, interactif, reste un composant client).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("landing");
  return { title: t("metaTitre"), description: t("metaDescription") };
}

export default function LandingPage() {
  return <LandingContenu />;
}
