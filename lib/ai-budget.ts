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
  budgetIaEur,
  currentMonthKey,
  logTokensUsage,
  type Plan,
  type PlanOuAucun,
  type UsageFeature,
} from "@/lib/plan-limits";
import { coutEuros, prixEuros, type ModeleIa } from "@/lib/ai-pricing";
import { IMAGE_PRICE_EUR } from "@/lib/expert-pricing";
import { apiError } from "@/lib/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

export const MODELE_PAR_FONCTION: Record<UsageFeature, ModeleIa | null> = {
  site_builder: "claude-sonnet-5-5",
  audit_ia: "claude-sonnet-4-6",
  inspiration_ia: "claude-sonnet-4-6",
  boutique_ia: "claude-opus-5-5",
  textes_ia: "claude-haiku-4-5",
  // Aucune IA (API AliExpress) : jamais de tokens.
  finder_alternatives: null,
  // Images (Pro, Agency) : pas de tokens, et hors budget IA : elles ont leur propre budget
  // (IMAGE_BUDGET_EUR_PAR_PLAN, getImagesUsedEuros ci-dessous).
  images_ia: null,
};

// Fonctions ajoutées par la migration 043. Si elle n'est pas appliquée, leurs tokens sont
// enregistrés sous FONCTION_DE_REPLI, convertis au même coût (voir enregistrer()).
const FONCTIONS_MIGRATION_043: UsageFeature[] = ["inspiration_ia", "boutique_ia", "textes_ia"];
const FONCTION_DE_REPLI: UsageFeature = "audit_ia";

export const MESSAGE_BUDGET_DEPASSE = "Ton budget IA du mois est épuisé. Il sera remis à zéro le 1er du mois prochain.";
export const MESSAGE_BUDGET_INSUFFISANT = "Budget IA du mois insuffisant pour cette demande.";

// En dessous d'un centime restant, le budget est considéré comme épuisé (message dédié).
const SEUIL_EPUISE_EUROS = 0.01;

export type DecisionBudget = { ok: boolean; restantEuros: number };

/** Décision pure : l'appel estimé tient-il dans le budget du mois ? `engageEuros` : consommé par
 *  la requête en cours mais pas encore enregistré. */
export function decisionBudget(budgetEuros: number, utiliseEuros: number, engageEuros: number, estimeEuros: number): DecisionBudget {
  const restantEuros = Math.max(0, budgetEuros - utiliseEuros - engageEuros);
  return { ok: estimeEuros <= restantEuros, restantEuros };
}

export class BudgetIaDepasse extends Error {
  constructor(
    readonly utiliseEuros: number,
    readonly budgetEuros: number,
    readonly estimeEuros: number
  ) {
    super(MESSAGE_BUDGET_DEPASSE);
    this.name = "BudgetIaDepasse";
  }

  get restantEuros(): number {
    return Math.max(0, this.budgetEuros - this.utiliseEuros);
  }
}

/** Réponse HTTP 402 renvoyée quand le budget du mois ne couvre pas l'appel demandé : « épuisé »
 *  s'il ne reste (presque) rien, sinon « insuffisant », avec le budget restant à afficher. */
export function reponseBudgetDepasse(err: BudgetIaDepasse) {
  const restant = arrondiCentime(err.restantEuros);
  const epuise = err.restantEuros < SEUIL_EPUISE_EUROS;
  return apiError(epuise ? "budget_ia_depasse" : "budget_ia_insuffisant", 402, epuise ? MESSAGE_BUDGET_DEPASSE : MESSAGE_BUDGET_INSUFFISANT, {
    budget: { utilise: arrondiCentime(err.utiliseEuros), max: err.budgetEuros, restant },
    values: { restant },
  });
}

/** Tokens de sortie qu'un montant en euros permet encore sur un modèle : indication affichée,
 *  la sortie étant la partie la plus chère d'une génération (l'entrée en consomme aussi). */
export function tokensSortieEquivalents(euros: number, modele: ModeleIa): number {
  const prix = prixEuros(modele).sortie;
  return prix > 0 ? Math.floor((Math.max(0, euros) * 1_000_000) / prix) : 0;
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
  const parFonction = await getBudgetParFonction(supabase, userId);
  return Object.values(parFonction).reduce((total, euros) => total + euros, 0);
}

const FEATURE_IMAGES: UsageFeature = "images_ia";

/** Coût en euros d'un nombre d'images (budget images, jamais budget IA). */
export function coutImagesEuros(images: number): number {
  return Math.max(0, images) * IMAGE_PRICE_EUR;
}

