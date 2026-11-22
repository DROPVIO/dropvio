import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import FormationContenu from "@/components/formation/FormationContenu";

// Page serveur : fixe le titre et la description de la page de vente de la formation (le
// contenu, interactif, reste un composant client).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.formation");
  return { title: t("metaTitre"), description: t("metaDescription") };
}

export default function FormationPage() {
  return <FormationContenu />;
}
