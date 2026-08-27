import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { FORMATION_MODULES } from "@/lib/formation-content";

// Formation écrite dropshipping — achat unique à vie par collection (plus d'add-on
// abonnement, plus de restriction de plan, voir lib/formation.ts). Route publique (pas de
// 401) : /formation est désormais une vraie page de vente, accessible sans compte.
// Le HTML des leçons n'est jamais renvoyé pour une collection non possédée, y compris pour
// un visiteur anonyme — la liste des modules sert uniquement à savoir combien de leçons
// existent, jamais leur contenu.
export async function GET() {
  const { user, formationOwned } = await getServerUserAndPlan();
  const owned = user ? formationOwned : { courte: false, longue: false };

  const modules = FORMATION_MODULES.map((m) =>
    owned[m.collection] ? m : { ...m, contenuHtml: "" }
  );

  return NextResponse.json({ modules, owned });
}
