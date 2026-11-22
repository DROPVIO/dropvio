import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LegalPageLayout from "@/components/LegalPageLayout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.mentions");
  return { title: t("metaTitre") };
}

// Texte : content/legal/mentions-legales.md.
export default function MentionsLegalesPage() {
  return <LegalPageLayout page="mentions-legales" />;
}