/** Budget images consommé ce mois-ci (plans Pro et Agency) : images comptées dans
 *  usage_mensuel (feature images_ia) au prix IMAGE_PRICE_EUR. Jamais compté dans le budget IA. */
export async function getImagesUsedEuros(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("usage_mensuel")
    .select("feature, compteur")
    .eq("user_id", userId)
    .eq("feature", FEATURE_IMAGES)
    .eq("mois", currentMonthKey());
  if (error) throw new Error(error.message);
  const images = ((data ?? []) as { feature: UsageFeature; compteur: number | null }[])
    .filter((l) => l.feature === FEATURE_IMAGES)
    .reduce((total, l) => total + (l.compteur ?? 0), 0);
  return coutImagesEuros(images);
}

/** Coût IA consommé ce mois-ci, fonction par fonction (fonctions sans dépense absentes). Les
 *  images n'y figurent pas : elles ont leur propre budget (getImagesUsedEuros). */
export async function getBudgetParFonction(supabase: SupabaseClient, userId: string): Promise<Partial<Record<UsageFeature, number>>> {
  const { data, error } = await supabase
    .from("usage_mensuel")
    .select("feature, compteur, tokens_entree, tokens_sortie")
    .eq("user_id", userId)
    .eq("mois", currentMonthKey());
  if (error) {
    // Sans 037a (colonnes de tokens), le coût ne peut pas être calculé : on le signale et on
    // compte 0 plutôt que de bloquer toutes les fonctions IA.
    console.warn("[ai-budget] Lecture de usage_mensuel échouée :", error.message);
    return {};
  }
  const parFonction: Partial<Record<UsageFeature, number>> = {};
  for (const ligne of (data ?? []) as { feature: UsageFeature; compteur: number | null; tokens_entree: number | null; tokens_sortie: number | null }[]) {
    // Images : budget images séparé, jamais décomptées du budget IA.
    if (ligne.feature === FEATURE_IMAGES) continue;
    const modele = MODELE_PAR_FONCTION[ligne.feature];
    if (!modele) continue;
    const euros = coutEuros(modele, ligne.tokens_entree ?? 0, ligne.tokens_sortie ?? 0);
    if (euros > 0) parFonction[ligne.feature] = (parFonction[ligne.feature] ?? 0) + euros;
  }
  return parFonction;
}

/** Lève BudgetIaDepasse si le coût déjà consommé ce mois-ci (+ `dejaEngageEuros`, consommé par
 *  la requête en cours mais pas encore enregistré) + `coutEstimeEuros` dépasse le budget. */
