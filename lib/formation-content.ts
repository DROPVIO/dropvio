import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { remark } from "remark";
import html from "remark-html";
import type { AppLocale } from "@/lib/locale";

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

// Traductions rangées sous content/formation/<langue>/<collection>/, avec les mêmes noms de
// fichiers que la version française : l'id d'un module ne dépend donc pas de la langue (les
// liens /formation/lire/[moduleId] et la possession d'une collection restent valables quand
// l'utilisateur change de langue). Seul l'anglais existe pour l'instant ; es et it retombent
// sur le français, comme le reste de l'app quand une traduction manque.
const TRANSLATED_LOCALES = ["en"] as const;
type FormationLocale = "fr" | (typeof TRANSLATED_LOCALES)[number];

function toFormationLocale(locale: AppLocale): FormationLocale {
  return (TRANSLATED_LOCALES as readonly string[]).includes(locale) ? (locale as FormationLocale) : "fr";
}

// La liste et l'ordre des modules viennent toujours du dossier français ; un fichier pas encore
// traduit est servi en français plutôt que de disparaître de la formation.
function loadCollection(collection: FormationCollection, locale: FormationLocale): FormationModule[] {
  const dir = path.join(CONTENT_DIR, collection);
  if (!fs.existsSync(dir)) return [];
  const translatedDir = locale === "fr" ? null : path.join(CONTENT_DIR, locale, collection);

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md") || file.endsWith(".mdx"))
    .sort((a, b) => orderKey(a) - orderKey(b) || a.localeCompare(b))
    .map((file) => {
      const translatedPath = translatedDir ? path.join(translatedDir, file) : null;
      const source = translatedPath && fs.existsSync(translatedPath) ? translatedPath : path.join(dir, file);
      const raw = fs.readFileSync(source, "utf8");
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

function loadModules(locale: FormationLocale): FormationModule[] {
  return [...loadCollection("courte", locale), ...loadCollection("longue", locale)];
}

const MODULES_PAR_LANGUE: Record<FormationLocale, FormationModule[]> = {
  fr: loadModules("fr"),
  en: loadModules("en"),
};

export function getFormationModules(locale: AppLocale): FormationModule[] {
  return MODULES_PAR_LANGUE[toFormationLocale(locale)];
}
