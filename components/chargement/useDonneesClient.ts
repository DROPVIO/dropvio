"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { abonner, chargerCache, instantane, modifierCache, remettreCache, type EntreeCache } from "@/lib/cache-client";

const AUCUN_ABONNEMENT = () => () => {};

/** Données d'une page, lues dans le cache client (lib/cache-client.ts) : affichées tout de suite
 *  si elles ont déjà été lues, relues en arrière-plan si elles ne sont plus fraîches.
 *  - enAttente : aucune donnée à afficher encore (c'est le seul cas où un indicateur peut
 *    apparaître, après 1 s, voir IndicateurChargement) ;
 *  - modifier / remettre : mise à jour optimiste et retour arrière. */
export function useDonneesClient<T>(cle: string | null, charger: () => Promise<T>) {
  const chargerRef = useRef(charger);
  useEffect(() => {
    chargerRef.current = charger;
  });

  const s_abonner = useCallback((rappel: () => void) => (cle ? abonner(cle, rappel) : AUCUN_ABONNEMENT()), [cle]);
  const entree = useSyncExternalStore(
    s_abonner,
    () => (cle ? instantane<T>(cle) : undefined),
    () => undefined as EntreeCache<T> | undefined
  );

  useEffect(() => {
    if (cle) void chargerCache(cle, () => chargerRef.current());
  }, [cle]);

  const modifier = useCallback((f: (donnees: T) => T) => (cle ? modifierCache<T>(cle, f) : undefined), [cle]);
  const remettre = useCallback((donnees: T) => {
    if (cle) remettreCache(cle, donnees);
  }, [cle]);
  const recharger = useCallback(() => (cle ? chargerCache(cle, () => chargerRef.current(), { force: true }) : Promise.resolve(undefined)), [cle]);

  const donnees = entree?.donnees;
  return {
    donnees,
    enAttente: cle !== null && donnees === undefined && entree?.erreur === undefined,
    erreur: donnees === undefined ? entree?.erreur : undefined,
    modifier,
    remettre,
    recharger,
  };
}
