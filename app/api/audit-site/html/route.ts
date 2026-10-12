import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, getMonthlyUsage, incrementMonthlyUsage } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUDIT_HTML_MAX_CHARS } from "@/lib/audit-config";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type Category = {
  nom: string;
  corrections_specifiques: string[];
};

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, plan } = await getServerUserAndPlan();

    if (!user) {
      return NextResponse.json({ error: "Connecte-toi pour utiliser l'audit IA.", code: "auth_required" }, { status: 401 });
    }

    // Même garde-fou technique que /api/audit-site (appel Claude facturé, clé de rate
    // limit distincte pour ne pas partager le compteur avec l'analyse elle-même).
    if (!checkRateLimit(`audit-site-html:${user.id}`, { max: 10, windowMs: 3_600_000 })) {
      return NextResponse.json(
        { error: "Trop de requêtes en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
        { status: 429 }
      );
    }

    const maxParMois = PLAN_LIMITS[plan].auditsParMoisMax;

    if (maxParMois === 0) {
      return NextResponse.json(
        { error: "L'audit IA n'est pas disponible sur le plan Free. Passe Pro pour débloquer 30 audits par mois.", code: "audit_plan" },
        { status: 403 }
      );
    }

    // Même quota "audit_ia" que /api/audit-site — générer le HTML corrigé est une
    // action de suivi du même audit, pas une fonctionnalité distincte à quotifier à part.
    if (maxParMois !== null) {
      const used = await getMonthlyUsage(supabase, user.id, "audit_ia");
      if (used >= maxParMois) {
        return NextResponse.json(
          {
            error: `Tu as atteint la limite de ${maxParMois} audits ce mois-ci sur le plan ${planLabel(plan)}. ${
              plan === "pro" ? "Passe Agency pour 100 audits par mois." : "La limite se réinitialise le mois prochain."
            }`, code: "audit_limit", values: { max: maxParMois, plan: planLabel(plan) },
          },
          { status: 403 }
        );
      }
    }

    const { html, categories } = (await request.json()) as {
      html: string;
      categories: Category[];
    };

    if (!html || !Array.isArray(categories)) {
      return NextResponse.json({ error: "Données manquantes.", code: "invalid_request" }, { status: 400 });
    }

    const corrections = categories
      .filter((c) => c.corrections_specifiques.length > 0)
      .map((c) =>
        `## ${c.nom}\n${c.corrections_specifiques.map((s) => `- ${s}`).join("\n")}`
      )
      .join("\n\n");

    const truncated =
      html.length > AUDIT_HTML_MAX_CHARS ? html.slice(0, AUDIT_HTML_MAX_CHARS) + "\n<!-- [tronqué] -->" : html;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      // Mesuré en direct sur une vraie page à 100 000 caractères (AUDIT_HTML_MAX_CHARS) :
      // 16000 tronque (stop_reason: max_tokens), 24000 complète naturellement à ~20 480
      // tokens de sortie. Contrairement au scoring, cette route doit reproduire une bonne
      // partie du HTML d'origine — sa sortie grandit avec la taille de l'entrée.
      max_tokens: 24000,
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

    let raw: string | undefined;
    for (const block of message.content) {
      if (block.type === "text") {
        raw = block.text.trim();
        break;
      }
    }
    raw ??= html;

    const clean = raw.startsWith("```")
      ? raw.replace(/^```(?:html)?\n?/, "").replace(/\n?```$/, "").trim()
      : raw;

    await incrementMonthlyUsage(supabase, user.id, "audit_ia");

    return new NextResponse(clean, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="landing-page-corrigee.html"',
      },
    });
  } catch (err) {
    console.error("[audit-site/html]", err);
    return NextResponse.json(
      { error: "Erreur lors de la génération du HTML corrigé.", code: "audit_html_failed" },
      { status: 500 }
    );
  }
}
