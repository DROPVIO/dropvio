// Rétractation en ligne (/retractation) : validation de la demande et numéro de référence.
// Sans dépendance serveur.

export const DELAI_RETRACTATION_JOURS = 14;

export type DemandeRetractation = {
  nom: string;
  email: string;
  achat: string;
  achatRef: string | null;
  dateAchat: string; // AAAA-MM-JJ
};

export type AchatRecent = { ref: string; libelle: string; date: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Demande nettoyée, ou la liste des champs invalides. */
export function validerDemande(valeur: unknown): { ok: true; demande: DemandeRetractation } | { ok: false; champs: string[] } {
  const v = (typeof valeur === "object" && valeur !== null ? valeur : {}) as Record<string, unknown>;
  const texte = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");
  const nom = texte(v.nom, 200);
  const email = texte(v.email, 320).toLowerCase();
  const achat = texte(v.achat, 500);
  const achatRef = texte(v.achatRef, 100) || null;
  const dateAchat = texte(v.dateAchat, 10);

  const champs: string[] = [];
  if (nom.length < 2) champs.push("nom");
  if (!EMAIL.test(email)) champs.push("email");
  if (achat.length < 2) champs.push("achat");
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateAchat) ? new Date(`${dateAchat}T00:00:00Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 86_400_000) champs.push("dateAchat");

  return champs.length ? { ok: false, champs } : { ok: true, demande: { nom, email, achat, achatRef, dateAchat } };
}

/** Référence lisible de l'accusé de réception : RET-AAAAMMJJ-XXXXXX. */
export function referenceRetractation(maintenant = new Date(), aleatoire = Math.random): string {
  const jour = maintenant.toISOString().slice(0, 10).replace(/-/g, "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(aleatoire() * alphabet.length)];
  return `RET-${jour}-${code}`;
}
