// Cache côté client des données déjà lues (réponses des routes /api), partagé par toutes les
// pages de l'onglet. Au retour sur une page, ses données s'affichent tout de suite :
//   - lues il y a moins de DUREE_FRAICHEUR_MS : aucune nouvelle requête ;
//   - plus anciennes : affichées quand même, puis relues en arrière-plan sans indicateur.
// Une modification faite dans l'interface met le cache à jour (modifierCache) ; une action qui
// change des données lues ailleurs les marque à relire (invaliderCache). Le cache est vidé à la
// déconnexion (viderCache), pour qu'un autre compte ne voie jamais ces données.
// Module sans React (testé par lib/cache-client.test.ts) ; le hook est dans
// components/chargement/useDonneesClient.ts.

export const DUREE_FRAICHEUR_MS = 60_000;

export type EntreeCache<T = unknown> = {
  donnees?: T;
  lueA?: number;
  erreur?: unknown;
  enCours: boolean;
};

const entrees = new Map<string, EntreeCache>();
const abonnes = new Map<string, Set<() => void>>();
const enVol = new Map<string, Promise<unknown>>();

function notifier(cle: string) {
  abonnes.get(cle)?.forEach((f) => f());
}

function poser(cle: string, entree: EntreeCache) {
  entrees.set(cle, entree);
  notifier(cle);
}

export function abonner(cle: string, rappel: () => void): () => void {
  let liste = abonnes.get(cle);
  if (!liste) abonnes.set(cle, (liste = new Set()));
  liste.add(rappel);
  return () => {
    liste.delete(rappel);
  };
}

/** Entrée courante (même objet tant qu'elle ne change pas : utilisable par useSyncExternalStore). */
export function instantane<T>(cle: string): EntreeCache<T> | undefined {
  return entrees.get(cle) as EntreeCache<T> | undefined;
}

export function estFraiche(entree: EntreeCache | undefined, maintenant = Date.now()): boolean {
  return entree?.lueA !== undefined && entree.donnees !== undefined && maintenant - entree.lueA < DUREE_FRAICHEUR_MS;
}

/** Charge une donnée dans le cache. Sans effet si elle est fraîche (sauf force) ; une seule
 *  requête à la fois par clé. Les données déjà présentes restent affichées pendant la relecture. */
export function chargerCache<T>(cle: string, charger: () => Promise<T>, options: { force?: boolean; maintenant?: () => number } = {}): Promise<T | undefined> {
  const horloge = options.maintenant ?? Date.now;
  const actuelle = entrees.get(cle) as EntreeCache<T> | undefined;
  if (!options.force && estFraiche(actuelle, horloge())) return Promise.resolve(actuelle!.donnees);
  const existante = enVol.get(cle);
  if (existante) return existante as Promise<T | undefined>;

  poser(cle, { ...actuelle, enCours: true });
  const promesse = charger()
    .then((donnees) => {
      poser(cle, { donnees, lueA: horloge(), enCours: false });
      return donnees as T | undefined;
    })
    .catch((erreur) => {
      poser(cle, { ...(entrees.get(cle) as EntreeCache<T>), erreur, enCours: false });
      return undefined;
    })
    .finally(() => enVol.delete(cle));
  enVol.set(cle, promesse);
  return promesse;
}

/** Applique une modification locale (mise à jour optimiste) ; renvoie la valeur précédente, à
 *  reposer avec remettreCache si l'envoi au serveur échoue. */
export function modifierCache<T>(cle: string, modifier: (donnees: T) => T): T | undefined {
  const actuelle = entrees.get(cle) as EntreeCache<T> | undefined;
  if (actuelle?.donnees === undefined) return undefined;
  poser(cle, { ...actuelle, donnees: modifier(actuelle.donnees) });
  return actuelle.donnees;
}

export function remettreCache<T>(cle: string, donnees: T) {
  const actuelle = entrees.get(cle);
  poser(cle, { ...actuelle, donnees, enCours: actuelle?.enCours ?? false });
}

/** Marque à relire toutes les clés qui commencent par ce préfixe (affichées jusqu'à la relecture). */
export function invaliderCache(prefixe: string) {
  for (const [cle, entree] of entrees) {
    if (cle.startsWith(prefixe)) poser(cle, { ...entree, lueA: 0 });
  }
}

export function viderCache() {
  const cles = [...entrees.keys()];
  entrees.clear();
  enVol.clear();
  cles.forEach(notifier);
}

/** Lecture JSON d'une route /api : lève une ErreurApi (avec le corps JSON) si la réponse n'est pas OK. */
export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    readonly corps: unknown
  ) {
    super(`HTTP ${statut}`);
  }
}

export async function lireJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const corps = await res.json().catch(() => null);
  if (!res.ok) throw new ErreurApi(res.status, corps);
  return corps as T;
}
