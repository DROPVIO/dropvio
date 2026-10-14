import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, getMonthlyUsage, incrementMonthlyUsage, logTokensUsage } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUDIT_MODELE, compacterHtml, restaurerHtml, verifierBudgetAudit } from "@/lib/audit-config";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 300;

type Category = {
  nom: string;
  corrections_specifiques: string[];
};

// Le modèle ne réécrit plus la page : à 2 000 000 de caractères, elle dépasse de loin sa
// sortie maximale. Il renvoie des remplacements ciblés (extrait exact → nouvel extrait),
// appliqués ici sur la page complète. La sortie ne dépend plus de la taille de la page.
const SORTIE_MAX = 32000;

type Modification = { avant: string; apres: string; raison: string };

const SCHEMA_MODIFICATIONS = {
  type: "object",
  properties: {
    modifications: {
      type: "array",
      items: {
        type: "object",
        properties: {
          avant: { type: "string" },
          apres: { type: "string" },
          raison: { type: "string" },
        },
        required: ["avant", "apres", "raison"],
        additionalProperties: false,
      },
    },
  },
  required: ["modifications"],
  additionalProperties: false,
};

const SYSTEM = `Tu es un expert HTML/CSS pour landing pages e-commerce. Tu appliques des corrections à une page HTML sous forme de remplacements ciblés, sans jamais renvoyer la page entière.

Chaque modification :
- "avant" : copie EXACTE, caractère pour caractère (espaces et retours à la ligne compris), d'un extrait du HTML d'origine. Il doit n'apparaître qu'une seule fois dans la page : prends juste assez de contexte pour qu'il soit unique, pas plus. Commence-le de préférence au début d'une balise (<).
- "apres" : le texte qui remplace cet extrait. Pour ajouter du CSS ou du HTML, prends comme "avant" un repère unique (par exemple </head>) et remets-le dans "apres".
- "raison" : la correction appliquée, en une phrase courte.
Les modifications ne doivent pas se chevaucher. Les repères __DV_DONNEES_n__ remplacent des données base64 : recopie-les tels quels s'ils sont dans un extrait.`;

function appliquerModifications(html: string, modifications: Modification[]) {
  let resultat = html;
  let appliquees = 0;
  for (const { avant, apres, raison } of modifications) {
    if (!avant) continue;
    const position = resultat.indexOf(avant);
    // Absent, ou présent plusieurs fois (donc ambigu) : ignoré plutôt que de modifier le
    // mauvais endroit.
    if (position === -1 || resultat.indexOf(avant, position + 1) !== -1) continue;
    // Commentaire seulement si l'extrait commence par une balise : au milieu d'un attribut
    // ou d'une règle CSS, il casserait le code.
    const commentaire = avant.startsWith("<") ? `<!-- CORRECTION: ${raison.replace(/--/g, "—")} -->` : "";
    resultat = resultat.slice(0, position) + commentaire + apres + resultat.slice(position + avant.length);
    appliquees++;
  }
  return { html: resultat, appliquees };
}

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

    const { html: compacte, blocs } = compacterHtml(html);
    const requete = {
      system: SYSTEM,
      messages: [
        {
          role: "user" as const,
          content: `Applique toutes les corrections suivantes au HTML.

CORRECTIONS:
${corrections}

HTML ORIGINAL:
${compacte}`,
        },
      ],
    };

    const refus = await verifierBudgetAudit(client, supabase, user.id, plan, requete, SORTIE_MAX);
    if (refus) return refus;

    const message = await client.messages
      .stream({
        model: AUDIT_MODELE,
        max_tokens: SORTIE_MAX,
        output_config: { format: { type: "json_schema", schema: SCHEMA_MODIFICATIONS } },
        ...requete,
      })
      .finalMessage();
    await logTokensUsage(supabase, user.id, "audit_ia", message.usage.input_tokens, message.usage.output_tokens);

    let modifications: Modification[] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        try {
          modifications = (JSON.parse(block.text) as { modifications: Modification[] }).modifications;
        } catch {
          console.error("[audit-site/html] JSON invalide, stop_reason:", message.stop_reason);
        }
        break;
      }
    }

    const { html: corrige, appliquees } = appliquerModifications(compacte, modifications);
    console.log("[audit-site/html] %d/%d modifications appliquées", appliquees, modifications.length);
    if (appliquees === 0) {
      return NextResponse.json(
        { error: "Erreur lors de la génération du HTML corrigé.", code: "audit_html_failed" },
        { status: 500 }
      );
    }
    const clean = restaurerHtml(corrige, blocs);

    await incrementMonthlyUsage(supabase, user.id, "audit_ia");

    return new NextResponse(clean, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": 'attachment; filename="landing-page-corrigee.html"',
        "X-Corrections-Appliquees": String(appliquees),
        "X-Corrections-Proposees": String(modifications.length),
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
