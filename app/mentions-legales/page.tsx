import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LegalPageLayout, { TitreSection, balisesLegales } from "@/components/LegalPageLayout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.mentions");
  return { title: t("metaTitre") };
}

// ⚠️ Champs d'identité de l'éditeur (nom, SIRET, adresse) volontairement laissés en
// placeholder plutôt qu'inventés — voir l'encart d'avertissement plus bas. Version française
// faisant foi ; les autres langues sont des traductions informatives (voir LegalPageLayout).
export default async function MentionsLegalesPage() {
  const t = await getTranslations("legal.mentions");
  return (
    <LegalPageLayout eyebrow={t("surtitre")} title={t("titre")} updated="2026-09-20">
      <div className="rounded-xl border border-[var(--warning)]/30 bg-[var(--warning)]/10 px-4 py-3 text-[13px] text-[var(--warning)]">
        {t("avertissement")}
      </div>

      <section>
        <TitreSection>{t("editeurTitre")}</TitreSection>
        <p>{t("editeurTexte")}</p>
        <p className="mt-2">{t.rich("directeur", balisesLegales)}</p>
      </section>

      <section>
        <TitreSection>{t("hebergementTitre")}</TitreSection>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>{t.rich("hebergementVercel", balisesLegales)}</li>
          <li>{t.rich("hebergementSupabase", balisesLegales)}</li>
          <li>{t.rich("hebergementStripe", balisesLegales)}</li>
        </ul>
      </section>

      <section>
        <TitreSection>{t("proprieteTitre")}</TitreSection>
        <p>{t("proprieteTexte")}</p>
      </section>

      <section>
        <TitreSection>{t("contactTitre")}</TitreSection>
        <p>{t.rich("contactTexte", balisesLegales)}</p>
      </section>
    </LegalPageLayout>
  );
}
