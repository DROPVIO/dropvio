import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `Tu es un expert senior en conversion rate optimization et UI/UX design pour l'e-commerce dropshipping, avec 15 ans d'expérience. Tu maîtrises les études Nielsen Norman Group, Unbounce et McKinsey sur les landing pages. Tu es direct, honnête, et tu donnes des feedbacks actionnables.

RÈGLE ABSOLUE: Réponds UNIQUEMENT avec un JSON valide, sans aucun texte avant ou après, sans markdown, sans balises de code.`;

const PROMPT = `Analyse cette landing page HTML selon 8 critères professionnels. Retourne UNIQUEMENT ce JSON (aucun texte autour) :

{
  "score_global": <entier 0-100, égal à la somme des 8 scores>,
  "score_designer": "<2-3 phrases directes et honnêtes, comme un designer pro à 3000€ — pas condescendant, pas complaisant, juste vrai>",
  "resume_executif": "<2-3 phrases percutantes — commence par ce qui bloque concrètement les conversions>",
  "categories": [
    {
      "id": "hierarchie_visuelle",
      "nom": "Hiérarchie visuelle",
      "score": <0-15>,
      "max": 15,
      "points_forts": ["<point positif concret>"],
      "points_faibles": ["<problème concret>"],
      "corrections_specifiques": ["<correction CSS/HTML précise et actionnable>"]
    },
    {
      "id": "espace_blanc",
      "nom": "Espace blanc",
      "score": <0-10>,
      "max": 10,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "typographie",
      "nom": "Typographie",
      "score": <0-10>,
      "max": 10,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "image_produit",
      "nom": "Image produit",
      "score": <0-15>,
      "max": 15,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "cta",
      "nom": "CTA",
      "score": <0-15>,
      "max": 15,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "preuve_sociale",
      "nom": "Preuve sociale",
      "score": <0-15>,
      "max": 15,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "copywriting",
      "nom": "Copywriting",
      "score": <0-10>,
      "max": 10,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    },
    {
      "id": "urgence_prix",
      "nom": "Urgence & Prix",
      "score": <0-10>,
      "max": 10,
      "points_forts": [],
      "points_faibles": [],
      "corrections_specifiques": []
    }
  ]
}

BARÈME:

1. Hiérarchie visuelle (max 15)
   H1 visible sans scroll, CTA contrasté immédiatement visible, lecture Z/F naturelle, taille des éléments proportionnelle à leur importance.
   15=exemplaire · 10-14=correct · 5-9=à revoir · 0-4=bloquant

2. Espace blanc (max 10)
   Densité ≤40% de remplissage écran, padding/margin cohérents entre blocs, zones de respiration pour l'œil.
   10=exemplaire · 7-9=correct · 3-6=à revoir · 0-2=bloquant

3. Typographie (max 10)
   Max 2 polices, max 3 tailles distinctes, lisibilité CM1-CM2 (phrases <15 mots), contraste texte/fond WCAG AA.
   10=exemplaire · 7-9=correct · 3-6=à revoir · 0-2=bloquant

4. Image produit (max 15)
   Image présente dans le hero (above fold), haute qualité (taille suffisante), montre le produit en usage, alt text présent.
   15=exemplaire · 10-14=correct · 5-9=à revoir · 0-4=absent

5. CTA (max 15)
   Bouton clairement visible, texte orienté bénéfice (pas seulement "Acheter"), couleur contrastée, une seule action principale, position above fold.
   15=exemplaire · 10-14=correct · 5-9=à revoir · 0-4=bloquant

6. Preuve sociale (max 15)
   Note/étoiles présentes, nombre de clients ou commandes mentionné, badges de confiance (paiement sécurisé, garantie), témoignages clients.
   15=exemplaire · 10-14=correct · 5-9=à revoir · 0-4=absent

7. Copywriting (max 10)
   H1 exprime un bénéfice (pas une feature), phrases courtes, bénéfices concrets et chiffrés, zéro jargon.
   10=exemplaire · 7-9=correct · 3-6=à revoir · 0-2=bloquant

8. Urgence & Prix (max 10)
   Prix clairement affiché, prix barré si promo, urgence honnête (stock/délai), livraison explicitement mentionnée.
   10=exemplaire · 7-9=correct · 3-6=à revoir · 0-2=absent

HTML à analyser :
`;

function extractJson(raw: string): string {
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

export async function POST(request: NextRequest) {
  try {
    const { html } = await request.json();

    if (!html || typeof html !== "string" || html.trim().length < 50) {
      return NextResponse.json({ error: "HTML invalide ou trop court." }, { status: 400 });
    }

    const truncated =
      html.length > 20000 ? html.slice(0, 20000) + "\n<!-- [tronqué à 20 000 chars] -->" : html;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: PROMPT + truncated }],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text : "";

    console.log("[audit-site] stop_reason:", message.stop_reason);
    console.log("[audit-site] raw response (%d chars):", raw.length, raw.slice(0, 400));

    let jsonStr: string;
    try {
      jsonStr = extractJson(raw);
    } catch (extractErr) {
      console.error("[audit-site] extraction failed:", extractErr);
      console.error("[audit-site] full raw response:", raw);
      return NextResponse.json(
        {
          error: `Réponse Claude non parseable : ${(extractErr as Error).message}. Réessaie.`,
        },
        { status: 500 }
      );
    }

    let result: unknown;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error("[audit-site] JSON.parse failed:", parseErr);
      console.error("[audit-site] jsonStr (first 800 chars):", jsonStr.slice(0, 800));
      return NextResponse.json(
        {
          error: `JSON invalide : ${(parseErr as SyntaxError).message}. Réessaie.`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[audit-site] unexpected error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse. Réessaie dans un instant." },
      { status: 500 }
    );
  }
}