export async function assertBudgetDisponible(
  supabase: SupabaseClient,
  userId: string,
  plan: PlanOuAucun,
  coutEstimeEuros: number,
  dejaEngageEuros = 0
): Promise<void> {
  const budget = budgetIaEur(plan);
  const dejaUtilise = await getBudgetUsedEuros(supabase, userId);
  if (!decisionBudget(budget, dejaUtilise, dejaEngageEuros, coutEstimeEuros).ok) {
    throw new BudgetIaDepasse(dejaUtilise + dejaEngageEuros, budget, coutEstimeEuros);
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

export function plafondFenetre(plan: PlanOuAucun, fenetre: FenetreIa): number {
  return budgetIaEur(plan) * (fenetre === "jour" ? AI_BUDGET_PART_JOUR : AI_BUDGET_PART_SEMAINE);
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
    // Images : hors budget IA, donc hors limites glissantes (lignes éventuellement journalisées
    // avant la séparation des deux budgets).
    .neq("fonction", FEATURE_IMAGES)
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

function etatDepuisJournal(journal: { cout: number; date: number }[], plan: PlanOuAucun, fenetre: FenetreIa, maintenant: number): EtatFenetre {
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
export async function etatFenetres(supabase: SupabaseClient, userId: string, plan: PlanOuAucun): Promise<Record<FenetreIa, EtatFenetre> | null> {
  const journal = await lireJournal(supabase, userId);
  if (!journal) return null;
  const maintenant = Date.now();
  return {
    jour: etatDepuisJournal(journal, plan, "jour", maintenant),
    semaine: etatDepuisJournal(journal, plan, "semaine", maintenant),
  };
}

/** Lève LimiteIaFenetre si la limite des 24 heures ou des 7 jours est déjà atteinte. */
export async function assertFenetresDisponibles(supabase: SupabaseClient, userId: string, plan: PlanOuAucun, dejaEngageEuros = 0): Promise<void> {
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

type UsageAppel = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
};

/** Suivi du budget pendant une requête qui fait un ou plusieurs appels IA d'une même fonction. */
export class SuiviBudgetIa {
  private entree = 0;
  private sortie = 0;
  readonly tokensReels = { entree: 0, sortie: 0, cacheEcriture: 0, cacheLecture: 0 };
  readonly modele: ModeleIa;

  /** `options.fenetres` : applique aussi les limites sur 24 heures et 7 jours (création de
   *  site et audit). Toutes les fonctions sont de toute façon comptées dans ces limites.
   *  `options.ecriture` : client des écritures (service role par défaut ; injectable pour les tests).
   *  `options.horsBudget` : génération déjà payée par une unité du plan Expert. Rien n'est
   *  vérifié ni enregistré ici : les tokens réels vont dans expert_generations (tokensReels). */
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly userId: string,
    private readonly plan: PlanOuAucun,
    readonly fonction: UsageFeature,
    private readonly options: { fenetres?: boolean; horsBudget?: boolean; ecriture?: SupabaseClient } = {}
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
    if (this.options.horsBudget) return;
    if (this.options.fenetres) await assertFenetresDisponibles(this.supabase, this.userId, this.plan, this.coutEngageEuros);
    await assertBudgetDisponible(this.supabase, this.userId, this.plan, coutEstimeEuros, this.coutEngageEuros);
  }

  /** Estimation à partir d'une entrée en tokens et du max_tokens de l'appel, au prix du modèle de la fonction. */
  estimer(tokensEntree: number, maxTokens: number): number {
    return estimationEuros(this.modele, tokensEntree, maxTokens);
  }

  /** Consommation réelle d'un appel. `modeleReel` : le modèle qui a répondu (message.model). */
  ajouter(modeleReel: string, usage: UsageAppel | null | undefined): void {
    const cacheEcriture = usage?.cache_creation_input_tokens ?? 0;
    const cacheLecture = usage?.cache_read_input_tokens ?? 0;
    this.tokensReels.entree += usage?.input_tokens ?? 0;
    this.tokensReels.sortie += usage?.output_tokens ?? 0;
    this.tokensReels.cacheEcriture += cacheEcriture;
    this.tokensReels.cacheLecture += cacheLecture;
    if (this.options.horsBudget) return;
    // input_tokens exclut le cache : sans ces deux termes, le budget serait sous-estimé. Écriture
    // à 1,25 fois l'entrée, lecture à 0,1 fois, ramenées en tokens d'entrée de même coût.
    const entreeEquivalente = Math.ceil((usage?.input_tokens ?? 0) + cacheEcriture * 1.25 + cacheLecture * 0.1);
    const [entree, sortie] = convertir(modeleReel, this.modele, entreeEquivalente, usage?.output_tokens ?? 0);
    this.entree += entree;
    this.sortie += sortie;
  }

  /** Génération en échec : le coût accumulé par cette requête est rendu, rien n'est enregistré
   *  (budget du mois ni limites glissantes). Renvoie le coût abandonné, pour les logs. */
  abandonner(): number {
    const cout = this.coutEngageEuros;
    this.entree = 0;
    this.sortie = 0;
    if (cout > 0) console.warn(`[ai-budget] ${this.fonction} : génération en échec, ${cout.toFixed(4)} € rendus au budget.`);
    return cout;
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
      // Écritures par le service role, jamais par la session de l'utilisateur : il ne doit pas
      // pouvoir modifier ses propres compteurs (migration 055 : plus d'écriture via RLS).
      const ecriture = this.options.ecriture ?? createSupabaseAdminClient();
      // Journal horodaté des limites glissantes (migration 044). Indépendant de usage_mensuel :
      // l'un peut échouer sans l'autre.
      const { error: journalErr } = await ecriture
        .from("usage_ia_journal")
        .insert({ user_id: this.userId, fonction: this.fonction, cout_eur: Number(cout.toFixed(6)) });
      if (journalErr) console.warn("[ai-budget] Journal IA non écrit (migration 044 appliquée ?) :", journalErr.message);

      const ok = await logTokensUsage(ecriture, this.userId, this.fonction, entree, sortie);
      if (ok || !FONCTIONS_MIGRATION_043.includes(this.fonction)) return;
      // Migration 043 absente : la fonction n'est pas encore acceptée par la contrainte.
      const repli = MODELE_PAR_FONCTION[FONCTION_DE_REPLI]!;
      const [e, s] = convertir(this.modele, repli, entree, sortie);
      console.warn(`[ai-budget] ${this.fonction} enregistré sous ${FONCTION_DE_REPLI} : applique la migration 043_usage_mensuel_fonctions_ia.sql.`);
      await logTokensUsage(ecriture, this.userId, FONCTION_DE_REPLI, e, s);
    } catch (err) {
      console.error("[ai-budget] Enregistrement des tokens échoué :", err);
    }
  }
}
