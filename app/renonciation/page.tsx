import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import Logo from "@/components/Logo";
import FormulaireRenonciation from "@/components/renonciation/FormulaireRenonciation";

// Renonciation au contrat depuis l'espace client (droit de rétractation, art. L221-21) :
// bouton « Renoncer au contrat ici » sur /abonnement → formulaire pré-rempli → « Confirmer la
// renonciation » → confirmation. Connexion requise (proxy.ts).
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("renonciation");
  return { title: t("metaTitre"), description: t("metaDescription"), robots: { index: false } };
}

export default async function RenonciationPage() {
  const t = await getTranslations("renonciation");
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
        <FormulaireRenonciation />
      </div>
    </main>
  );
}
