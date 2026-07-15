import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Category = {
  nom: string;
  corrections_specifiques: string[];
};

export async function POST(request: NextRequest) {
  try {
    const { html, categories } = (await request.json()) as {
      html: string;
      categories: Category[];
    };

    if (!html || !Array.isArray(categories)) {
      return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
    }

    const corrections = categories
      .filter((c) => c.corrections_specifiques.length > 0)
      .map((c) =>
        `## ${c.nom}\n${c.corrections_specifiques.map((s) => `- ${s}`).join("\n")}`
      )
      .join("\n\n");

    const truncated =
      html.length > 20000 ? html.slice(0, 20000) + "\n<!-- [tronqué] -->" : html;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system:
        "Tu es un expert HTML/CSS pour landing pages e-commerce. Retourne UNIQUEMENT le HTML corrigé complet — pas de markdown, pas de balises de code, pas de commentaires sur ta démarche. Juste le HTML brut avec les corrections appliquées.",
      messages: [
        {
          role: "user",
          content: `Applique toutes les corrections suivantes au HTML. Avant chaque élément modifié, ajoute un commentaire <!-- CORRECTION: [raison] -->.

CORRECTIONS:
${corrections}

HTML ORIGINAL:
${truncated}

Retourne le HTML complet corrigé.`,
        },
      ],
    });

    const raw = message.content[0].type === "text" ? message.content[0].text.trim() : html;
    const clean = raw.startsWith("```")
      ? raw.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "").trim()
      : raw;

    return new NextResponse(clean, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="landing-page-corrigee.html"',
      },
    });
  } catch (err) {
    console.error("[audit-site/html]", err);
    return NextResponse.json(
      { error: "Erreur lors de la génération du HTML corrigé." },
      { status: 500 }
    );
  }
}
