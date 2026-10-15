// Budget IA mensuel en euros par plan (AI_BUDGET_EUR_PAR_PLAN, lib/plan-limits.ts).
//
// Le coût du mois est recalculé à chaque vérification depuis usage_mensuel : les tokens y sont
// cumulés par (utilisateur, fonction, mois), et chaque fonction n'utilise qu'un modèle de
// référence (MODELE_PAR_FONCTION), dont le prix donne le coût. Un appel servi par un autre
// modèle (relais en cas de refus) est converti en tokens « équivalents » du modèle de
// référence, au même coût. Remise à zéro naturelle au changement de mois (currentMonthKey).
//
// Usage dans une route : new SuiviBudgetIa(...), puis verifier(estimation) avant chaque appel
// Anthropic, ajouter(...) après chaque réponse, et enregistrer() dans un finally pour que les
// tokens consommés soient comptés même si la suite de la route échoue.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AI_BUDGET_EUR_PAR_PLAN,
  AI_BUDGET_PART_JOUR,
  AI_BUDGET_PART_SEMAINE,
  currentMonthKey,
  logTokensUsage,
  type Plan,
  type UsageFeature,
} from "@/lib/plan-limits";
import { coutEuros, prixEuros, type ModeleIa } from "@/lib/ai-pricing";
import { apiError } from "@/lib/api-errors";

export const MODELE_PAR_FONCTION: Record<UsageFeature, ModeleIa | null> = {
  site_builder: "claude-sonnet-5-5",
  audit_ia: "claude-sonnet-4-6",
  inspiration_ia: "claude-sonnet-4-6",
  boutique_ia: "claude-opus-5-5",
  textes_ia: "claude-haiku-4-5",
  // Aucune IA (API AliExpress) : jamais de tokens.
  finder_alternatives: null,
};

// Fonctions ajoutées par la migration 043. Si elle n'est pas appliquée, leurs tokens sont
// enregistrés sous FONCTION_DE_REPLI, convertis au même coût (voir enregistrer()).
const FONCTIONS_MIGRATION_043: UsageFeature[] = ["inspiration_ia", "boutique_ia", "textes_ia"];
const FONCTION_DE_REPLI: UsageFeature = "audit_ia";

export const MESSAGE_BUDGET_DEPASSE = "Budget IA du mois atteint. Il sera remis à zéro le 1er du mois prochain.";

export class BudgetIaDepasse extends Error {
  constructor(
    readonly utiliseEuros: number,
    readonly budgetEuros: number,
    readonly estimeEuros: number
  ) {
    super(MESSAGE_BUDGET_DEPASSE);
    this.name = "BudgetIaDepasse";
  }
}

/** Réponse HTTP 402 renvoyée quand le budget du mois ne couvre pas l'appel demandé. */
export function reponseBudgetDepasse(err: BudgetIaDepasse) {
  return apiError("budget_ia_depasse", 402, MESSAGE_BUDGET_DEPASSE, {
    budget: { utilise: arrondiCentime(err.utiliseEuros), max: err.budgetEuros },
  });
}

export function arrondiCentime(euros: number): number {
  return Math.round(euros * 100) / 100;
}

/** Tokens d'un texte, estimés largement : ~2,5 caractères par token (le HTML mesuré tourne
 *  autour de 2,85, le texte courant au-dessus de 3,5). Sert seulement à l'estimation avant appel. */
export function tokensEstimes(texte: string): number {
  return Math.ceil(texte.length / 2.5);
}

/** Coût maximal d'un appel : entrée estimée + max_tokens entièrement consommé en sortie
 *  (max_tokens borne aussi la réflexion, comptée dans la sortie). */
export function estimationEuros(modele: ModeleIa, tokensEntree: number, maxTokens: number): number {
  return coutEuros(modele, tokensEntree, maxTokens);
}

/** Coût IA consommé ce mois-ci par l'utilisateur, toutes fonctions confondues. */
export async function getBudgetUsedEuros(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("usage_mensuel")
    .select("feature, tokens_entree, tokens_sortie")
    .eq("user_id", userId)
    .eq("mois", currentMonthKey());
  if (error) {
    // Sans 037a (colonnes de tokens), le coût ne peut pas être calculé : on le signale et on
    // compte 0 plutôt que de bloquer toutes les fonctions IA.
    console.warn("[ai-budget] Lecture de usage_mensuel échouée :", error.message);
    return 0;
  }
  let total = 0;
  for (const ligne of (data ?? []) as { feature: UsageFeature; tokens_entree: number | null; tokens_sortie: number | null }[]) {
    const modele = MODELE_PAR_FONCTION[ligne.feature];
    if (modele) total += coutEuros(modele, ligne.tokens_entree ?? 0, ligne.tokens_sortie ?? 0);
  }
  return total;
}

/** Lève BudgetIaDepasse si le coût déjà consommé ce mois-ci (+ `dejaEngageEuros`, consommé par
 *  la requête en cours mais pas encore enregistré) + `coutEstimeEuros` dépasse le budget. */
