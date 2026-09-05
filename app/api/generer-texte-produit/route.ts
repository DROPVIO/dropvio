import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { containsExcludedBrand } from "@/lib/brand-exclusions";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Endpoint générique (pas de boutiqueId/produitId) : le formulaire "Ajouter/éditer un
// produit" (app/site-builder/boutique/[id]/page.tsx) partage productName/productDescription
// entre création et édition — un nouveau produit n'a pas encore d'id. On travaille
// uniquement sur le texte déjà présent dans le formulaire, jamais sur une ligne en base.
const SYSTEM_PROMPT = `Tu es un copywriter e-commerce francophone, spécialisé dans la reformulation de fiches produit issues de catalogues fournisseurs (AliExpress).

RÈGLES ABSOLUES :
- Ne mentionne JAMAIS une marque déposée, un nom de personnage sous licence, un studio ou une franchise (Disney, Marvel, Pokémon, Harry Potter, etc.), même si le titre source en contient un — reformule de façon générique (ex: "sorcière", "personnage de dessin animé", "silhouette super-héros").
- N'invente aucune caractéristique (matière, taille, quantité, fonctionnalité, couleur) qui n'est pas déjà mentionnée dans le titre source.
- Toujours en français, même si le titre source est en anglais.
- Réponds UNIQUEMENT avec le texte demandé — pas de guillemets, pas de markdown, pas de commentaire, pas d'explication.`;

const PROMPTS: Record<"nom" | "description", (titre: string) => string> = {
  nom: (titre) => `Reformule ce titre de fiche produit en un nom court et vendeur, format e-commerce (pas une fiche technique) :
- 4 à 8 mots maximum
- Pas de bourrage de mots-clés SEO, pas de répétition
- Doit rester fidèle à la nature réelle du produit

Titre source : "${titre}"`,
  description: (titre) => `Rédige une description produit courte à partir de ce titre de fiche fournisseur :
- 2 à 4 phrases
- Orientée bénéfice client, pas une liste de caractéristiques techniques
- Appuie-toi uniquement sur les informations réellement présentes dans le titre (matière, taille, quantité, usage) — n'invente rien d'autre
- Ton commercial mais sobre, pas de superlatifs vides ("le meilleur", "incroyable") sans support factuel

Titre source : "${titre}"`,
};

const MAX_TOKENS: Record<"nom" | "description", number> = {
  nom: 150,
  description: 300,
};

export async function POST(request: NextRequest) {
  const { user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour utiliser la génération de texte." }, { status: 401 });
  }

  if (!checkRateLimit(`generer-texte-produit:${user.id}`, { max: 20, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de générations en peu de temps. Réessaie dans quelques minutes." },
      { status: 429 }
    );
  }

  const body = (await request.json()) as { champ?: string; titre?: string };
  const { champ, titre } = body;

  if (champ !== "nom" && champ !== "description") {
    return NextResponse.json({ error: "Champ invalide (attendu : nom ou description)." }, { status: 400 });
  }
  if (!titre || typeof titre !== "string" || titre.trim().length < 3) {
    return NextResponse.json({ error: "Titre manquant ou trop court." }, { status: 400 });
  }

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: MAX_TOKENS[champ],
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: PROMPTS[champ](titre.trim()) }],
    });

    let texte: string | undefined;
    for (const block of message.content) {
      if (block.type === "text") {
        texte = block.text.trim();
        break;
      }
    }

    if (!texte) {
      return NextResponse.json({ error: "Réponse vide. Réessaie." }, { status: 500 });
    }

    // Filet de sécurité en sortie — la consigne du prompt système interdit déjà les
    // marques, mais on ne renvoie jamais un texte qui en contiendrait malgré tout plutôt
    // que de relancer automatiquement (pas de boucle de coût sur un cas censé rester rare).
    if (containsExcludedBrand(texte)) {
      return NextResponse.json(
        { error: "Le texte généré mentionne une marque non autorisée. Réessaie, ou modifie le champ à la main." },
        { status: 422 }
      );
    }

    return NextResponse.json({ texte });
  } catch (err) {
    console.error("[generer-texte-produit]", err);
    return NextResponse.json({ error: "Erreur lors de la génération. Réessaie." }, { status: 500 });
  }
}
