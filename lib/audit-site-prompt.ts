// Prompt, consignes et lecture de la réponse de l'audit IA de page (app/api/audit-site).
// Partagés avec scripts/auditer-landing.ts pour auditer la landing avec exactement la même logique.
import type { AppLocale } from "@/lib/locale";

// La sortie (le JSON de scoring) ne grandit pas avec la taille de la page : ~3300-4244 tokens
// mesurés entre 20k et 200k caractères.
export const SORTIE_MAX = 8192;

export const NOMS_LANGUE: Record<AppLocale, string> = { fr: "français", en: "anglais", es: "espagnol", it: "italien" };

export const SYSTEM = `Tu es un expert senior en conversion rate optimization et UI/UX design pour l'e-commerce dropshipping, avec 15 ans d'expérience. Tu maîtrises les études Nielsen Norman Group, Unbounce et McKinsey sur les landing pages. Tu es direct, honnête, et tu donnes des feedbacks actionnables.

RÈGLE ABSOLUE: Réponds UNIQUEMENT avec un JSON valide, sans aucun texte avant ou après, sans markdown, sans balises de code.`;

export const PROMPT = `Analyse cette landing page HTML selon 9 critères professionnels. Retourne UNIQUEMENT ce JSON (aucun texte autour) :

{
  "score_global": <entier 0-100, égal à la somme des 9 scores>,
  "score_designer": "<2-3 phrases directes et honnêtes, comme un designer pro à 3000€ — pas condescendant, pas complaisant, juste vrai>",
  "resume_executif": "<2-3 phrases percutantes — commence par ce qui bloque concrètement les conversions>",
  "categories": [
    {
      "id": "hierarchie_visuelle",
      "nom": "Hiérarchie visuelle",
      "score": <0-13>,
      "max": 13,
      "points_forts": ["<point positif concret>"],
      "points_faibles": ["<problème concret>"],
      "corrections_specifiques": ["<correction CSS/HTML précise et actionnable>"]
    },
    {
      "id": "espace_blanc",
      "nom": "Espace blanc",
      "score": <0-9>,
      "max": 9,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "typographie",
      "nom": "Typographie",
      "score": <0-9>,
      "max": 9,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "image_produit",
      "nom": "Image produit",
      "score": <0-13>,
      "max": 13,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "cta",
      "nom": "CTA",
      "score": <0-13>,
      "max": 13,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "preuve_sociale",
      "nom": "Preuve sociale",
      "score": <0-13>,
      "max": 13,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "copywriting",
      "nom": "Copywriting",
      "score": <0-9>,
      "max": 9,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "urgence_prix",
      "nom": "Urgence & Prix",
      "score": <0-9>,
      "max": 9,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "mobile",
      "nom": "Mobile",
      "score": <0-12>,
      "max": 12,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    }
  ]
}

BARÈME:

1. Hiérarchie visuelle (max 13)
   H1 visible sans scroll, CTA contrasté immédiatement visible, lecture Z/F naturelle, taille des éléments proportionnelle à leur importance.
   13=exemplaire · 9-12=correct · 4-8=à revoir · 0-3=bloquant

2. Espace blanc (max 9)
   Densité ≤40% de remplissage écran, padding/margin cohérents entre blocs, zones de respiration pour l'œil.
   9=exemplaire · 6-8=correct · 3-5=à revoir · 0-2=bloquant

3. Typographie (max 9)
   Max 2 polices, max 3 tailles distinctes, lisibilité CM1-CM2 (phrases <15 mots), contraste texte/fond WCAG AA.
   9=exemplaire · 6-8=correct · 3-5=à revoir · 0-2=bloquant

4. Image produit (max 13)
   Image présente dans le hero (above fold), haute qualité (taille suffisante), montre le produit en usage, alt text présent.
   13=exemplaire · 9-12=correct · 4-8=à revoir · 0-3=absent

5. CTA (max 13)
   Bouton clairement visible, texte orienté bénéfice (pas seulement "Acheter"), couleur contrastée, une seule action principale, position above fold.
   13=exemplaire · 9-12=correct · 4-8=à revoir · 0-3=bloquant

6. Preuve sociale (max 13)
   Note/étoiles présentes, nombre de clients ou commandes mentionné, badges de confiance (paiement sécurisé, garantie), témoignages clients.
   13=exemplaire · 9-12=correct · 4-8=à revoir · 0-3=absent

7. Copywriting (max 9)
   H1 exprime un bénéfice (pas une feature), phrases courtes, bénéfices concrets et chiffrés, zéro jargon.
   9=exemplaire · 6-8=correct · 3-5=à revoir · 0-2=bloquant

8. Urgence & Prix (max 9)
   Prix clairement affiché, prix barré si promo, urgence honnête (stock/délai), livraison explicitement mentionnée.
   9=exemplaire · 6-8=correct · 3-5=à revoir · 0-2=absent

9. Mobile (max 12)
   Balise <meta name="viewport" content="width=device-width, initial-scale=1"> présente, texte lisible sans zoom (taille de base ≥14px sur mobile), zones cliquables (boutons/CTA) d'au moins 44×44px pour le tactile, aucun contenu qui déborde horizontalement (pas de largeur fixe supérieure au viewport), images en max-width:100% pour rester responsive.
   12=exemplaire · 8-11=correct · 4-7=à revoir · 0-3=bloquant

HTML à analyser :
`;

export type AuditResult = {
  score_global: number;
  categories: unknown;
};

export function isAuditResult(value: unknown): value is AuditResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { score_global?: unknown }).score_global === "number" &&
    Array.isArray((value as { categories?: unknown }).categories)
  );
}

export function extractJson(raw: string): string {
  // 1. Strip markdown fences if present
  const stripped = raw.startsWith("```")
    ? raw.replace(/^```(?:json)?\r?\n?/, "").replace(/\r?\n?```$/, "").trim()
    : raw.trim();

  // 2. Find the outermost JSON object: first { to last }
  const start = stripped.indexOf("{");
  const end   = stripped.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON object found in response (length ${raw.length})`);
  }
  return stripped.slice(start, end + 1);
}