export async function assertBudgetDisponible(
  supabase: SupabaseClient,
  userId: string,
  plan: Plan,
  coutEstimeEuros: number,
  dejaEngageEuros = 0
): Promise<void> {
  const budget = AI_BUDGET_EUR_PAR_PLAN[plan];
  const utilise = (await getBudgetUsedEuros(supabase, userId)) + dejaEngageEuros;
  if (utilise + coutEstimeEuros > budget) {
    throw new BudgetIaDepasse(utilise, budget, coutEstimeEuros);
  }
}

// ─── Limites glissantes (24 heures, 7 jours) ────────────────────────────────────────────
// Comme les limites d'usage de Claude : une part du budget mensuel par fenêtre glissante,
// calculée depuis usage_ia_journal (migration 044). Limite souple : un appel est refusé
// seulement si la fenêtre est DÉJÀ pleine ; il peut donc la dépasser d'un appel, le budget
// mensuel (strict, estimé avant l'appel) restant la garantie de coût. La limite se libère au
// fil de l'eau, quand les dépenses les plus anciennes sortent de la fenêtre.

export type FenetreIa = "jour" | "semaine";

const DUREE_FENETRE_MS: Record<FenetreIa, number> = {
  jour: 24 * 3_600_000,
  semaine: 7 * 24 * 3_600_000,
};

export function plafondFenetre(plan: Plan, fenetre: FenetreIa): number {
  return AI_BUDGET_EUR_PAR_PLAN[plan] * (fenetre === "jour" ? AI_BUDGET_PART_JOUR : AI_BUDGET_PART_SEMAINE);
}

export type EtatFenetre = {
  utilise: number;
  max: number;
  // Moment où la fenêtre repasse sous sa limite, si elle est atteinte (ms depuis l'epoch).
  reprise: number | null;
};

export const MESSAGE_LIMITE_FENETRE: Record<FenetreIa, string> = {
  jour: "Limite IA des dernières 24 heures atteinte.",
  semaine: "Limite IA des 7 derniers jours atteinte.",
};

export class LimiteIaFenetre extends Error {
  constructor(
    readonly fenetre: FenetreIa,
    readonly reprise: number | null
  ) {
    super(MESSAGE_LIMITE_FENETRE[fenetre]);
    this.name = "LimiteIaFenetre";
  }
}

/** Dépenses des 7 derniers jours, de la plus ancienne à la plus récente. null si le journal
 *  est illisible (migration 044 absente) : les limites glissantes ne s'appliquent alors pas. */
async function lireJournal(supabase: SupabaseClient, userId: string): Promise<{ cout: number; date: number }[] | null> {
  const depuis = new Date(Date.now() - DUREE_FENETRE_MS.semaine).toISOString();
  const { data, error } = await supabase
    .from("usage_ia_journal")
    .select("cout_eur, created_at")
    .eq("user_id", userId)
    .gte("created_at", depuis)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[ai-budget] Journal IA illisible (migration 044 appliquée ?) :", error.message);
    return null;
  }
  return ((data ?? []) as { cout_eur: number | string; created_at: string }[]).map((l) => ({
    cout: Number(l.cout_eur),
    date: new Date(l.created_at).getTime(),
  }));
}

function etatDepuisJournal(journal: { cout: number; date: number }[], plan: Plan, fenetre: FenetreIa, maintenant: number): EtatFenetre {
  const duree = DUREE_FENETRE_MS[fenetre];
  const dans = journal.filter((l) => l.date > maintenant - duree);
  const max = plafondFenetre(plan, fenetre);
  let utilise = dans.reduce((total, l) => total + l.cout, 0);
  const total = utilise;
  let reprise: number | null = null;
  if (utilise >= max) {
    // Les dépenses sortent de la fenêtre dans l'ordre : la limite se libère quand assez
    // d'entre elles sont sorties pour repasser sous le plafond.
    for (const l of dans) {
      utilise -= l.cout;
      if (utilise < max) {
        reprise = l.date + duree;
        break;
      }
    }
  }
  return { utilise: total, max, reprise };
}

/** État des deux limites glissantes, ou null si le journal est indisponible. */
export async function etatFenetres(supabase: SupabaseClient, userId: string, plan: Plan): Promise<Record<FenetreIa, EtatFenetre> | null> {
  const journal = await lireJournal(supabase, userId);
  if (!journal) return null;
  const maintenant = Date.now();
  return {
    jour: etatDepuisJournal(journal, plan, "jour", maintenant),
    semaine: etatDepuisJournal(journal, plan, "semaine", maintenant),
  };
}

/** Lève LimiteIaFenetre si la limite des 24 heures ou des 7 jours est déjà atteinte. */
export async function assertFenetresDisponibles(supabase: SupabaseClient, userId: string, plan: Plan, dejaEngageEuros = 0): Promise<void> {
  const etat = await etatFenetres(supabase, userId, plan);
  if (!etat) return;
  for (const fenetre of ["semaine", "jour"] as const) {
    if (etat[fenetre].utilise + dejaEngageEuros >= etat[fenetre].max) {
      throw new LimiteIaFenetre(fenetre, etat[fenetre].reprise ?? Date.now() + DUREE_FENETRE_MS[fenetre]);
    }
  }
}

