// HTML envoyé à l'audit IA (app/api/audit-site/route.ts pour le scoring,
// app/api/audit-site/html/route.ts pour la correction). Plus aucune troncature : la page est
// envoyée en entier et la limite est un quota mensuel de tokens par plan
// (PLAN_LIMITS.tokensAuditParMoisMax, lib/plan-limits.ts), calé sur le coût maximal de
// l'ancien quota en nombre d'audits et vérifié avant l'appel avec messages.countTokens.
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMonthlyTokensPonderes, planLabel, PLAN_LIMITS, POIDS_TOKENS_SORTIE, type Plan } from "@/lib/plan-limits";
import { apiError } from "@/lib/api-errors";

export const AUDIT_MODELE = "claude-sonnet-4-6";

// Fenêtre de contexte de claude-sonnet-4-6 (1M tokens). Seule limite de taille restante :
// une page plus grosse que ça ne peut pas être lue d'un bloc par le modèle, quel que soit le quota.
export const AUDIT_CONTEXTE_MAX_TOKENS = 1_000_000;

// Images et polices intégrées en base64 : souvent la majorité du poids d'une page exportée,
// et rien d'auditable dedans (le modèle ne « voit » pas une image à travers son base64). On
// remplace la charge utile par un repère unique, en gardant le type MIME (data:image/png;base64,)
// pour que le modèle sache qu'une image est là. Réversible avec restaurerHtml.
const DONNEES_BASE64 = /(data:[\w.+-]+\/[\w.+-]+(?:;[\w-]+=[\w.-]+)*;base64,)([A-Za-z0-9+/=\s]{200,})/g;

export type HtmlCompacte = { html: string; blocs: string[] };

export function compacterHtml(html: string): HtmlCompacte {
  const blocs: string[] = [];
  const compacte = html.replace(DONNEES_BASE64, (_, entete: string, donnees: string) => {
    blocs.push(donnees);
    return `${entete}__DV_DONNEES_${blocs.length - 1}__`;
  });
  return { html: compacte, blocs };
}

export function restaurerHtml(html: string, blocs: string[]): string {
  return html.replace(/__DV_DONNEES_(\d+)__/g, (repere, i: string) => blocs[Number(i)] ?? repere);
}

/** Vérifie, avant l'appel facturé, que la requête tient dans le contexte du modèle et dans le
 *  quota de tokens du mois. Renvoie une réponse d'erreur prête à renvoyer, ou null si c'est bon.
 *  `sortieMax` (le max_tokens de l'appel) est réservé dans le quota, pondéré comme la sortie
 *  facturée (POIDS_TOKENS_SORTIE) : la consommation réelle
 *  est ensuite enregistrée par logTokensUsage avec les chiffres exacts de usage. */
export async function verifierBudgetAudit(
  client: Anthropic,
  supabase: SupabaseClient,
  userId: string,
  plan: Plan,
  requete: Pick<Anthropic.MessageCountTokensParams, "system" | "messages">,
  sortieMax: number
) {
  const { input_tokens: entree } = await client.messages.countTokens({ model: AUDIT_MODELE, ...requete });

  if (entree + sortieMax > AUDIT_CONTEXTE_MAX_TOKENS) {
    return apiError(
      "audit_too_large",
      413,
      `Cette page représente ${entree.toLocaleString("fr-FR")} tokens, au-delà de ce que l'IA peut lire en une fois (${(AUDIT_CONTEXTE_MAX_TOKENS - sortieMax).toLocaleString("fr-FR")}).`,
      { values: { tokens: entree, max: AUDIT_CONTEXTE_MAX_TOKENS - sortieMax } }
    );
  }

  const quota = PLAN_LIMITS[plan].tokensAuditParMoisMax;
  if (quota !== null) {
    const utilises = await getMonthlyTokensPonderes(supabase, userId, "audit_ia");
    const restant = Math.max(0, quota - utilises);
    const besoin = entree + POIDS_TOKENS_SORTIE * sortieMax;
    if (besoin > restant) {
      return apiError(
        "audit_tokens_limit",
        403,
        `Cet audit demande environ ${besoin.toLocaleString("fr-FR")} tokens, il t'en reste ${restant.toLocaleString("fr-FR")} sur ${quota.toLocaleString("fr-FR")} ce mois-ci (plan ${planLabel(plan)}).`,
        { values: { besoin, restant, max: quota, plan: planLabel(plan) } }
      );
    }
  }

  return null;
}
