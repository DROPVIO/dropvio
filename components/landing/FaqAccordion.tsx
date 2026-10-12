"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const IDS = [1, 2, 3, 4, 5] as const;

/** Accordéon de la landing. Les cinq questions sont celles de /faq, déjà vérifiées contre le
 *  code — on ne réintroduit pas ici d'affirmation sur un essai ou une résiliation. */
export default function FaqAccordion() {
  const t = useTranslations("landing.faq");
  const [ouvert, setOuvert] = useState<number | null>(null);

  return (
    <section className="mx-auto box-border flex max-w-[1200px] flex-wrap gap-x-12 gap-y-6 border-t border-[#eee] px-4 py-[clamp(40px,5cqw,72px)] sm:px-6">
      <h2
        data-rv="up"
        style={{ "--dl": "0ms" } as React.CSSProperties}
        className="m-0 flex-[1_1_260px] text-[clamp(26px,2.4cqw,34px)] font-[650] leading-[1.15] tracking-[-0.03em]"
      >
        {t("title")}
      </h2>

      <div className="min-w-0 flex-[3_1_480px] border-t border-[#e6e6e6]">
        {IDS.map((n, i) => {
          const estOuvert = ouvert === n;
          return (
            <div
              key={n}
              data-rv="faq"
              style={{ "--dl": `${i * 60}ms` } as React.CSSProperties}
              className="border-b border-[#e6e6e6]"
            >
              <h3 className="m-0">
                <button
                  type="button"
                  onClick={() => setOuvert(estOuvert ? null : n)}
                  aria-expanded={estOuvert}
                  aria-controls={`dv-faq-${n}`}
                  className="flex w-full cursor-pointer items-center justify-between gap-4 border-0 bg-transparent px-0 py-5 text-left font-[inherit] text-[17px] font-medium text-[#111]"
                >
                  <span>{t(`q${n}`)}</span>
                  <span aria-hidden className="w-5 flex-none text-center text-[22px] font-normal text-[#7c3aed]">
                    {estOuvert ? "−" : "+"}
                  </span>
                </button>
              </h3>
              {estOuvert && (
                <p
                  id={`dv-faq-${n}`}
                  className="m-0 max-w-[62ch] pb-[22px] pr-9 text-[15px] leading-[1.6] text-[#444]"
                >
                  {t(`a${n}`)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
