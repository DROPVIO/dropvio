import { Resend } from "resend";
import { erreurServeur } from "./api-errors";

export type MessageEmail = { a: string; sujet: string; html: string; texte: string };
export type ResultatEnvoi = { envoye: boolean };

/** Client minimal (injectable dans les tests) : la partie de Resend utilisée ici. */
export type ClientEmail = {
  emails: { send(payload: { from: string; to: string; subject: string; html: string; text: string }): Promise<{ error: { message: string } | null }> };
};

/** Envoie un e-mail transactionnel via Resend. Ne lève jamais d'erreur : un envoi manqué ne doit
 *  pas faire échouer l'action qui l'a déclenché (rétractation, résiliation…).
 *  - RESEND_API_KEY ou EMAIL_EXPEDITEUR absent : rien n'est envoyé, avertissement en console.
 *  - Échec de Resend : journalisé (erreurServeur, avec référence), { envoye: false }. */
export async function envoyerEmail(
  message: MessageEmail,
  options: { env?: Record<string, string | undefined>; client?: ClientEmail } = {}
): Promise<ResultatEnvoi> {
  const env = options.env ?? process.env;
  const cle = env.RESEND_API_KEY;
  const expediteur = env.EMAIL_EXPEDITEUR;
  if (!cle || !expediteur) {
    console.warn(`[email] RESEND_API_KEY ou EMAIL_EXPEDITEUR manquant : « ${message.sujet} » non envoyé.`);
    return { envoye: false };
  }
  try {
    const client: ClientEmail = options.client ?? new Resend(cle);
    const { error } = await client.emails.send({ from: expediteur, to: message.a, subject: message.sujet, html: message.html, text: message.texte });
    if (error) {
      erreurServeur("email", `Resend : ${error.message}`);
      return { envoye: false };
    }
    return { envoye: true };
  } catch (err) {
    erreurServeur("email", err);
    return { envoye: false };
  }
}
