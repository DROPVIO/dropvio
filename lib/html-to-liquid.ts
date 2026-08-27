// Convertit le HTML standalone généré par l'IA en section Liquid Shopify (styles +
// contenu du <body> encapsulés dans un {% schema %}). Logique partagée entre le
// téléchargement client (site-builder) et le push serveur vers l'Admin API Shopify —
// garder une seule implémentation évite que les deux divergent silencieusement.
export function htmlToLiquidSection(html: string, schemaLabel: string): string {
  const styleBlocks: string[] = [];
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(html)) !== null) {
    styleBlocks.push(`<style>${match[1]}</style>`);
  }

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = (
    bodyMatch
      ? bodyMatch[1].replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      : html
          .replace(/<html\b[^>]*>/gi, "")
          .replace(/<\/html>/gi, "")
          .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
          .replace(/<body\b[^>]*>/gi, "")
          .replace(/<\/body>/gi, "")
  ).trim();

  const schemaName = schemaLabel.slice(0, 25).replace(/"/g, '\\"');
  return [
    ...styleBlocks,
    "",
    `<div class="dropvio-landing">`,
    bodyContent,
    `</div>`,
    "",
    `{% schema %}`,
    JSON.stringify({ name: schemaName, settings: [], presets: [{ name: schemaName }] }, null, 2),
    `{% endschema %}`,
  ].join("\n");
}

// Clé d'asset de thème dérivée d'un nom de produit — alphanumérique uniquement,
// courte, stable pour une même entrée (réutilisée à chaque push pour écraser plutôt
// que dupliquer l'asset).
export function slugifyForShopify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 30) || "landing"
  );
}
