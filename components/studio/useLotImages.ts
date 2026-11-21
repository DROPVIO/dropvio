"use client";

import { useCallback, useRef, useState } from "react";
import { useApiErrorMessage } from "@/lib/use-api-error";

// Génération d'images en lot (Studio IA, onglet Images produits, et page boutique) : un appel à
// /api/media/generer par image, l'un après l'autre. Le serveur réserve chaque image sur le quota
// du mois avant de la générer ; ici, on s'arrête dès qu'il répond « quota épuisé », dès qu'une
// erreur rendrait les suivantes inutiles, ou quand l'utilisateur arrête.

export type ElementLot = {
  cle: string;
  /** Corps envoyé à /api/media/generer (produitId ou produitCatalogueId, format, consigne…). */
  corps: Record<string, unknown>;
};

export type EtatElement = { statut: "attente" | "en_cours" | "ok" } | { statut: "erreur"; message: string };
export type ImageGeneree = { id: string; url: string | null };
// raison « pause » : l'outil vient de passer en pause (finPause : heure de reprise, en ms).
export type ArretLot = { raison: "quota" | "pause" | "utilisateur" | "bloquant"; message: string | null; traites: number; total: number; finPause?: number };

const CODES_QUOTA = new Set(["expert_quota_images", "images_quota_epuise"]);
// Pause de l'outil déclenchée (lib/pauses-outils.ts) : arrêt, les images déjà générées restent.
const CODE_PAUSE = "outil_en_pause";
// Après ces codes, les éléments suivants échoueraient de la même façon.
const CODES_BLOQUANTS = new Set([
  "media_stockage_plein",
  "plan_payant_requis",
  "images_migration_requise",
  "media_trop_de_requetes",
  "auth_required",
  "outil_reglages_a_definir",
  "outil_migration_requise",
]);

export function useLotImages({ onImage }: { onImage?: () => void } = {}) {
  const apiErrorMessage = useApiErrorMessage();
  const [enCours, setEnCours] = useState(false);
  const [etats, setEtats] = useState<Record<string, EtatElement>>({});
  const [images, setImages] = useState<Record<string, ImageGeneree[]>>({});
  const [traites, setTraites] = useState(0);
  const [total, setTotal] = useState(0);
  const [arret, setArret] = useState<ArretLot | null>(null);
  const [codeArret, setCodeArret] = useState<string | null>(null);
  const demandeArret = useRef(false);

  const arreter = useCallback(() => {
    demandeArret.current = true;
  }, []);

  const lancer = useCallback(
    async (elements: ElementLot[], imagesParElement = 1): Promise<{ traites: number; arret: ArretLot | null }> => {
      const parElement = Math.max(1, Math.floor(imagesParElement));
      demandeArret.current = false;
      setEnCours(true);
      setArret(null);
      setCodeArret(null);
      setTraites(0);
      setTotal(elements.length);
      setEtats(Object.fromEntries(elements.map((e) => [e.cle, { statut: "attente" } as EtatElement])));

      let faits = 0;
      let fin: ArretLot | null = null;
      boucle: for (const element of elements) {
        if (demandeArret.current) {
          fin = { raison: "utilisateur", message: null, traites: faits, total: elements.length };
          break;
        }
        setEtats((e) => ({ ...e, [element.cle]: { statut: "en_cours" } }));
        let erreurElement: string | null = null;
        let obtenues = 0;
        for (let n = 0; n < parElement; n++) {
          if (demandeArret.current) break;
          try {
            const res = await fetch("/api/media/generer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(element.corps),
            });
            const json = await res.json().catch(() => null);
            if (res.ok && typeof json?.id === "string") {
              const image = { id: json.id as string, url: typeof json.url === "string" ? json.url : null };
              setImages((i) => ({ ...i, [element.cle]: [...(i[element.cle] ?? []), image] }));
              onImage?.();
              obtenues++;
              continue;
            }
            const message = apiErrorMessage(json, apiErrorMessage({ code: "media_service_indisponible" }));
            const code = typeof json?.code === "string" ? json.code : "";
            if (CODES_QUOTA.has(code) || CODES_BLOQUANTS.has(code) || code === CODE_PAUSE) {
              setEtats((e) => ({ ...e, [element.cle]: { statut: "erreur", message } }));
              setCodeArret(code);
              // Un élément commencé (au moins une image) compte comme traité.
              const commence = n > 0;
              if (commence) faits++;
              const reprise = Number(json?.values?.reprise);
              fin = {
                raison: code === CODE_PAUSE ? "pause" : CODES_QUOTA.has(code) ? "quota" : "bloquant",
                message,
                traites: faits,
                total: elements.length,
                ...(code === CODE_PAUSE && Number.isFinite(reprise) ? { finPause: reprise } : {}),
              };
              setTraites(faits);
              break boucle;
            }
            erreurElement = message;
            break;
          } catch {
            erreurElement = apiErrorMessage({ code: "network" });
            break;
          }
        }
        // Arrêt demandé avant la première image de cet élément : il n'a pas été traité.
        if (demandeArret.current && obtenues === 0 && !erreurElement) {
          setEtats((e) => ({ ...e, [element.cle]: { statut: "attente" } }));
          fin = { raison: "utilisateur", message: null, traites: faits, total: elements.length };
          break;
        }
        faits++;
        setTraites(faits);
        setEtats((e) => ({ ...e, [element.cle]: erreurElement ? { statut: "erreur", message: erreurElement } : { statut: "ok" } }));
      }
      if (!fin && demandeArret.current && faits < elements.length) {
        fin = { raison: "utilisateur", message: null, traites: faits, total: elements.length };
      }
      setArret(fin);
      setEnCours(false);
      return { traites: faits, arret: fin };
    },
    [apiErrorMessage, onImage]
  );

  const oublierImages = useCallback((cle: string, ids: string[]) => {
    setImages((i) => ({ ...i, [cle]: (i[cle] ?? []).filter((image) => !ids.includes(image.id)) }));
  }, []);

  return { lancer, arreter, enCours, etats, images, traites, total, arret, codeArret, oublierImages };
}
