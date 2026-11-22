import type { MessageEmail } from "../email";
import { dateFr, gabaritHtml, gabaritTexte } from "./commun";

export const SUJET_CONFIRMATION_RESILIATION = "Confirmation de la résiliation de votre abonnement";

const NOMS_OFFRES: Record<string, string> = { pro: "Pro", agency: "Agency", expert: "Expert" };

/** Confirmation envoyée à l'e-mail du compte après « Confirmer la résiliation ». */
export function emailConfirmationResiliation(d: { a: string; reference: string; plan: string | null; finAcces: string | null }): MessageEmail {
  const offre = d.plan ? (NOMS_OFFRES[d.plan] ?? d.plan) : "Abonnement";
  const fin = d.finAcces ? dateFr(d.finAcces) : "date non communiquée";
  const lignes: Array<[string, string]> = [
    ["Référence", d.reference],
    ["Offre", offre],
    ["Fin de l'accès", fin],
  ];
  const paragraphes = [
    "Bonjour,",
    `La résiliation de votre abonnement ${offre} est enregistrée. Vous gardez l'accès jusqu'au ${fin} ; aucun nouveau prélèvement n'aura lieu.`,
    "Conservez cette référence : elle vous sera demandée pour tout échange au sujet de cette résiliation.",
  ];
  return {
    a: d.a,
    sujet: SUJET_CONFIRMATION_RESILIATION,
    html: gabaritHtml(SUJET_CONFIRMATION_RESILIATION, lignes, paragraphes),
    texte: gabaritTexte(SUJET_CONFIRMATION_RESILIATION, lignes, paragraphes),
  };
}
