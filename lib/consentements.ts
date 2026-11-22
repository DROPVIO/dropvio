// Consentement avant paiement (droit de rétractation) : textes exacts des deux cases, source
// unique pour l'affichage (components/ConsentementAchat.tsx) et pour la preuve enregistrée côté
// serveur (lib/consentements-serveur.ts, table consentements_achat). Sans dépendance serveur.
import type { AppLocale } from "./locale";

export type FamilleConsentement = "service" | "formation";

export type TypeAchat =
  | "abonnement_pro"
  | "abonnement_agency"
  | "abonnement_expert"
  | "recharge_expert"
  | "formation_courte"
  | "formation_longue"
  | "formation_bundle";

export function familleDeAchat(type: TypeAchat): FamilleConsentement {
  return type.startsWith("formation_") ? "formation" : "service";
}

// [case 1, case 2] par famille et par langue. Le français est le texte de référence.
export const TEXTES_CONSENTEMENT: Record<FamilleConsentement, Record<AppLocale, readonly [string, string]>> = {
  service: {
    fr: [
      "Je demande l'accès immédiat au service avant la fin du délai de rétractation de 14 jours.",
      "Je reconnais que, si j'exerce mon droit de rétractation, je paierai la part du service déjà fournie, et que je perdrai ce droit une fois le service entièrement exécuté.",
    ],
    en: [
      "I request immediate access to the service before the end of the 14-day withdrawal period.",
      "I acknowledge that, if I exercise my right of withdrawal, I will pay for the part of the service already provided, and that I will lose this right once the service has been fully performed.",
    ],
    es: [
      "Solicito el acceso inmediato al servicio antes de que finalice el plazo de desistimiento de 14 días.",
      "Reconozco que, si ejerzo mi derecho de desistimiento, pagaré la parte del servicio ya prestada, y que perderé este derecho una vez que el servicio se haya ejecutado por completo.",
    ],
    it: [
      "Chiedo l'accesso immediato al servizio prima della fine del periodo di recesso di 14 giorni.",
      "Riconosco che, se esercito il diritto di recesso, pagherò la parte del servizio già fornita, e che perderò tale diritto una volta che il servizio sarà stato interamente eseguito.",
    ],
  },
  formation: {
    fr: ["Je demande l'accès immédiat à la formation.", "Je reconnais perdre mon droit de rétractation dès le début de l'accès."],
    en: ["I request immediate access to the course.", "I acknowledge that I lose my right of withdrawal as soon as access begins."],
    es: ["Solicito el acceso inmediato a la formación.", "Reconozco que pierdo mi derecho de desistimiento en cuanto comienza el acceso."],
    it: ["Chiedo l'accesso immediato al corso.", "Riconosco di perdere il diritto di recesso dall'inizio dell'accesso."],
  },
};

/** Corps attendu par les routes de paiement. */
export type ConsentementsEnvoyes = { accesImmediat: boolean; renonciation: boolean; langue?: string };

export function consentementsComplets(valeur: unknown): valeur is ConsentementsEnvoyes {
  if (typeof valeur !== "object" || valeur === null) return false;
  const c = valeur as Partial<ConsentementsEnvoyes>;
  return c.accesImmediat === true && c.renonciation === true;
}
