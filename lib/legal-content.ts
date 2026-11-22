import { readFile } from "fs/promises";
import path from "path";
import { remark } from "remark";
import html from "remark-html";

// Pages juridiques : le texte vit dans content/legal/<page>.md (rédigé par l'éditeur du site,
// pas dans messages/). remark-html assainit la sortie (HTML brut du Markdown retiré).
export const PAGES_LEGALES = ["mentions-legales", "cgv", "confidentialite"] as const;
export type PageLegale = (typeof PAGES_LEGALES)[number];

export function markdownVersHtml(markdown: string): string {
  return String(remark().use(html).processSync(markdown));
}

export async function lireDocumentLegal(page: PageLegale): Promise<string> {
  const markdown = await readFile(path.join(process.cwd(), "content", "legal", `${page}.md`), "utf-8");
  return markdownVersHtml(markdown);
}
