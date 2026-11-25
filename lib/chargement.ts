// Règles d'affichage pendant une attente (vitesse perçue), selon le temps écoulé :
//   - 0 à 1 s     : aucun indicateur (contenu en cache affiché tout de suite, sinon l'écran
//                   précédent reste en place) ;
//   - 1 à 10 s    : squelette aux dimensions du contenu final, pulsation légère ;
//   - au-delà     : barre de progression et temps restant estimé, ou « encore quelques
//                   secondes » si l'estimation n'est pas fiable. Mise à jour 2 fois par seconde.
// Module pur, testé sans navigateur (lib/chargement.test.ts).

export const SEUIL_INDICATEUR_MS = 1_000;
export const SEUIL_PROGRESSION_MS = 10_000;
/** Rafraîchissement de l'indicateur : 2 fois par seconde (au moins 1 fois par seconde exigé). */
export const INTERVALLE_MAJ_MS = 500;
/** Interrogation de l'avancement réel d'une création de site (entre 1 et 2 s). */
export const INTERVALLE_SONDAGE_MS = 1_500;

export type PhaseChargement = "aucun" | "squelette" | "progression";

export function phaseChargement(ecouleMs: number): PhaseChargement {
  if (ecouleMs < SEUIL_INDICATEUR_MS) return "aucun";
  if (ecouleMs < SEUIL_PROGRESSION_MS) return "squelette";
  return "progression";
}

/** Avancement mesuré : quantité faite sur une quantité totale (attendue ou estimée). */
export type Avancement = { fait: number; total: number };

/** Part affichée sur la barre (0 à 1). Avec un avancement mesuré : fait / total, plafonné à
 *  95 % tant que ce n'est pas fini (le total n'est qu'une estimation). Sans mesure : courbe
 *  lente qui s'approche de 90 % sans l'atteindre, pour montrer que l'attente continue. */
export function partAffichee(ecouleMs: number, avancement?: Avancement | null): number {
  if (avancement && avancement.total > 0) {
    if (avancement.fait >= avancement.total) return 0.95;
    return Math.max(0, Math.min(0.95, avancement.fait / avancement.total));
  }
  const auDela = Math.max(0, ecouleMs - SEUIL_PROGRESSION_MS);
  return 0.9 * (1 - Math.exp(-auDela / 30_000));
}

/** Temps restant estimé, en secondes, ou null si l'estimation n'est pas fiable : il faut un
 *  avancement mesuré entre 10 % et 90 %, au moins 5 s de mesure, et un résultat de 10 minutes au
 *  plus. Calcul : vitesse moyenne constatée depuis le début (fait / temps écoulé). */
export function secondesRestantes(ecouleMs: number, avancement?: Avancement | null): number | null {
  if (!avancement || avancement.total <= 0 || ecouleMs < 5_000) return null;
  const part = avancement.fait / avancement.total;
  if (!(part >= 0.1 && part <= 0.9)) return null;
  const restant = (ecouleMs * (1 - part)) / part / 1_000;
  if (!Number.isFinite(restant) || restant > 600) return null;
  return Math.max(1, Math.round(restant));
}

/** Texte du temps restant : { cle, valeurs } à passer à t() (namespace « chargement »). */
export function texteRestant(secondes: number | null): { cle: "quelquesSecondes" | "restantSecondes" | "restantMinutes"; valeurs?: Record<string, number> } {
  if (secondes === null) return { cle: "quelquesSecondes" };
  if (secondes < 60) return { cle: "restantSecondes", valeurs: { secondes } };
  return { cle: "restantMinutes", valeurs: { minutes: Math.ceil(secondes / 60) } };
}

// ─── Création de site ──────────────────────────────────────────────────────────

/** Taille attendue du HTML produit par l'IA pour un site, en caractères. Hypothèse (24 000
 *  tokens de sortie au plus, environ 3,5 caractères par token, une page complète en utilise
 *  rarement la totalité) : elle sert seulement à remplir la barre ; le temps restant n'est
 *  affiché que si la mesure le rend fiable (voir secondesRestantes). */
export const CARACTERES_ATTENDUS_SITE = 60_000;

export type EtapeCreation = "preparation" | "redaction" | "relance" | "gabarits" | "termine" | "erreur";

/** Avancement de la création d'un site à partir de l'état serveur. La rédaction du HTML pèse
 *  90 % ; les gabarits du mode boutique (deuxième appel) les 10 % restants. */
export function avancementCreation(etape: EtapeCreation, caracteres: number): Avancement {
  const total = CARACTERES_ATTENDUS_SITE;
  switch (etape) {
    case "preparation":
      return { fait: 0, total };
    case "redaction":
    case "relance":
      return { fait: Math.min(caracteres, total * 0.9), total };
    case "gabarits":
      return { fait: total * 0.92, total };
    case "termine":
    case "erreur":
      return { fait: total, total };
  }
}
