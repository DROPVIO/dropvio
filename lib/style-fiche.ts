// Fiche de style extraite de 1 à 3 captures d'inspiration (app/api/inspiration/route.ts),
// puis utilisée comme consignes de forme par app/api/generate-site/route.ts. Principe : l'IA
// de génération n'a jamais accès aux images ni au HTML de référence, seulement à ces valeurs
// énumérées. Aucune dépendance serveur : importé aussi par le Site Builder (client), et la
// fiche renvoyée par le client est revalidée côté serveur avant d'entrer dans le prompt.

export const TYPOS = ["serif", "sans", "mono"] as const;
export const RAYONS = [0, 8, 16, 24, 999] as const;
export const DENSITES = ["aeree", "normale", "dense"] as const;
export const BANNIERES = ["16/9", "21/9", "4/3", "plein-écran"] as const;
export const SECTIONS = ["hero-centré", "hero-split", "grille-3", "grille-2-alterne", "bandeau-citation", "pas-à-pas"] as const;
export const CARTES = ["plate", "bordée", "ombrée", "flottante"] as const;
export const SECTIONS_MAX = 5;

export type FicheStyle = {
  // Extraite et affichée, mais jamais injectée dans le prompt : la palette appliquée reste
  // celle du Site Builder (COULEURS fixes + tokens CSS). "" = couleur non reconnue.
  palette: { fond: string; encre: string; accent: string };
  typo: (typeof TYPOS)[number];
  rayon: (typeof RAYONS)[number];
  densite: (typeof DENSITES)[number];
  banniere: (typeof BANNIERES)[number];
  sections: (typeof SECTIONS)[number][];
  cartes: (typeof CARTES)[number];
};

const DEFAUTS = {
  typo: "sans",
  rayon: 8,
  densite: "normale",
  banniere: "16/9",
  cartes: "bordée",
} as const;

// Comparaison tolérante pour retrouver une valeur autorisée malgré une variante d'écriture
// (« Aérée », « 16:9 », « plein ecran », « pas a pas ») : minuscules, sans accents, « : »
// → « / », espaces et « _ » → « - ».
function normaliser(v: string): string {
  return v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/:/g, "/")
    .replace(/[\s_]+/g, "-");
}

function choisir<T extends string>(
  champ: string,
  brut: unknown,
  autorises: readonly T[],
  defaut: T,
  corrections: string[]
): T {
  if (typeof brut === "string") {
    if ((autorises as readonly string[]).includes(brut)) return brut as T;
    const trouve = autorises.find((a) => normaliser(a) === normaliser(brut));
    if (trouve) return trouve;
  }
  corrections.push(`${champ} : ${JSON.stringify(brut)} hors liste, remplacé par « ${defaut} ».`);
  return defaut;
}

function couleur(champ: string, brut: unknown, corrections: string[]): string {
  if (typeof brut === "string") {
    const v = brut.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
    const court = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(v);
    if (court) {
      const long = `#${court[1]}${court[1]}${court[2]}${court[2]}${court[3]}${court[3]}`.toLowerCase();
      corrections.push(`${champ} : « ${v} » converti en « ${long} ».`);
      return long;
    }
  }
  corrections.push(`${champ} : ${JSON.stringify(brut)} n'est pas une couleur hex, laissé vide.`);
  return "";
}

function rayon(brut: unknown, corrections: string[]): FicheStyle["rayon"] {
  const n = typeof brut === "number" ? brut : typeof brut === "string" ? parseFloat(brut) : NaN;
  if (!Number.isFinite(n)) {
    corrections.push(`rayon : ${JSON.stringify(brut)} n'est pas un nombre, remplacé par « ${DEFAUTS.rayon} ».`);
    return DEFAUTS.rayon;
  }
  const proche = RAYONS.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best));
  if (proche !== n) corrections.push(`rayon : ${JSON.stringify(brut)} hors liste, remplacé par la valeur la plus proche « ${proche} ».`);
  return proche;
}

// Valide une fiche de provenance non fiable (sortie du modèle vision, ou renvoyée par le
// client). Ne lève jamais : toute valeur hors liste est remplacée et signalée dans corrections.
export function validerFicheStyle(brut: unknown): { fiche: FicheStyle; corrections: string[] } {
  const corrections: string[] = [];
  const o = (brut && typeof brut === "object" ? brut : {}) as Record<string, unknown>;
  const p = (o.palette && typeof o.palette === "object" ? o.palette : {}) as Record<string, unknown>;

  const sectionsBrutes = Array.isArray(o.sections) ? o.sections : [];
  if (!Array.isArray(o.sections)) corrections.push(`sections : ${JSON.stringify(o.sections)} n'est pas une liste, laissé vide.`);
  const sections: FicheStyle["sections"] = [];
  for (const s of sectionsBrutes) {
    const trouve =
      typeof s === "string" ? SECTIONS.find((a) => a === s || normaliser(a) === normaliser(s)) : undefined;
    if (!trouve) {
      corrections.push(`sections : ${JSON.stringify(s)} hors liste, retiré.`);
    } else if (sections.includes(trouve)) {
      corrections.push(`sections : « ${trouve} » en double, retiré.`);
    } else if (sections.length >= SECTIONS_MAX) {
      corrections.push(`sections : « ${trouve} » au-delà de ${SECTIONS_MAX}, retiré.`);
    } else {
      sections.push(trouve);
    }
  }

  const fiche: FicheStyle = {
    palette: {
      fond: couleur("palette.fond", p.fond, corrections),
      encre: couleur("palette.encre", p.encre, corrections),
      accent: couleur("palette.accent", p.accent, corrections),
    },
    typo: choisir("typo", o.typo, TYPOS, DEFAUTS.typo, corrections),
    rayon: rayon(o.rayon, corrections),
    densite: choisir("densite", o.densite, DENSITES, DEFAUTS.densite, corrections),
    banniere: choisir("banniere", o.banniere ?? o["bannière"], BANNIERES, DEFAUTS.banniere, corrections),
    sections,
    cartes: choisir("cartes", o.cartes, CARTES, DEFAUTS.cartes, corrections),
  };
  return { fiche, corrections };
}

