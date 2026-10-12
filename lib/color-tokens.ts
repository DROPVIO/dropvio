// Utilitaires partagés pour la personnalisation post-génération (couleurs) du Site Builder —
// consommés par components/site-builder/ColorTokenPanel.tsx, app/site-builder/page.tsx (mode
// IA, état figé après génération) et app/site-builder/TemplateEditor.tsx (mode Éditeur de
// templates, HTML recalculé en continu via useMemo — voir colorOverrides dans ce fichier).

// Tokens standards émis par lib/site-templates.ts et
// app/api/generate-site/route.ts (voir injectColorTokens) — un token hors de cette liste
// s'affiche quand même dans le panneau, avec son nom brut comme libellé.
// Clé de traduction (siteBuilder.couleurs.tokens.*) du libellé de chaque token éditable.
export const TOKEN_CLES: Record<string, string> = {
  "--site-bg": "siteBg",
  "--site-text": "siteText",
  "--site-text-muted": "siteTextMuted",
  "--site-accent": "siteAccent",
  "--site-accent-2": "siteAccent2",
  "--site-bg-alt": "siteBgAlt",
  "--site-surface": "siteSurface",
  "--site-border": "siteBorder",
};

export type ParsedColor = { hex: string; write: (newHex: string) => string };

// Accepte hex (#rgb, #rrggbb, #rrggbbaa...) et rgb()/rgba() — les deux familles utilisées par
// les templates et le mode IA. Une valeur composite (gradient, color-mix()...) n'est pas
// éditable via un simple <input type="color"> : le token reste affiché, en lecture seule,
// plutôt que de planter ou de mentir sur ce qu'il représente.
export function parseColorValue(value: string): ParsedColor | null {
  const hexMatch = value.match(/^#([0-9a-fA-F]{3,8})$/);
  if (hexMatch) {
    return { hex: normalizeHex(hexMatch[1]), write: (newHex) => newHex };
  }
  const rgbaMatch = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    const hex = `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
    return {
      hex,
      write: (newHex) => {
        const nr = parseInt(newHex.slice(1, 3), 16);
        const ng = parseInt(newHex.slice(3, 5), 16);
        const nb = parseInt(newHex.slice(5, 7), 16);
        return a !== undefined ? `rgba(${nr}, ${ng}, ${nb}, ${a})` : `rgb(${nr}, ${ng}, ${nb})`;
      },
    };
  }
  return null;
}

function normalizeHex(digits: string): string {
  if (digits.length === 3 || digits.length === 4) {
    const [r, g, b] = digits;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return `#${digits.slice(0, 6)}`;
}

// Repère le DERNIER bloc :root{...} du document généré : lib/site-templates.ts (mode Éditeur
// de templates) et injectColorTokens (mode IA, generate-site/route.ts) placent volontairement
// leur :root juste avant </style>, donc en dernier dans la cascade — c'est celui qui gagne
// réellement à l'affichage, peu importe qu'un autre :root existe plus haut (Claude peut en
// avoir déclaré un lui-même malgré la consigne de ne pas le faire).
export function extractRootTokens(html: string): Array<{ name: string; value: string }> {
  const blocks = [...html.matchAll(/:root\s*\{([^}]*)\}/g)];
  if (blocks.length === 0) return [];
  const lastBlock = blocks[blocks.length - 1][1];
  const decls = [...lastBlock.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+);/g)];
  const map = new Map<string, string>();
  for (const [, name, value] of decls) {
    // Seuls les tokens de couleur (convention --site-*, voir lib/site-templates.ts et
    // injectColorTokens dans generate-site/route.ts) sont proposés ici — un :root peut aussi
    // contenir --fs-h1/--fs-body/... (tailles de police, non liées à la couleur) qui n'ont
    // rien à faire dans ce panneau.
    if (name.startsWith("--site-")) map.set(name, value.trim());
  }
  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

// Remplace TOUTES les occurrences du token (au cas où plusieurs :root le déclarent, voir
// extractRootTokens ci-dessus) pour que le changement s'applique de façon fiable.
export function applyTokenValue(html: string, name: string, value: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return html.replace(new RegExp(`(${escaped}\\s*:\\s*)[^;]+;`, "g"), `$1${value};`);
}

// Réapplique un ensemble de couleurs personnalisées sur un HTML fraîchement recalculé (mode
// Éditeur de templates : le useMemo qui produit le HTML de base ignore les overrides, donc ils
// doivent être reprojetés à chaque rendu — voir TemplateEditor.tsx).
export function applyTokenOverrides(html: string, overrides: Record<string, string>): string {
  return Object.entries(overrides).reduce((acc, [name, value]) => applyTokenValue(acc, name, value), html);
}
