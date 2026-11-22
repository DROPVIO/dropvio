import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LegalPageLayout from "@/components/LegalPageLayout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.confidentialite");
  return { title: t("metaTitre") };
}

// Texte : content/legal/confidentialite.md.
export default function ConfidentialitePage() {
  return <LegalPageLayout page="confidentialite" />;
}
