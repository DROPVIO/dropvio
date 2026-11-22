import type { MessageEmail } from "../email";
import { dateHeureFr, gabaritHtml, gabaritTexte } from "./commun";

export const SUJET_ACCUSE_RETRACTATION = "Accusé de réception de votre demande de rétractation";
export const PHRASE_REMBOURSEMENT =
  "Votre demande a bien été reçue. Nous vous remboursons au plus tard 14 jours après sa réception, par le même moyen de paiement.";

/** Accusé de réception envoyé à l'adresse saisie dans le formulaire /retractation. */
export function emailAccuseRetractation(d: { a: string; nom: string; reference: string; recueLe: string; achat: string }): MessageEmail {
  const lignes: Array<[string, string]> = [
    ["Référence", d.reference],
    ["Reçue le", dateHeureFr(d.recueLe)],
    ["Achat concerné", d.achat],
  ];
  const paragraphes = [
    `Bonjour ${d.nom},`,
    PHRASE_REMBOURSEMENT,
    "Conservez cette référence : elle vous sera demandée pour tout échange au sujet de cette demande.",
  ];
  return {
    a: d.a,
    sujet: SUJET_ACCUSE_RETRACTATION,
    html: gabaritHtml(SUJET_ACCUSE_RETRACTATION, lignes, paragraphes),
    texte: gabaritTexte(SUJET_ACCUSE_RETRACTATION, lignes, paragraphes),
  };
}
