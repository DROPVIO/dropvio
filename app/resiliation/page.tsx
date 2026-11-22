import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Logo from "@/components/Logo";
import ParcoursResiliation from "@/components/resiliation/ParcoursResiliation";

// Résiliation en trois clics : lien « Résilier votre contrat » → récapitulatif →
// « Confirmer la résiliation » → accusé avec référence. Connexion requise (proxy.ts).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("resiliation");
  return { title: t("metaTitre"), description: t("metaDescription"), robots: { index: false } };
}

export default async function ResiliationPage() {
  const t = await getTranslations("resiliation");
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
        <ParcoursResiliation />
      </div>
    </main>
  );
}
