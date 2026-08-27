import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";

export type FormationCollection = "courte" | "longue";

export interface FormationModule {
  id: string;
  titre: string;
  description: string;
  collection: FormationCollection;
  contenuHtml: string;
}

const CONTENT_DIR = path.join(process.cwd(), "content", "formation");

function slugFromFilename(filename: string): string {
  return filename
    .replace(/\.mdx?$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();
}

// Les fichiers numérotés (00-, 02b-, ...) se trient bien alphabétiquement, mais la
// version courte mélange des fichiers "partie-X-Y" (plusieurs leçons regroupées) et des
// fichiers thématiques numérotés (20-, 22-, ...) : on retrie donc sur le premier numéro
// rencontré (préfixe ou "partie-N") pour reconstituer l'ordre de lecture réel.
function orderKey(filename: string): number {
  const leading = filename.match(/^(\d+)/);
  if (leading) return parseInt(leading[1], 10);
  const partie = filename.match(/partie-(\d+)/);
  if (partie) return parseInt(partie[1], 10);
  return Number.MAX_SAFE_INTEGER;
}

function extractTitre(markdown: string, fmTitre: unknown, fallback: string): string {
  if (typeof fmTitre === "string" && fmTitre.trim()) return fmTitre.trim();
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function extractDescription(markdown: string, fmDescription: unknown): string {
  if (typeof fmDescription === "string" && fmDescription.trim()) return fmDescription.trim();
  const withoutHeading = markdown.replace(/^#\s+.+$/m, "");
  const paragraphs = withoutHeading.split(/\r?\n\r?\n/);
  for (const paragraph of paragraphs) {
    const text = paragraph.replace(/[#*>`_]/g, "").replace(/\s+/g, " ").trim();
    if (text) return text.length > 240 ? `${text.slice(0, 240).trimEnd()}…` : text;
  }
  return "";
}

function renderHtml(markdown: string): string {
  return String(remark().use(html).processSync(markdown));
}

function loadCollection(collection: FormationCollection): FormationModule[] {
  const dir = path.join(CONTENT_DIR, collection);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .sort((a, b) => orderKey(a) - orderKey(b) || a.localeCompare(b))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { content: markdown, data: frontmatter } = matter(raw);
      const slug = slugFromFilename(file);

      return {
        id: `${collection}-${slug}`,
        titre: extractTitre(markdown, frontmatter.title, slug),
        description: extractDescription(markdown, frontmatter.description),
        collection,
        contenuHtml: renderHtml(markdown),
      };
    });
}

export const FORMATION_MODULES: FormationModule[] = [
  ...loadCollection("courte"),
  ...loadCollection("longue"),
];
