import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-errors";
import { containsExcludedBrand } from "@/lib/brand-exclusions";
import { avecRepliLangue, langueBoutique } from "@/lib/boutique-langue";
import type { AppLocale } from "@/lib/locale";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 300;

// Réécrit en un clic le titre et la description de tous les produits d'une boutique (bouton
// de la section Produits, components/site-builder/ReecrireProduitsIA.tsx). Mêmes règles que la
// reformulation produit par produit (app/api/generer-texte-produit/route.ts), dans la langue
// de la boutique. Les slugs ne changent pas : liens publics et handles Shopify déjà publiés
// restent valides. Les anciens textes sont renvoyés pour permettre l'annulation (PATCH).

const PRODUITS_PAR_APPEL = 20;
const APPELS_SIMULTANES = 4;
const NOM_MAX = 200;
const DESCRIPTION_MAX = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NOMS_LANGUE: Record<AppLocale, string> = { fr: "français", en: "anglais", es: "espagnol", it: "italien" };

type Produit = { id: string; nom: string; description: string | null };
type Texte = { nom: string; description: string };

function system(langue: AppLocale): string {
  return `Tu es un copywriter e-commerce. Tu réécris les fiches produit d'une boutique, souvent issues de catalogues fournisseurs (AliExpress).

Pour chaque produit :
- "nom" : un nom court et vendeur, format e-commerce, 4 à 8 mots, sans bourrage de mots-clés ni répétition, fidèle à la nature réelle du produit.
- "description" : 2 à 4 phrases orientées bénéfice client, ton commercial mais sobre, sans superlatifs vides.

Règles absolues :
- N'invente aucune caractéristique (matière, taille, quantité, fonctionnalité, couleur) absente du titre et de la description d'origine.
- Ne mentionne jamais une marque déposée, un personnage sous licence, un studio ou une franchise, même si le texte d'origine en contient : reformule de façon générique.
- Ne mentionne aucune plateforme e-commerce (AliExpress, Amazon, Shopify…).
- Écris tout en ${NOMS_LANGUE[langue]}, quelle que soit la langue du texte d'origine.
- Donne un résultat pour chaque produit de la liste, avec son numéro.`;
}

const SCHEMA = {
  type: "object",
  properties: {
    produits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          nom: { type: "string" },
          description: { type: "string" },
        },
        required: ["numero", "nom", "description"],
        additionalProperties: false,
      },
    },
  },
  required: ["produits"],
  additionalProperties: false,
};

/** Nouveaux textes du lot, dans l'ordre ; null pour un produit sans résultat exploitable. */
async function reecrire(produits: Produit[], langue: AppLocale): Promise<(Texte | null)[]> {
  const liste = produits
    .map((p, i) => {
      const description = p.description?.trim() ? `\n   Description d'origine : ${p.description.trim().slice(0, 1500)}` : "";
      return `${i + 1}. Titre d'origine : ${p.nom.slice(0, 500)}${description}`;
    })
    .join("\n\n");

  const message = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: system(langue),
    messages: [{ role: "user", content: `PRODUITS :\n\n${liste}` }],
  });

  const resultat: (Texte | null)[] = produits.map(() => null);
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    console.error("[reecrire-produits] stop_reason:", message.stop_reason);
    return resultat;
  }
  const texte = message.content.find((b) => b.type === "text");
  if (!texte || texte.type !== "text") return resultat;

  let sortie: { numero: number; nom: string; description: string }[];
  try {
    sortie = (JSON.parse(texte.text) as { produits: typeof sortie }).produits;
  } catch {
    return resultat;
  }
  for (const { numero, nom, description } of sortie) {
    if (!Number.isInteger(numero) || numero < 1 || numero > produits.length) continue;
    const n = nom.trim().slice(0, NOM_MAX);
    const d = description.trim().slice(0, DESCRIPTION_MAX);
    // Filet de sécurité : un texte qui cite malgré tout une marque n'est pas appliqué, le
    // produit garde ses textes actuels.
    if (!n || !d || containsExcludedBrand(n) || containsExcludedBrand(d)) continue;
    resultat[numero - 1] = { nom: n, description: d };
  }
  return resultat;
}