export function reponseLimiteFenetre(err: LimiteIaFenetre) {
  return apiError(err.fenetre === "jour" ? "limite_ia_jour" : "limite_ia_semaine", 429, MESSAGE_LIMITE_FENETRE[err.fenetre], {
    values: { reprise: err.reprise ?? Date.now() },
  });
}

/** Réponse à renvoyer pour une erreur de budget ou de limite glissante ; null pour toute
 *  autre erreur (à traiter par l'appelant). */
export function reponseLimiteIa(err: unknown) {
  if (err instanceof BudgetIaDepasse) return reponseBudgetDepasse(err);
  if (err instanceof LimiteIaFenetre) return reponseLimiteFenetre(err);
  return null;
}

/** Tokens d'un modèle convertis en tokens du modèle `vers`, pour le même coût. */
function convertir(de: string, vers: ModeleIa, entree: number, sortie: number): [number, number] {
  if (de === vers) return [entree, sortie];
  const pDe = prixEuros(de);
  const pVers = prixEuros(vers);
  return [Math.ceil((entree * pDe.entree) / pVers.entree), Math.ceil((sortie * pDe.sortie) / pVers.sortie)];
}

/** Suivi du budget pendant une requête qui fait un ou plusieurs appels IA d'une même fonction. */
export class SuiviBudgetIa {
  private entree = 0;
  private sortie = 0;
  readonly modele: ModeleIa;

  /** `options.fenetres` : applique aussi les limites sur 24 heures et 7 jours (création de
   *  site et audit). Toutes les fonctions sont de toute façon comptées dans ces limites. */
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
    private readonly plan: Plan,
    readonly fonction: UsageFeature,
    private readonly options: { fenetres?: boolean } = {}
  ) {
    const modele = MODELE_PAR_FONCTION[fonction];
    if (!modele) throw new Error(`Aucun modèle IA associé à la fonction ${fonction}.`);
    this.modele = modele;
  }

  /** Coût de ce qui a déjà été consommé par cette requête. */
  get coutEngageEuros(): number {
    return coutEuros(this.modele, this.entree, this.sortie);
  }

  /** À appeler avant chaque appel Anthropic. Lève LimiteIaFenetre si une limite glissante est
   *  atteinte (seulement avec options.fenetres), BudgetIaDepasse si l'appel ne tient pas dans
   *  le budget du mois. */
  async verifier(coutEstimeEuros: number): Promise<void> {
    if (this.options.fenetres) await assertFenetresDisponibles(this.supabase, this.userId, this.plan, this.coutEngageEuros);
    await assertBudgetDisponible(this.supabase, this.userId, this.plan, coutEstimeEuros, this.coutEngageEuros);
  }

  /** Estimation à partir d'une entrée en tokens et du max_tokens de l'appel, au prix du modèle de la fonction. */
  estimer(tokensEntree: number, maxTokens: number): number {
    return estimationEuros(this.modele, tokensEntree, maxTokens);
  }

  /** Consommation réelle d'un appel. `modeleReel` : le modèle qui a répondu (message.model). */
  ajouter(modeleReel: string, usage: { input_tokens?: number | null; output_tokens?: number | null } | null | undefined): void {
    const [entree, sortie] = convertir(modeleReel, this.modele, usage?.input_tokens ?? 0, usage?.output_tokens ?? 0);
    this.entree += entree;
    this.sortie += sortie;
  }

  /** Enregistre la consommation accumulée (un seul appel à logTokensUsage par requête : ses
   *  lectures-écritures ne supportent pas d'appels simultanés). Ne lève jamais. */
  async enregistrer(): Promise<void> {
    const entree = this.entree;
    const sortie = this.sortie;
    const cout = this.coutEngageEuros;
    this.entree = 0;
    this.sortie = 0;
    if (entree === 0 && sortie === 0) return;
    try {
      // Journal horodaté des limites glissantes (migration 044). Indépendant de usage_mensuel :
      // l'un peut échouer sans l'autre.
      const { error: journalErr } = await this.supabase
        .from("usage_ia_journal")
        .insert({ user_id: this.userId, fonction: this.fonction, cout_eur: Number(cout.toFixed(6)) });
      if (journalErr) console.warn("[ai-budget] Journal IA non écrit (migration 044 appliquée ?) :", journalErr.message);

      const ok = await logTokensUsage(this.supabase, this.userId, this.fonction, entree, sortie);
      if (ok || !FONCTIONS_MIGRATION_043.includes(this.fonction)) return;
      // Migration 043 absente : la fonction n'est pas encore acceptée par la contrainte.
      const repli = MODELE_PAR_FONCTION[FONCTION_DE_REPLI]!;
      const [e, s] = convertir(this.modele, repli, entree, sortie);
      console.warn(`[ai-budget] ${this.fonction} enregistré sous ${FONCTION_DE_REPLI} : applique la migration 043_usage_mensuel_fonctions_ia.sql.`);
      await logTokensUsage(this.supabase, this.userId, FONCTION_DE_REPLI, e, s);
    } catch (err) {
      console.error("[ai-budget] Enregistrement des tokens échoué :", err);
    }
  }
}
