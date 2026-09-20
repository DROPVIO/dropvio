import { getRequestConfig } from "next-intl/server";
import { headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_HEADER, isAppLocale } from "@/lib/locale";

// Pas de routing par [locale]/ (voir middleware.ts) — la langue est résolue une fois par
// requête dans le middleware (cookie NEXT_LOCALE > Accept-Language > profils.langue si
// connecté) puis transmise ici via un en-tête interne, seul canal disponible entre le
// middleware Edge et ce contexte RSC.
export default getRequestConfig(async () => {
  const headerList = await headers();
  const raw = headerList.get(LOCALE_HEADER);
  const locale = isAppLocale(raw) ? raw : DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
