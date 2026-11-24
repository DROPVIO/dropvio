import { readFile } from "fs/promises";
import path from "path";
import { remark } from "remark";
import html from "remark-html";

// Pages juridiques : le texte vit dans content/legal/<page>.md (rédigé par l'éditeur du site,
// pas dans messages/). remark-html assainit la sortie (HTML brut du Markdown retiré).
export const PAGES_LEGALES = ["mentions-legales", "cgv", "confidentialite"] as const;
export type PageLegale = (typeof PAGES_LEGALES)[number];

/** Ancre d'un titre de section : « 7. Cookies » → « cookies ». */
export function ancreTitre(titre: string): string {
  return titre
    .replace(/<[^>]*>/g, "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\s*\d+[.)]?\s*/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Le texte n'est pas modifié : seuls les titres de section (h2) reçoivent un id, pour que le
 *  pied de page puisse pointer vers une section (ex. /confidentialite#cookies). */
export function markdownVersHtml(markdown: string): string {
  const rendu = String(remark().use(html).processSync(markdown));
  return rendu.replace(/<h2>([\s\S]*?)<\/h2>/g, (bloc, titre: string) => {
    const id = ancreTitre(titre);
    return id ? `<h2 id="${id}">${titre}</h2>` : bloc;
  });
}

export async function lireDocumentLegal(page: PageLegale): Promise<string> {
  const markdown = await readFile(path.join(process.cwd(), "content", "legal", `${page}.md`), "utf-8");
  return markdownVersHtml(markdown);
}
