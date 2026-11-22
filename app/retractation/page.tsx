import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Logo from "@/components/Logo";
import FormulaireRetractation from "@/components/retractation/FormulaireRetractation";

// Fonction de rétractation en ligne : accessible sans connexion, pendant tout le délai légal.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("retractation");
  return { title: t("metaTitre"), description: t("metaDescription") };
}

export default async function RetractationPage() {
  const t = await getTranslations("retractation");
  return (
    <main className="min-h-screen bg-[var(--bg)] px-4 py-12">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-start text-[var(--text-primary)] no-underline">
          <Logo className="h-6 w-6 text-[var(--logo-accent)]" />
          <span className="text-base font-bold">Dropvio</span>
        </Link>
        <div>
          <h1 className="m-0 text-2xl font-bold text-[var(--text-primary)]">{t("titre")}</h1>
          <p className="m-0 mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{t("intro")}</p>
        </div>
        <FormulaireRetractation />
      </div>
    </main>
  );
}
