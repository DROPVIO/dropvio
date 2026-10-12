import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import LegalPageLayout, { TitreSection, balisesLegales } from "@/components/LegalPageLayout";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.confidentialite");
  return { title: t("metaTitre") };
}

// Version française faisant foi ; les autres langues sont des traductions informatives.
export default async function ConfidentialitePage() {
  const t = await getTranslations("legal.confidentialite");
  return (
    <LegalPageLayout eyebrow={t("surtitre")} title={t("titre")} updated="2026-10-12">
      <section>
        <p>{t("intro")}</p>
      </section>

      <section>
        <TitreSection>{t("responsableTitre")}</TitreSection>
        <p>{t.rich("responsableTexte", balisesLegales)}</p>
      </section>

      <section>
        <TitreSection>{t("donneesTitre")}</TitreSection>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>{t.rich("donneesCompte", balisesLegales)}</li>
          <li>{t.rich("donneesUtilisation", balisesLegales)}</li>
          <li>{t.rich("donneesFacturation", balisesLegales)}</li>
          <li>{t.rich("donneesIa", balisesLegales)}</li>
        </ul>
      </section>

      <section>
        <TitreSection>{t("finalitesTitre")}</TitreSection>
        <ul className="list-disc pl-5 flex flex-col gap-1.5">
          <li>{t.rich("finaliteContrat", balisesLegales)}</li>
          <li>{t.rich("finaliteInteret", balisesLegales)}</li>
          <li>{t.rich("finaliteConsentement", balisesLegales)}</li>
        </ul>
      </section>

      <section>
        <TitreSection>{t("dureeTitre")}</TitreSection>
        <p>{t("dureeTexte")}</p>
      </section>

      <section>
        <TitreSection>{t("destinatairesTitre")}</TitreSection>
        <p>{t("destinatairesIntro")}</p>
        <ul className="list-disc pl-5 mt-2 flex flex-col gap-1.5">
          <li>{t.rich("sousTraitantSupabase", balisesLegales)}</li>
          <li>{t.rich("sousTraitantVercel", balisesLegales)}</li>
          <li>{t.rich("sousTraitantStripe", balisesLegales)}</li>
          <li>{t.rich("sousTraitantAnthropic", balisesLegales)}</li>
          <li>{t.rich("sousTraitantResend", balisesLegales)}</li>
          <li>{t.rich("sousTraitantShopify", balisesLegales)}</li>
        </ul>
        <p className="mt-2">{t("destinatairesTransferts")}</p>
      </section>

      <section>
        <TitreSection>{t("droitsTitre")}</TitreSection>
        <p>{t.rich("droitsTexte", balisesLegales)}</p>
      </section>

      <section>
        <TitreSection>{t("cookiesTitre")}</TitreSection>
        <p>{t("cookiesTexte")}</p>
      </section>

      <section>
        <TitreSection>{t("contactTitre")}</TitreSection>
        <p>{t.rich("contactTexte", balisesLegales)}</p>
      </section>
    </LegalPageLayout>
  );
}
