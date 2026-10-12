// Motif ILIKE sûr pour un filtre PostgREST `or=(...)` : virgules, parenthèses et guillemets
// casseraient la syntaxe du filtre, et % _ \ seraient interprétés comme jokers.
export function motifRecherche(search: string): string {
  const nettoye = search.replace(/[,()"]/g, " ").replace(/[\\%_]/g, (c) => `\\${c}`);
  return `%${nettoye}%`;
}
