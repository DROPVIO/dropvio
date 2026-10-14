import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { PLAN_LIMITS, planLabel, getMonthlyUsage, incrementMonthlyUsage, logTokensUsage } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUDIT_MODELE, compacterHtml, verifierBudgetAudit } from "@/lib/audit-config";
import { langueSite } from "@/lib/site-textes";
import type { AppLocale } from "@/lib/locale";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Une page de 2 000 000 de caractères (~600 000 tokens) prend plusieurs dizaines de secondes
// rien qu'en lecture côté modèle.
export const maxDuration = 300;

// La sortie (le JSON de scoring) ne grandit pas avec la taille de la page : ~3300-4244 tokens
// mesurés entre 20k et 200k caractères.
const SORTIE_MAX = 8192;

const NOMS_LANGUE: Record<AppLocale, string> = { fr: "français", en: "anglais", es: "espagnol", it: "italien" };

const SYSTEM = `Tu es un expert senior en conversion rate optimization et UI/UX design pour l'e-commerce dropshipping, avec 15 ans d'expérience. Tu maîtrises les études Nielsen Norman Group, Unbounce et McKinsey sur les landing pages. Tu es direct, honnête, et tu donnes des feedbacks actionnables.

RÈGLE ABSOLUE: Réponds UNIQUEMENT avec un JSON valide, sans aucun texte avant ou après, sans markdown, sans balises de code.`;

const PROMPT = `Analyse cette landing page HTML selon 9 critères professionnels. Retourne UNIQUEMENT ce JSON (aucun texte autour) :

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

type AuditResult = {
  score_global: number;
  categories: unknown;
};

function isAuditResult(value: unknown): value is AuditResult {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { score_global?: unknown }).score_global === "number" &&
    Array.isArray((value as { categories?: unknown }).categories)
  );
}

function extraireNomSite(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const titre = match?.[1]?.trim();
  return titre && titre.length > 0 ? titre : "Landing page sans titre";
}

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
    const { supabase, user, plan } = await getServerUserAndPlan();

    if (!user) {
      return NextResponse.json({ error: "Connecte-toi pour utiliser l'audit IA.", code: "auth_required" }, { status: 401 });
    }

    // Garde-fou technique indépendant du quota métier mensuel : évite qu'un script ou
    // un compte compromis enchaîne des dizaines d'appels Claude (facturés) d'affilée,
    // même sous le plafond mensuel.
    if (!checkRateLimit(`audit-site:${user.id}`, { max: 10, windowMs: 3_600_000 })) {
      return NextResponse.json(
        { error: "Trop d'audits en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
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

    const { html, siteId, langue: langueBrute } = await request.json();
    // Langue de l'interface de l'utilisateur : celle des textes de l'audit (avis, résumé, noms
    // des critères, points, corrections). Le JSON et ses clés restent identiques.
    const langue = langueSite(langueBrute);
    // Rattachement optionnel à un site généré (app/audit/page.tsx ?site=<id>) : validé comme
    // un uuid ici plutôt que transmis tel quel. RLS fait le reste — la FK vers sites_generes
    // rejetterait de toute façon un id qui n'existe pas.
    const siteIdValide =
      typeof siteId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId)
        ? siteId
        : null;

    if (!html || typeof html !== "string" || html.trim().length < 50) {
      return NextResponse.json({ error: "HTML invalide ou trop court.", code: "html_invalid" }, { status: 400 });
    }

    // Page entière, sans troncature : seules les données base64 (images, polices) sont
    // remplacées par un repère, elles n'ont rien d'auditable. La taille est bornée par le
    // quota de tokens du plan et la fenêtre de contexte du modèle (verifierBudgetAudit).
    const requete = {
      system: `${SYSTEM}\n\nLANGUE : rédige tous les textes du JSON (score_designer, resume_executif, nom de chaque critère, points_forts, points_faibles, corrections_specifiques) en ${NOMS_LANGUE[langue]}. Les clés et les id restent tels quels.\n\nLes données base64 intégrées ont été remplacées par __DV_DONNEES_n__ : l'image ou la police est bien présente dans la page.`,
      messages: [{ role: "user" as const, content: PROMPT + compacterHtml(html).html }],
    };

    const refus = await verifierBudgetAudit(client, supabase, user.id, plan, requete, SORTIE_MAX);
    if (refus) return refus;

    // Streaming : sur une très grosse page, un appel non streamé risque le délai HTTP du SDK.
    const message = await client.messages
      .stream({ model: AUDIT_MODELE, max_tokens: SORTIE_MAX, ...requete })
      .finalMessage();
    await logTokensUsage(supabase, user.id, "audit_ia", message.usage.input_tokens, message.usage.output_tokens);

    let raw: string | undefined;
    for (const block of message.content) {
      if (block.type === "text") {
        raw = block.text;
        break;
      }
    }

    if (raw === undefined) {
      console.error("[audit-site] no text block in response, stop_reason:", message.stop_reason);
      return NextResponse.json(
        { error: "Réponse Claude vide ou inattendue. Réessaie.", code: "ai_invalid_response" },
        { status: 500 }
      );
    }

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
          error: `Réponse Claude non parseable : ${(extractErr as Error).message}. Réessaie.`, code: "ai_invalid_response",
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
          error: `JSON invalide : ${(parseErr as SyntaxError).message}. Réessaie.`, code: "ai_invalid_response",
        },
        { status: 500 }
      );
    }

    // Le quota n'est décompté qu'en cas de succès — un audit qui échoue (erreur
    // Claude, JSON invalide...) ne doit pas coûter au client.
    await incrementMonthlyUsage(supabase, user.id, "audit_ia");

    // Sauvegarde de l'historique — best-effort : un échec ici ne doit pas faire
    // échouer la réponse, l'audit lui-même a réussi.
    if (isAuditResult(result)) {
      // Record<string, unknown> et non un littéral : le type généré pour audits_realises ne
      // connaît pas encore site_id (031 non appliquée au moment où les types ont été générés),
      // et un littéral avec un champ en plus serait refusé à la compilation.
      const ligne: Record<string, unknown> = {
        user_id: user.id,
        url_ou_nom_site: extraireNomSite(html),
        score_total: result.score_global,
        categories: result.categories,
      };
      const { error: insertErr } = await supabase
        .from("audits_realises")
        .insert(siteIdValide ? { ...ligne, site_id: siteIdValide } : ligne);

      // 42703 = undefined_column : 031_audits_realises_site_id.sql n'est pas appliquée sur
      // cette base. L'audit lui-même est valide et son historique ne doit pas être perdu
      // pour autant — on réinsère sans le rattachement, qui n'est qu'un confort
      // (pré-remplissage des corrections au moment de regénérer le site).
      if (insertErr?.code === "42703" && siteIdValide) {
        const { error: repriseErr } = await supabase.from("audits_realises").insert(ligne);
        if (repriseErr) {
          console.error("[audit-site] failed to save audit history:", repriseErr);
        }
      } else if (insertErr) {
        console.error("[audit-site] failed to save audit history:", insertErr);
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[audit-site] unexpected error:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'analyse. Réessaie dans un instant.", code: "audit_failed" },
      { status: 500 }
    );
  }
}
