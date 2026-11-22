import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { planLabel, getMonthlyUsage, incrementMonthlyUsage, limitesDuPlan } from "@/lib/plan-limits";
import { SuiviBudgetIa } from "@/lib/ai-budget";
import { checkRateLimit } from "@/lib/rate-limit";
import { AUDIT_MODELE, compacterHtml, verifierBudgetAudit } from "@/lib/audit-config";
import { langueSite } from "@/lib/site-textes";
import { NOMS_LANGUE, PROMPT, SORTIE_MAX, SYSTEM, extractJson, isAuditResult } from "@/lib/audit-site-prompt";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Une page de 2 000 000 de caractères (~600 000 tokens) prend plusieurs dizaines de secondes
// rien qu'en lecture côté modèle.
export const maxDuration = 800;

function extraireNomSite(html: string): string {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const titre = match?.[1]?.trim();
  return titre && titre.length > 0 ? titre : "Landing page sans titre";
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, plan } = await getServerUserAndPlan();

    if (!user) {
      return NextResponse.json({ error: "Connectez-vous pour utiliser l'audit IA.", code: "auth_required" }, { status: 401 });
    }

    // Garde-fou technique indépendant du quota métier mensuel : évite qu'un script ou
    // un compte compromis enchaîne des dizaines d'appels Claude (facturés) d'affilée,
    // même sous le plafond mensuel.
    if (!(await checkRateLimit(`audit-site:${user.id}`, { max: 10, windowMs: 3_600_000 }))) {
      return NextResponse.json(
        { error: "Trop d'audits en peu de temps. Réessayez dans quelques minutes.", code: "rate_limit" },
        { status: 429 }
      );
    }

    const maxParMois = limitesDuPlan(plan).auditsParMoisMax;

    if (plan === null || maxParMois === 0) {
      return NextResponse.json(
        { error: "L'audit IA nécessite un abonnement. Le plan Pro inclut 30 audits par mois.", code: "audit_plan" },
        { status: 403 }
      );
    }

    if (maxParMois !== null) {
      const used = await getMonthlyUsage(supabase, user.id, "audit_ia");
      if (used >= maxParMois) {
        return NextResponse.json(
          {
            error: `Vous avez atteint la limite de ${maxParMois} audits ce mois-ci sur le plan ${planLabel(plan)}. ${
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

    const suivi = new SuiviBudgetIa(supabase, user.id, plan, "audit_ia", { fenetres: true });
    const refus = await verifierBudgetAudit(client, suivi, requete, SORTIE_MAX);
    if (refus) return refus;

    // Streaming : sur une très grosse page, un appel non streamé risque le délai HTTP du SDK.
    const message = await client.messages
      .stream({ model: AUDIT_MODELE, max_tokens: SORTIE_MAX, ...requete })
      .finalMessage();
    suivi.ajouter(message.model, message.usage);
    await suivi.enregistrer();

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
        { error: "Réponse Claude vide ou inattendue. Réessayez.", code: "ai_invalid_response" },
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
          error: "Réponse de l'IA illisible. Réessayez.", code: "ai_invalid_response",
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
          error: "Réponse de l'IA illisible. Réessayez.", code: "ai_invalid_response",
        },
        { status: 500 }
      );
    }

    // Le quota n'est décompté qu'en cas de succès — un audit qui échoue (erreur
    // Claude, JSON invalide...) ne doit pas coûter au client.
    await incrementMonthlyUsage(createSupabaseAdminClient(), user.id, "audit_ia");

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
      { error: "Erreur lors de l'analyse. Réessayez dans un instant.", code: "audit_failed" },
      { status: 500 }
    );
  }
}
