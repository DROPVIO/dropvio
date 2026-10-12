import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LegalPageLayout, { TitreSection, balisesLegales } from "@/components/LegalPageLayout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.cgv");
  return { title: t("metaTitre") };
}

// Version française faisant foi ; les autres langues sont des traductions informatives.
export default async function CgvPage() {
  const t = await getTranslations("legal.cgv");
  return (
    <LegalPageLayout eyebrow={t("surtitre")} title={t("titre")} updated="2026-09-20">
      <section>
        <TitreSection>{t("objetTitre")}</TitreSection>
        <p>{t.rich("objetTexte", balisesLegales)}</p>
      </section>

      <section>
        <TitreSection>{t("offresTitre")}</TitreSection>
        <p>{t("offresIntro")}</p>
        <ul className="list-disc pl-5 mt-2 flex flex-col gap-1.5">
          <li>{t.rich("offreFree", balisesLegales)}</li>
          <li>{t.rich("offrePro", balisesLegales)}</li>
          <li>{t.rich("offreAgency", balisesLegales)}</li>
        </ul>
        <p className="mt-2">{t("offresTarifs")}</p>
      </section>

      <section>
        <TitreSection>{t("paiementTitre")}</TitreSection>
        <p>{t("paiementTexte")}</p>
      </section>

      <section>
        <TitreSection>{t("dureeTitre")}</TitreSection>
        <p>{t("dureeTexte")}</p>
      </section>

      <section>
        <TitreSection>{t("retractationTitre")}</TitreSection>
        <p>{t("retractationTexte")}</p>
      </section>

      <section>
        <TitreSection>{t("responsabiliteTitre")}</TitreSection>
        <p>{t("responsabiliteTexte")}</p>
      </section>

      <section>
        <TitreSection>{t("droitTitre")}</TitreSection>
        <p>{t.rich("droitTexte", balisesLegales)}</p>
      </section>
    </LegalPageLayout>
  );
}