const TYPO_TEXTE: Record<FicheStyle["typo"], string> = {
  serif: "titres H1/H2 en Playfair Display (serif), comme prévu",
  sans: "titres H1/H2 en Inter 700 (sans-serif) au lieu de Playfair Display",
  mono: "titres H1/H2 en police monospace système (font-family: ui-monospace, Menlo, monospace), sans charger de police supplémentaire",
};

const DENSITE_TEXTE: Record<FicheStyle["densite"], string> = {
  aeree: "aérée : padding vertical des sections 120px desktop / 72px mobile",
  normale: "normale : padding vertical des sections 80px desktop / 56px mobile",
  dense: "dense : padding vertical des sections 56px desktop / 40px mobile",
};

const BANNIERE_TEXTE: Record<FicheStyle["banniere"], string> = {
  "16/9": "visuel du hero au ratio 16/9 (aspect-ratio: 16/9)",
  "21/9": "visuel du hero au ratio 21/9 (aspect-ratio: 21/9)",
  "4/3": "visuel du hero au ratio 4/3 (aspect-ratio: 4/3)",
  "plein-écran": "visuel du hero en pleine largeur et pleine hauteur de la section hero",
};

const CARTES_TEXTE: Record<FicheStyle["cartes"], string> = {
  plate: "plates : fond var(--site-surface), sans bordure ni ombre",
  bordée: "bordées : fond var(--site-surface), bordure 1px var(--site-border), sans ombre",
  ombrée: "ombrées : fond var(--site-surface), sans bordure, box-shadow douce",
  flottante: "flottantes : fond var(--site-surface), box-shadow marquée et léger décalage au survol (translateY(-4px))",
};

const SECTION_TEXTE: Record<FicheStyle["sections"][number], string> = {
  "hero-centré": "hero-centré : HERO avec texte centré, visuel sous le texte",
  "hero-split": "hero-split : HERO en deux colonnes, texte d'un côté, visuel de l'autre",
  "grille-3": "grille-3 : grilles de cartes sur 3 colonnes en desktop",
  "grille-2-alterne": "grille-2-alterne : grilles sur 2 colonnes, blocs alternant texte et visuel d'une rangée à l'autre",
  "bandeau-citation": "bandeau-citation : une phrase clé tirée de la description fournie, mise en avant en grand dans une section existante — jamais une citation attribuée ni un avis",
  "pas-à-pas": "pas-à-pas : listes de points présentées en étapes numérotées",
};

// Bloc de consignes de style pour les deux prompts de génération, placé après INTERDIT et
// AUCUN CHIFFRE NON FOURNI. Ne change ni la liste ni l'ordre des sections, ni les couleurs :
// la fiche ne décide que de la forme des sections existantes. La palette n'y figure pas.
export function blocConsignesStyle(fiche: FicheStyle): string {
  const lignes = [
    "CONSIGNES DE STYLE (à suivre, mais jamais en contradiction avec INTERDIT ni AUCUN CHIFFRE NON FOURNI ci-dessus) — elles précisent la FORME des sections déjà demandées, sans en ajouter, en retirer ni en changer l'ordre, et sans changer les couleurs :",
    `- Typographie : ${TYPO_TEXTE[fiche.typo]}.`,
    `- Rayon : border-radius ${fiche.rayon === 999 ? "999px (formes en pilule)" : `${fiche.rayon}px`} sur les cartes, les boutons et les images.`,
    `- Densité ${DENSITE_TEXTE[fiche.densite]}.`,
    `- Bannière : ${BANNIERE_TEXTE[fiche.banniere]}.`,
    `- Cartes ${CARTES_TEXTE[fiche.cartes]}.`,
  ];
  if (fiche.sections.length > 0) {
    lignes.push(
      "- Formes de section à appliquer aux sections existantes qui s'y prêtent (ignore celles qui ne correspondent à aucune section demandée ; pour le hero, la première forme de hero listée l'emporte) :"
    );
    for (const s of fiche.sections) lignes.push(`  • ${SECTION_TEXTE[s]}`);
  }
  return `${lignes.join("\n")}\n\n`;
}
