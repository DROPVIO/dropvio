import { NextResponse } from "next/server";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

// Ventes Shopify de l'utilisateur pour le tableau des ventes du dashboard
// (components/dashboard/VentesDashboard.tsx). Source : commandes_a_preparer.raw_payload, la
// commande Shopify complète reçue par le webhook orders/create ou le cron de réconciliation.
// La table n'a aucune policy RLS pour authenticated (elle porte de la PII client) : lecture
// en service role, toujours filtrée par user_id, et seuls la date, les montants et les
// lignes (titre, quantité, montant) sortent d'ici — jamais le client ni l'adresse.

const JOURS_MAX = 730;
const COMMANDES_MAX = 10_000;

type LigneShopify = { title?: unknown; quantity?: unknown; price?: unknown; total_discount?: unknown };
type CommandeShopify = {
  created_at?: unknown;
  cancelled_at?: unknown;
  currency?: unknown;
  total_price?: unknown;
  current_total_price?: unknown;
  line_items?: unknown;
};

export type VenteLigne = { produit: string; quantite: number; montant: number };
export type Vente = { t: number; total: number; lignes: VenteLigne[] };

const nombre = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

export async function GET() {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi.", code: "auth_required" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const depuis = new Date(Date.now() - JOURS_MAX * 24 * 3_600_000).toISOString();
  const { data, error } = await admin
    .from("commandes_a_preparer")
    .select("created_at, raw_payload")
    .eq("user_id", user.id)
    .gte("created_at", depuis)
    .order("created_at", { ascending: true })
    .limit(COMMANDES_MAX);

  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }

  const devises = new Map<string, number>();
  const ventes: Vente[] = [];
  for (const ligne of data ?? []) {
    const c = (ligne.raw_payload ?? {}) as CommandeShopify;
    // Commande annulée : pas une vente.
    if (c.cancelled_at) continue;
    const date = typeof c.created_at === "string" ? c.created_at : ligne.created_at;
    const t = new Date(date).getTime();
    if (!Number.isFinite(t)) continue;

    const lignes: VenteLigne[] = (Array.isArray(c.line_items) ? (c.line_items as LigneShopify[]) : []).map((li) => {
      const quantite = Math.max(0, Math.round(nombre(li.quantity)));
      return {
        produit: typeof li.title === "string" && li.title.trim() ? li.title.trim() : "—",
        quantite,
        montant: Math.max(0, nombre(li.price) * quantite - nombre(li.total_discount)),
      };
    });
    // current_total_price tient compte des remboursements et modifications ; total_price
    // en repli (charges plus anciennes). Sans montant (raw_payload effacé par une demande
    // RGPD), on retombe sur la somme des lignes.
    const total = nombre(c.current_total_price ?? c.total_price) || lignes.reduce((s, l) => s + l.montant, 0);
    if (typeof c.currency === "string") devises.set(c.currency, (devises.get(c.currency) ?? 0) + 1);
    ventes.push({ t, total: Math.round(total * 100) / 100, lignes });
  }

  // Devise de la boutique : la plus fréquente (une boutique Shopify n'en a qu'une de référence).
  const devise = [...devises].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "EUR";
  return NextResponse.json({ devise, ventes });
}
