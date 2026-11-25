// Plafond du catalogue par plan (PLAN_LIMITS[plan].produitsMax) : Pro accède aux
// CATALOGUE_MAX_PRO premiers produits du catalogue ; Agency et Expert à tout le catalogue.
//
// Le plafond désigne un ENSEMBLE FIXE de produits, pas « les N premiers résultats de chaque
// requête » : sinon la rotation quotidienne (produits_rotation, seed = date du jour) ou un simple
// filtre (niche, prix, recherche) ferait apparaître d'autres produits, et un compte Pro finirait
// par parcourir tout le catalogue.
//
// Ordre de référence, stable d'une requête à l'autre : commandes décroissantes, puis id
// croissant (ordre de la liste /api/catalogue, et ancien ordre fixe du catalogue avant la rotation
// de la migration 047). Il est pris sur tout le catalogue dédoublonné (vue produits_dedup), sans
// plancher de commandes. Le dernier produit autorisé (la « borne ») est lu une
// fois, puis chaque lecture du catalogue garde les produits placés avant ou sur cette borne :
//   commandes > borne.commandes, ou commandes = borne.commandes et id <= borne.id.
// Les filtres et l'ordre d'affichage (rotation) s'appliquent ensuite, à l'intérieur de cet ensemble.

import type { SupabaseClient } from "@supabase/supabase-js";
import { limitesDuPlan, type PlanOuAucun } from "./plan-limits";

export type BorneCatalogue = { commandes: number; id: string };
type ProduitOrdonnable = { commandes: number | null; id: string };

/** Comparaison des id comme la base : les id du catalogue sont des chaînes de chiffres, que la
 *  collation de la base (en_US.UTF-8) range caractère par caractère, comme JavaScript. */
function comparerId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Ordre de référence du plafond : commandes décroissantes, puis id croissant. */
export function comparerOrdreCatalogue(a: ProduitOrdonnable, b: ProduitOrdonnable): number {
  const ca = a.commandes ?? -1;
  const cb = b.commandes ?? -1;
  return ca !== cb ? cb - ca : comparerId(a.id, b.id);
}

/** Vrai si le produit fait partie de l'ensemble autorisé (borne null = pas de plafond). */
export function dansLePlafond(produit: ProduitOrdonnable, borne: BorneCatalogue | null): boolean {
  if (!borne) return true;
  const c = produit.commandes ?? -1;
  return c > borne.commandes || (c === borne.commandes && comparerId(produit.id, borne.id) <= 0);
}

/** Borne calculée sur une liste en mémoire (même règle que lireBorneCatalogue côté base). */
export function borneDepuisListe(produits: ProduitOrdonnable[], max: number | null): BorneCatalogue | null {
  if (max === null) return null;
  const affiches = [...produits].sort(comparerOrdreCatalogue);
  if (affiches.length <= max) return null;
  const derniere = affiches[max - 1];
  return { commandes: derniere.commandes ?? 0, id: derniere.id };
}

/** Filtre PostgREST (`.or(...)`) qui garde les produits placés avant ou sur la borne. */
export function filtreBorne(borne: BorneCatalogue): string {
  const id = borne.id.replace(/["\\]/g, "");
  return `commandes.gt.${borne.commandes},and(commandes.eq.${borne.commandes},id.lte."${id}")`;
}

/** Paramètres de borne des fonctions SQL de rotation (migration 070). */
export function parametresBorne(borne: BorneCatalogue): { p_borne_commandes: number; p_borne_id: string } {
  return { p_borne_commandes: borne.commandes, p_borne_id: borne.id };
}

/** Repli tant que la migration 070 n'est pas appliquée : on ne garde que les produits qui ont
 *  strictement plus de commandes que la borne. C'est un sous-ensemble du plafond (les ex æquo
 *  de la borne sont exclus) : jamais plus de produits que le plan n'en autorise. */
export function commandesMinRepli(commandesMin: number | null, borne: BorneCatalogue): number {
  return Math.max(commandesMin ?? 0, borne.commandes + 1);
}

/** PostgREST ne trouve pas la fonction avec ces paramètres (migration 070 absente). */
export function fonctionSansBorne(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST202";
}

// La borne bouge peu (elle ne change qu'avec les commandes du catalogue, rafraîchies par le
// cron) : gardée quelques minutes en mémoire pour ne pas relire 15 000 lignes à chaque page.
const DUREE_CACHE_MS = 5 * 60_000;
const cache = new Map<number, { borne: BorneCatalogue | null; expire: number }>();

/** Borne du plan : null si le plan n'a pas de plafond ou si le catalogue affiché tient dedans. */
export async function lireBorneCatalogue(supabase: SupabaseClient, plan: PlanOuAucun): Promise<BorneCatalogue | null> {
  const max = limitesDuPlan(plan).produitsMax;
  if (max === null || max <= 0) return null;
  const enCache = cache.get(max);
  if (enCache && enCache.expire > Date.now()) return enCache.borne;

  const { data, error } = await supabase
    .from("produits_dedup")
    .select("commandes, id")
    .order("commandes", { ascending: false, nullsFirst: false })
    .order("id", { ascending: true })
    .range(max - 1, max - 1);
  if (error) throw error;
  const ligne = data?.[0] as { commandes: number | null; id: string } | undefined;
  const borne = ligne ? { commandes: ligne.commandes ?? 0, id: ligne.id } : null;
  cache.set(max, { borne, expire: Date.now() + DUREE_CACHE_MS });
  return borne;
}
