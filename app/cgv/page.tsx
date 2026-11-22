import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LegalPageLayout from "@/components/LegalPageLayout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.cgv");
  return { title: t("metaTitre") };
}

// Texte : content/legal/cgv.md.
export default function CgvPage() {
  return <LegalPageLayout page="cgv" />;
}
