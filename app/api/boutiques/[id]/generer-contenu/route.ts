import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { containsExcludedBrand } from "@/lib/brand-exclusions";
import { nicheLabel } from "@/lib/niches";
import { BudgetIaDepasse, reponseBudgetDepasse, SuiviBudgetIa, tokensEstimes } from "@/lib/ai-budget";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// En dessous de ce seuil, la description existante est considérée comme un placeholder
// (vide ou quasi) — on en propose une nouvelle. Au-dessus, on ne propose jamais de
// remplacer un texte que l'utilisateur a réellement rédigé lui-même.
const DESCRIPTION_MIN_LENGTH = 40;

const DEFAULT_PALETTE = { primary: "#7c3aed", secondary: "#1a0533", accent: "#f59e0b" };

const SYSTEM_PROMPT = `Tu es un copywriter e-commerce francophone et directeur artistique. Tu réponds UNIQUEMENT avec un JSON valide, sans texte avant ni après, sans balises markdown.

RÈGLES ABSOLUES :
- N'invente aucune caractéristique produit qui n'est pas déjà donnée en contexte.
- Ne mentionne jamais de marque déposée, de personnage sous licence, ni de plateforme e-commerce (AliExpress, Amazon, Shopify, etc.).
- Toujours en français.`;

function buildPrompt(opts: { nom: string; niche: string | null; produits: string[]; needsDescription: boolean }): string {
  const contexte = `BOUTIQUE : ${opts.nom}
${opts.niche ? `NICHE : ${opts.niche}\n` : ""}PRODUITS (échantillon) :
${opts.produits.length > 0 ? opts.produits.map((p) => `- ${p}`).join("\n") : "(aucun produit pour l'instant)"}`;

  const champJson = opts.needsDescription
    ? `{"description": "<2 à 3 phrases persuasives présentant la boutique dans son ensemble, jamais un produit précis>", "palette": {"primary": "#rrggbb", "secondary": "#rrggbb", "accent": "#rrggbb"}}`
    : `{"palette": {"primary": "#rrggbb", "secondary": "#rrggbb", "accent": "#rrggbb"}}`;

  return `${contexte}

Propose une palette de 3 couleurs hexadécimales cohérente avec cette boutique (principale = CTA/boutons, secondaire = fonds de section, accent = badges/hover)${
    opts.needsDescription ? ", ainsi qu'une description de la boutique dans son ensemble" : ""
  }. Retourne UNIQUEMENT ce JSON, sans texte autour :

${champJson}`;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour générer le contenu de ta boutique.", code: "auth_required" }, { status: 401 });
  }

  if (!checkRateLimit(`generer-contenu-boutique:${user.id}`, { max: 20, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de générations en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
      { status: 429 }
    );
  }

  const { data: boutique, error: boutiqueError } = await supabase
    .from("boutiques")
    .select("id, nom, description, settings")
    .eq("id", params.id)
    .maybeSingle();

  if (boutiqueError) {
    return NextResponse.json({ error: boutiqueError.message, code: "server_error" }, { status: 500 });
  }
  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable.", code: "boutique_not_found" }, { status: 404 });
  }

  const { data: produitsData } = await supabase
    .from("boutique_produits")
    .select("nom")
    .eq("boutique_id", params.id)
    .limit(8);

  const niche = nicheLabel(typeof boutique.settings?.niche === "string" ? boutique.settings.niche : null);
  const needsDescription = !boutique.description || boutique.description.trim().length < DESCRIPTION_MIN_LENGTH;

  const prompt = buildPrompt({
    nom: boutique.nom,
    niche,
    produits: (produitsData ?? []).map((p: { nom: string }) => p.nom),
    needsDescription,
  });

  const suivi = new SuiviBudgetIa(supabase, user.id, plan, "textes_ia");
  try {
    await suivi.verifier(suivi.estimer(tokensEstimes(SYSTEM_PROMPT + prompt), 400));
    const message = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });
    suivi.ajouter(message.model, message.usage);

    let raw: string | undefined;
    for (const block of message.content) {
      if (block.type === "text") {
        raw = block.text.trim();
        break;
      }
    }
    if (!raw) {
      return NextResponse.json({ error: "Réponse vide. Réessaie.", code: "ai_invalid_response" }, { status: 500 });
    }

    const clean = raw.startsWith("```")
      ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim()
      : raw;

    let parsed: { description?: string; palette?: { primary?: string; secondary?: string; accent?: string } };
    try {
      parsed = JSON.parse(clean);
    } catch {
      return NextResponse.json({ error: "Réponse invalide. Réessaie.", code: "ai_invalid_response" }, { status: 500 });
    }

    const palette = {
      primary: parsed.palette?.primary ?? DEFAULT_PALETTE.primary,
      secondary: parsed.palette?.secondary ?? DEFAULT_PALETTE.secondary,
      accent: parsed.palette?.accent ?? DEFAULT_PALETTE.accent,
    };
    const description = needsDescription ? parsed.description ?? null : null;

    if (description && containsExcludedBrand(description)) {
      return NextResponse.json(
        { error: "Le texte généré mentionne une marque non autorisée. Réessaie.", code: "ai_brand_forbidden" },
        { status: 422 }
      );
    }

    return NextResponse.json({ description, palette });
  } catch (err) {
    if (err instanceof BudgetIaDepasse) return reponseBudgetDepasse(err);
    console.error("[boutiques/generer-contenu]", err);
    return NextResponse.json({ error: "Erreur lors de la génération. Réessaie.", code: "generation_failed" }, { status: 500 });
  } finally {
    await suivi.enregistrer();
  }
}
