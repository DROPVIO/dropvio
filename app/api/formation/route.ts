import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { getFormationModules } from "@/lib/formation-content";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/locale";

// Formation écrite dropshipping — achat unique à vie par collection (plus d'add-on
// abonnement, plus de restriction de plan, voir lib/formation.ts). Route publique (pas de
// 401) : /formation est désormais une vraie page de vente, accessible sans compte.
// Le HTML des leçons n'est jamais renvoyé pour une collection non possédée, y compris pour
// un visiteur anonyme — la liste des modules sert uniquement à savoir combien de leçons
// existent, jamais leur contenu.
// La langue arrive en ?locale= : le middleware ne tourne pas sur /api/ (voir son matcher),
// donc l'en-tête de langue qu'il pose pour les pages n'existe pas ici.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawLocale = searchParams.get("locale");
  const locale = isAppLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;

  const { user, formationOwned } = await getServerUserAndPlan();
  const owned = user ? formationOwned : { courte: false, longue: false };

  const modules = getFormationModules(locale).map((m) =>
    owned[m.collection] ? m : { ...m, contenuHtml: "" }
  );

  return NextResponse.json({ modules, owned });
}
