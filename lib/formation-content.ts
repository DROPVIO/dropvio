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

// Ordre de lecture : le champ `ordre` du front matter français s'il existe (version courte :
// les noms de fichiers, donc les URL des leçons, restent stables même quand l'ordre change),
// sinon le premier numéro du nom de fichier (préfixe ou "partie-N").
function orderKey(filename: string, ordre?: unknown): number {
  if (typeof ordre === "number" && Number.isFinite(ordre)) return ordre;
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
// l'utilisateur change de langue). Anglais, espagnol et italien : un module dont la traduction
// manque est servi en français (voir loadCollection), comme le reste de l'app.
const TRANSLATED_LOCALES = ["en", "es", "it"] as const;
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

  const fichiers = fs.readdirSync(dir).filter((file) => file.endsWith(".md") || file.endsWith(".mdx"));
  const cle = new Map(
    fichiers.map((file) => [file, orderKey(file, matter(fs.readFileSync(path.join(dir, file), "utf8")).data.ordre)])
  );

  return fichiers
    .sort((a, b) => cle.get(a)! - cle.get(b)! || a.localeCompare(b))
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
  es: loadModules("es"),
  it: loadModules("it"),
};

export function getFormationModules(locale: AppLocale): FormationModule[] {
  return MODULES_PAR_LANGUE[toFormationLocale(locale)];
}
