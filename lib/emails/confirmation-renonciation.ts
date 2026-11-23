import type { MessageEmail } from "../email";
import { dateFr, dateHeureFr, gabaritHtml, gabaritTexte } from "./commun";

export const SUJET_CONFIRMATION_RENONCIATION = "Confirmation de votre renonciation au contrat";

const NOMS_OFFRES: Record<string, string> = { pro: "Pro", agency: "Agency", expert: "Expert" };

const montant = (centimes: number, devise: string | null) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: (devise ?? "eur").toUpperCase() }).format(centimes / 100);

/** Confirmation envoyée à l'e-mail du compte après « Confirmer la renonciation » (espace client). */
export function emailConfirmationRenonciation(d: {
  a: string;
  reference: string;
  plan: string | null;
  dateSouscription: string;
  recueLe: string;
  motif: string | null;
  montantRembourseCentimes: number;
  devise: string | null;
  remboursementComplet: boolean;
}): MessageEmail {
  const offre = d.plan ? (NOMS_OFFRES[d.plan] ?? d.plan) : "Abonnement";
  const lignes: Array<[string, string]> = [
    ["Référence", d.reference],
    ["Offre", offre],
    ["Date de souscription", dateFr(`${d.dateSouscription}T12:00:00Z`)],
    ["Reçue le", dateHeureFr(d.recueLe)],
  ];
  if (d.motif) lignes.push(["Motif", d.motif]);
  if (d.montantRembourseCentimes > 0) lignes.push(["Remboursement lancé", montant(d.montantRembourseCentimes, d.devise)]);
  const paragraphes = [
    "Bonjour,",
    `Votre renonciation au contrat ${offre} est enregistrée : l'abonnement est arrêté et aucun nouveau prélèvement n'aura lieu.`,
    d.remboursementComplet
      ? "Nous vous remboursons l'intégralité des sommes versées pour cet abonnement, par le même moyen de paiement. Le remboursement apparaît sur votre compte sous quelques jours ouvrés."
      : "Nous vous remboursons l'intégralité des sommes versées pour cet abonnement, par le même moyen de paiement, au plus tard 14 jours après la réception de votre demande.",
    "Conservez cette référence : elle vous sera demandée pour tout échange au sujet de cette renonciation.",
  ];
  return {
    a: d.a,
    sujet: SUJET_CONFIRMATION_RENONCIATION,
    html: gabaritHtml(SUJET_CONFIRMATION_RENONCIATION, lignes, paragraphes),
    texte: gabaritTexte(SUJET_CONFIRMATION_RENONCIATION, lignes, paragraphes),
  };
}
