// Mention « Contenu généré par IA » (AI Act, art. 50) dans le pied de page des sites générés,
// dans la langue du site (siteContenu.mentionIa). Ajoutée à la fin du dernier <footer>, sinon
// juste avant </body>. Idempotente : une page qui la porte déjà n'est pas modifiée.
export const ATTRIBUT_MENTION_IA = "data-dv-mention-ia";

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function avecMentionIaSite(html: string, texte: string): string {
  if (!html || html.includes(ATTRIBUT_MENTION_IA)) return html;
  const mention = `<p ${ATTRIBUT_MENTION_IA}="" style="margin:8px 0 0;font-size:12px;opacity:.7;">${echapper(texte)}</p>`;
  const bas = html.toLowerCase();
  const finFooter = bas.lastIndexOf("</footer>");
  if (finFooter >= 0) return `${html.slice(0, finFooter)}${mention}\n${html.slice(finFooter)}`;
  const finBody = bas.lastIndexOf("</body>");
  if (finBody >= 0) {
    return `${html.slice(0, finBody)}<footer ${ATTRIBUT_MENTION_IA}-pied="" style="text-align:center;padding:16px;">${mention}</footer>\n${html.slice(finBody)}`;
  }
  return `${html}\n${mention}`;
}

/** Applique la mention à la page d'accueil et à chaque page d'un site multi-pages. */
export function siteAvecMentionIa<T extends { html: string; pages?: Record<string, string> }>(site: T, texte: string): T {
  const pages = site.pages
    ? Object.fromEntries(Object.entries(site.pages).map(([cle, html]) => [cle, avecMentionIaSite(html, texte)]))
    : undefined;
  return { ...site, html: avecMentionIaSite(site.html, texte), ...(pages ? { pages } : {}) };
}
