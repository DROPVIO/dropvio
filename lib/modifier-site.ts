// Modification d'un site généré à la demande (route app/api/modifier-site/route.ts). Le
// modèle ne réécrit aucune page : il renvoie des remplacements ciblés (extrait exact → nouvel
// extrait) avec les pages qu'ils visent, appliqués ici. Toutes les pages d'un site partagent
// l'en-tête et le pied de page de l'accueil : pour « toutes les pages », le modèle voit
// l'accueil complet et seulement le contenu propre des autres pages, et un changement de
// l'en-tête se fait en un seul remplacement visant toutes les pages.
import { CLE_ACCUEIL, contenuDePage } from "@/lib/site-builder-pages";

export const TOUTES_LES_PAGES = "*";

export type ModificationSite = {
  pages: string[]; // clés de pages, ou ["*"] pour toutes
  avant: string;
  apres: string;
  raison: string;
  partout: boolean; // remplacer chaque occurrence (élément répété : cartes produit…)
};

export const SCHEMA_MODIFICATIONS_SITE = {
  type: "object",
  properties: {
    modifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pages: { type: "array", items: { type: "string" } },
          avant: { type: "string" },
          apres: { type: "string" },
          raison: { type: "string" },
          partout: { type: "boolean" },
        },
        required: ["pages", "avant", "apres", "raison", "partout"],
        additionalProperties: false,
      },
    },
    resume: { type: "string" },
    // true quand la demande ne concerne pas le site (question, autre tâche) : rien n'est
    // modifié et la route renvoie prompt_hors_sujet (voir lib/cadre-createur-site.ts).
    hors_sujet: { type: "boolean" },
  },
  required: ["modifications", "resume", "hors_sujet"],
  additionalProperties: false,
};

// Allègement du HTML envoyé au modèle, sans toucher aux pages elles-mêmes : les longs scripts
// (panier, formulaires de commande) et les blocs de commande répétés dans chaque carte produit
// pèsent l'essentiel d'une page boutique sans servir à la plupart des demandes. Ils sont
// remplacés par un repère OMIS ; un remplacement qui en contiendrait ne trouverait pas son
// extrait et serait simplement ignoré.
export const OMIS = "[dv-omis]";
const SCRIPT_LONG_MIN = 400;

/** Fin (exclue) de l'élément <div> qui commence à `debut`, en équilibrant les <div> imbriqués. */
function finDiv(html: string, debut: number): number {
  const balise = /<div\b[^>]*>|<\/div>/gi;
  balise.lastIndex = debut;
  let profondeur = 0;
  for (let m = balise.exec(html); m; m = balise.exec(html)) {
    profondeur += m[0][1] === "/" ? -1 : 1;
    if (profondeur === 0) return m.index + m[0].length;
  }
  return -1;
}

export function allegerPourModele(html: string): string {
  let sortie = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (tout, attributs: string, corps: string) =>
    corps.length >= SCRIPT_LONG_MIN ? `<script${attributs}>/* ${OMIS} script de ${corps.length} caractères */</script>` : tout
  );
  // Blocs de commande des cartes produit : le premier de la page reste entier (modèle pour une
  // modification « partout »), les suivants deviennent un repère.
  const ouverture = '<div class="dv-order">';
  const premier = sortie.indexOf(ouverture);
  if (premier !== -1) {
    let i = sortie.indexOf(ouverture, finDiv(sortie, premier));
    while (i !== -1) {
      const fin = finDiv(sortie, i);
      if (fin === -1) break;
      const repere = `<!-- ${OMIS} bloc de commande identique au premier -->`;
      sortie = sortie.slice(0, i) + repere + sortie.slice(fin);
      i = sortie.indexOf(ouverture, i + repere.length);
    }
  }
  return sortie;
}

/** Texte des pages envoyé au modèle. `cible` : une clé de page, ou TOUTES_LES_PAGES. */
export function pagesPourDemande(pages: Record<string, string>, cible: string): string {
  const cles = Object.keys(pages);
  if (cible !== TOUTES_LES_PAGES) {
    return `=== PAGE « ${cible} » (HTML complet) ===\n${allegerPourModele(pages[cible])}`;
  }
  const accueil = pages[CLE_ACCUEIL] !== undefined ? CLE_ACCUEIL : cles[0];
  const blocs = [`=== PAGE « ${accueil} » (HTML complet ; l'en-tête, la navigation et le pied de page sont identiques sur toutes les pages) ===\n${allegerPourModele(pages[accueil])}`];
  for (const cle of cles) {
    if (cle === accueil) continue;
    blocs.push(`=== PAGE « ${cle} » (contenu propre seulement, entre l'en-tête et le pied de page) ===\n${allegerPourModele(contenuDePage(pages[cle]))}`);
  }
  return blocs.join("\n\n");
}

export type ResultatModifications = {
  pages: Record<string, string>;
  appliquees: number;
  ignorees: number;
  pagesModifiees: string[];
};

function occurrences(texte: string, extrait: string): number {
  let n = 0;
  for (let i = texte.indexOf(extrait); i !== -1; i = texte.indexOf(extrait, i + extrait.length)) n++;
  return n;
}

/** Applique les remplacements, dans l'ordre, sur les pages visées. Un remplacement sans
 *  `partout` n'est appliqué que sur les pages où l'extrait est unique (sinon il serait ambigu).
 *  Un remplacement qui ne trouve son extrait sur aucune page visée est ignoré. */
export function appliquerModificationsSite(pagesInitiales: Record<string, string>, modifications: ModificationSite[], cible: string): ResultatModifications {
  const pages = { ...pagesInitiales };
  const toutes = Object.keys(pages);
  const modifiees = new Set<string>();
  let appliquees = 0;
  let ignorees = 0;
  for (const m of modifications) {
    if (!m.avant || m.avant === m.apres) {
      ignorees++;
      continue;
    }
    // Une demande sur une seule page ne touche jamais les autres, quoi que le modèle indique.
    const visees =
      cible !== TOUTES_LES_PAGES ? [cible] : m.pages.includes(TOUTES_LES_PAGES) ? toutes : m.pages.filter((c) => c in pages);
    let touche = false;
    for (const cle of visees) {
      const html = pages[cle];
      const n = occurrences(html, m.avant);
      if (n === 0 || (n > 1 && !m.partout)) continue;
      pages[cle] = m.partout ? html.split(m.avant).join(m.apres) : html.replace(m.avant, () => m.apres);
      modifiees.add(cle);
      touche = true;
    }
    if (touche) appliquees++;
    else ignorees++;
  }
  return { pages, appliquees, ignorees, pagesModifiees: [...modifiees] };
}
