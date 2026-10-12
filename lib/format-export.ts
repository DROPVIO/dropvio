/* Format d'export d'un site généré (sites_generes.format_export, migration 039).
 *
 * Le HTML standalone produit par la génération reste la SEULE forme stockée en base : ce
 * format ne décrit que le fichier remis à l'utilisateur. « liquid » déclenche une conversion
 * à la demande au moment du téléchargement ou du push Shopify (lib/html-to-liquid.ts), jamais
 * une réécriture de html_content. Changer de format après création est donc sans risque et
 * réversible. */

export const FORMATS_EXPORT = ["html", "liquid"] as const;

export type FormatExport = (typeof FORMATS_EXPORT)[number];

export function estFormatExport(v: unknown): v is FormatExport {
  return typeof v === "string" && (FORMATS_EXPORT as readonly string[]).includes(v);
}

/** Libellé affiché dans l'UI. Volontairement ici et non dans messages/*.json : « HTML » et
 *  « Liquid » sont des noms de formats de fichier, identiques dans les quatre langues. */
export const LABEL_FORMAT: Record<FormatExport, string> = {
  html: "HTML",
  liquid: "Liquid (Shopify)",
};
