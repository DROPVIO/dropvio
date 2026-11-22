/** Échappe un texte (souvent saisi par l'utilisateur) avant de l'insérer dans du HTML. */
export function echapperHtml(valeur: string): string {
  return valeur
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Date et heure en français, heure de Paris (ex. « 22 novembre 2026 à 14:05 »). */
export function dateHeureFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
}

export function dateFr(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(iso));
}

/** Gabarit HTML simple : aucune image ni ressource externe, styles en ligne. */
export function gabaritHtml(titre: string, lignes: Array<[string, string]>, paragraphes: string[]): string {
  const t = echapperHtml(titre);
  const tableau = lignes
    .map(
      ([libelle, valeur]) =>
        `<tr><td style="padding:4px 16px 4px 0;color:#666;vertical-align:top">${echapperHtml(libelle)}</td><td style="padding:4px 0;color:#111"><strong>${echapperHtml(valeur)}</strong></td></tr>`
    )
    .join("");
  const corps = paragraphes.map((p) => `<p style="margin:0 0 12px">${echapperHtml(p)}</p>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${t}</title></head><body style="margin:0;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111"><div style="max-width:560px;margin:0 auto"><p style="margin:0 0 16px;font-size:16px;font-weight:bold">Dropvio</p><h1 style="margin:0 0 16px;font-size:20px">${t}</h1><table style="border-collapse:collapse;margin:0 0 16px">${tableau}</table>${corps}</div></body></html>`;
}

export function gabaritTexte(titre: string, lignes: Array<[string, string]>, paragraphes: string[]): string {
  return [titre, "", ...lignes.map(([l, v]) => `${l} : ${v}`), "", ...paragraphes, "", "Dropvio"].join("\n");
}