async function mettreAJour(
  supabase: Awaited<ReturnType<typeof getServerUserAndPlan>>["supabase"],
  boutiqueId: string,
  lignes: { id: string; nom: string; description: string | null }[]
): Promise<string | null> {
  const maintenant = new Date().toISOString();
  for (let i = 0; i < lignes.length; i += 10) {
    const erreurs = await Promise.all(
      lignes.slice(i, i + 10).map(({ id, nom, description }) =>
        supabase
          .from("boutique_produits")
          .update({ nom, description, updated_at: maintenant })
          .eq("boutique_id", boutiqueId)
          .eq("id", id)
          .then(({ error }) => error?.message ?? null)
      )
    );
    const erreur = erreurs.find(Boolean);
    if (erreur) return erreur;
  }
  return null;
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: boutiqueId } = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour réécrire tes produits.", code: "auth_required" }, { status: 401 });
  }

  if (!checkRateLimit(`reecrire-produits:${user.id}`, { max: 5, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de générations en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
      { status: 429 }
    );
  }

  // RLS : une boutique d'un autre utilisateur n'est simplement pas trouvée.
  const { data: boutique } = await avecRepliLangue((avecLangue) =>
    supabase.from("boutiques").select(avecLangue ? "id, langue" : "id").eq("id", boutiqueId).maybeSingle()
  );
  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable.", code: "boutique_not_found" }, { status: 404 });
  }
  const langue = langueBoutique(boutique as { langue?: unknown });

  const { data, error } = await supabase
    .from("boutique_produits")
    .select("id, nom, description")
    .eq("boutique_id", boutiqueId)
    .order("position");
  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  const produits = (data ?? []) as Produit[];
  if (produits.length === 0) {
    return apiError("reecriture_aucun_produit", 400, "Ajoute des produits à la boutique avant de les réécrire.");
  }

  // Lots traités APPELS_SIMULTANES à la fois : 200 produits = 10 lots, environ 3 vagues.
  const lots: Produit[][] = [];
  for (let i = 0; i < produits.length; i += PRODUITS_PAR_APPEL) lots.push(produits.slice(i, i + PRODUITS_PAR_APPEL));
  const textes: (Texte | null)[] = [];
  try {
    for (let i = 0; i < lots.length; i += APPELS_SIMULTANES) {
      const vague = await Promise.all(lots.slice(i, i + APPELS_SIMULTANES).map((lot) => reecrire(lot, langue)));
      for (const lot of vague) textes.push(...lot);
    }
  } catch (err) {
    console.error("[reecrire-produits]", err);
    return NextResponse.json({ error: "Erreur lors de la génération. Réessaie.", code: "generation_failed" }, { status: 500 });
  }

  const modifies = produits.flatMap((p, i) => (textes[i] ? [{ id: p.id, ...textes[i]! }] : []));
  if (modifies.length === 0) {
    return NextResponse.json({ error: "Réponse invalide. Réessaie.", code: "ai_invalid_response" }, { status: 500 });
  }

  const erreur = await mettreAJour(supabase, boutiqueId, modifies);
  if (erreur) {
    return NextResponse.json({ error: erreur, code: "server_error" }, { status: 500 });
  }

  const ids = new Set(modifies.map((m) => m.id));
  return NextResponse.json({
    modifies: modifies.length,
    ignores: produits.length - modifies.length,
    anciens: produits.filter((p) => ids.has(p.id)),
  });
}

// Annulation : remet les titres et descriptions d'avant la réécriture.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: boutiqueId } = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour réécrire tes produits.", code: "auth_required" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const anciens: unknown = corps?.anciens;
  if (
    !Array.isArray(anciens) ||
    !anciens.every(
      (a) =>
        typeof a?.id === "string" &&
        UUID.test(a.id) &&
        typeof a.nom === "string" &&
        a.nom.trim() &&
        (a.description === null || typeof a.description === "string")
    )
  ) {
    return NextResponse.json({ error: "Requête invalide.", code: "invalid_request" }, { status: 400 });
  }

  const erreur = await mettreAJour(supabase, boutiqueId, anciens as Produit[]);
  if (erreur) {
    return NextResponse.json({ error: erreur, code: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
