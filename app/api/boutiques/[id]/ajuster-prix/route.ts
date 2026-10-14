import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-errors";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 300;

// Ajuste en un clic le prix de vente de tous les produits d'une boutique (bouton de la section
// Produits, components/site-builder/AjusterPrixIA.tsx) :
// - l'IA estime le prix auquel chaque produit se vend habituellement sur le marché (estimation
//   d'après ses connaissances, pas de recherche web : choix fait pour le coût) ;
// - le prix retenu n'est jamais inférieur au prix de vente suggéré affiché dans le Finder
//   (produits."prixVente", relié par boutique_produits.source_produit_id).
// L'ancien prix est gardé dans meta.prix_avant_ajustement pour l'afficher sur chaque ligne de
// la liste, et renvoyé pour permettre l'annulation (PATCH).

const PRODUITS_PAR_APPEL = 25;
const APPELS_SIMULTANES = 4;
const PRIX_MAX = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Produit = {
  id: string;
  nom: string;
  description: string | null;
  prix_vente: number;
  prix_original: number | null;
  source_produit_id: string | null;
  meta: Record<string, unknown> | null;
};
type Finder = { prixVente: number | null; prixFournisseur: number | null };
type AncienPrix = {
  id: string;
  prix_vente: number;
  prix_original: number | null;
  prix_avant_ajustement: number | null;
};

const SYSTEM = `Tu es un expert en pricing e-commerce sur le marché européen (dropshipping, boutiques en ligne, marketplaces).

Pour chaque produit, estime le prix de vente TTC en euros auquel ce type de produit se vend habituellement aujourd'hui en boutique en ligne en Europe, pour une offre comparable (même type de produit, même gamme).
- Base-toi sur la nature réelle du produit décrite par son titre et sa description, pas sur le prix actuel de la boutique.
- Le coût fournisseur, quand il est donné, t'aide à situer la gamme du produit : le prix de marché est normalement nettement au-dessus.
- Donne un prix psychologique réaliste (par exemple 19.90 ou 24.99).
- Donne un résultat pour chaque produit de la liste, avec son numéro.`;

const SCHEMA = {
  type: "object",
  properties: {
    produits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer" },
          prix: { type: "number" },
        },
        required: ["numero", "prix"],
        additionalProperties: false,
      },
    },
  },
  required: ["produits"],
  additionalProperties: false,
};

/** Prix de marché estimé pour chaque produit du lot, ou null. */
async function estimer(produits: Produit[], finder: Map<string, Finder>): Promise<(number | null)[]> {
  const liste = produits
    .map((p, i) => {
      const f = p.source_produit_id ? finder.get(p.source_produit_id) : undefined;
      const lignes = [`${i + 1}. ${p.nom.slice(0, 300)}`];
      if (p.description?.trim()) lignes.push(`   Description : ${p.description.trim().slice(0, 600)}`);
      if (f?.prixFournisseur) lignes.push(`   Coût fournisseur : ${f.prixFournisseur} €`);
      return lignes.join("\n");
    })
    .join("\n\n");

  const message = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `PRODUITS :\n\n${liste}` }],
  });

  const resultat: (number | null)[] = produits.map(() => null);
  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    console.error("[ajuster-prix] stop_reason:", message.stop_reason);
    return resultat;
  }
  const texte = message.content.find((b) => b.type === "text");
  if (!texte || texte.type !== "text") return resultat;

  let sortie: { numero: number; prix: number }[];
  try {
    sortie = (JSON.parse(texte.text) as { produits: typeof sortie }).produits;
  } catch {
    return resultat;
  }
  for (const { numero, prix } of sortie) {
    if (!Number.isInteger(numero) || numero < 1 || numero > produits.length) continue;
    if (typeof prix === "number" && Number.isFinite(prix) && prix > 0 && prix <= PRIX_MAX) resultat[numero - 1] = prix;
  }
  return resultat;
}

const arrondi = (prix: number) => Math.round(prix * 100) / 100;

async function ecrire(
  supabase: Awaited<ReturnType<typeof getServerUserAndPlan>>["supabase"],
  boutiqueId: string,
  lignes: { id: string; prix_vente: number; prix_original: number | null; meta: Record<string, unknown> }[]
): Promise<string | null> {
  const maintenant = new Date().toISOString();
  for (let i = 0; i < lignes.length; i += 10) {
    const erreurs = await Promise.all(
      lignes.slice(i, i + 10).map(({ id, prix_vente, prix_original, meta }) =>
        supabase
          .from("boutique_produits")
          .update({ prix_vente, prix_original, meta, updated_at: maintenant })
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
    return NextResponse.json({ error: "Connecte-toi pour ajuster tes prix.", code: "auth_required" }, { status: 401 });
  }

  if (!checkRateLimit(`ajuster-prix:${user.id}`, { max: 5, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de générations en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
      { status: 429 }
    );
  }

  // RLS : une boutique d'un autre utilisateur n'est simplement pas trouvée.
  const { data: boutique } = await supabase.from("boutiques").select("id").eq("id", boutiqueId).maybeSingle();
  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable.", code: "boutique_not_found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("boutique_produits")
    .select("id, nom, description, prix_vente, prix_original, source_produit_id, meta")
    .eq("boutique_id", boutiqueId)
    .order("position");
  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  const produits = (data ?? []) as Produit[];
  if (produits.length === 0) {
    return apiError("prix_aucun_produit", 400, "Ajoute des produits à la boutique avant d'ajuster leurs prix.");
  }

  // Prix du Finder des produits reliés au catalogue Dropvio (lecture publique, voir 001_produits.sql).
  const sources = [...new Set(produits.map((p) => p.source_produit_id).filter((s): s is string => Boolean(s)))];
  const finder = new Map<string, Finder>();
  if (sources.length > 0) {
    const { data: catalogue } = await supabase.from("produits").select('id, "prixVente", "prixFournisseur"').in("id", sources);
    for (const c of (catalogue ?? []) as { id: string; prixVente: number | null; prixFournisseur: number | null }[]) {
      finder.set(c.id, { prixVente: c.prixVente, prixFournisseur: c.prixFournisseur });
    }
  }

  const lots: Produit[][] = [];
  for (let i = 0; i < produits.length; i += PRODUITS_PAR_APPEL) lots.push(produits.slice(i, i + PRODUITS_PAR_APPEL));
  const estimations: (number | null)[] = [];
  try {
    for (let i = 0; i < lots.length; i += APPELS_SIMULTANES) {
      const vague = await Promise.all(lots.slice(i, i + APPELS_SIMULTANES).map((lot) => estimer(lot, finder)));
      for (const lot of vague) estimations.push(...lot);
    }
  } catch (err) {
    console.error("[ajuster-prix]", err);
    return NextResponse.json({ error: "Erreur lors de la génération. Réessaie.", code: "generation_failed" }, { status: 500 });
  }

  const anciens: AncienPrix[] = [];
  const ecritures: Parameters<typeof ecrire>[2] = [];
  let auPrixFinder = 0;
  let ignores = 0;
  produits.forEach((p, i) => {
    const marche = estimations[i];
    if (marche === null || marche === undefined) {
      ignores++;
      return;
    }
    const plancher = p.source_produit_id ? finder.get(p.source_produit_id)?.prixVente ?? null : null;
    const nouveau = arrondi(plancher !== null && plancher > marche ? plancher : marche);
    if (plancher !== null && plancher > marche) auPrixFinder++;
    const prixActuel = Number(p.prix_vente);
    if (nouveau === prixActuel) return;

    const meta = p.meta ?? {};
    const avantAjustement = typeof meta.prix_avant_ajustement === "number" ? meta.prix_avant_ajustement : null;
    anciens.push({ id: p.id, prix_vente: prixActuel, prix_original: p.prix_original, prix_avant_ajustement: avantAjustement });
    // Un prix barré inférieur ou égal au nouveau prix n'est plus une promotion : il est retiré
    // (et remis par l'annulation).
    const prixOriginal = p.prix_original !== null && Number(p.prix_original) > nouveau ? p.prix_original : null;
    ecritures.push({ id: p.id, prix_vente: nouveau, prix_original: prixOriginal, meta: { ...meta, prix_avant_ajustement: prixActuel } });
  });

  if (ecritures.length === 0 && ignores === produits.length) {
    return NextResponse.json({ error: "Réponse invalide. Réessaie.", code: "ai_invalid_response" }, { status: 500 });
  }

  const erreur = await ecrire(supabase, boutiqueId, ecritures);
  if (erreur) {
    return NextResponse.json({ error: erreur, code: "server_error" }, { status: 500 });
  }

  return NextResponse.json({ modifies: ecritures.length, auPrixFinder, ignores, anciens });
}

// Annulation : remet prix, prix barré et ancien prix affiché d'avant l'ajustement.
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: boutiqueId } = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour ajuster tes prix.", code: "auth_required" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const prix = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= PRIX_MAX;
  const anciens: unknown = corps?.anciens;
  if (
    !Array.isArray(anciens) ||
    !anciens.every(
      (a) =>
        typeof a?.id === "string" &&
        UUID.test(a.id) &&
        prix(a.prix_vente) &&
        (a.prix_original === null || prix(a.prix_original)) &&
        (a.prix_avant_ajustement === null || prix(a.prix_avant_ajustement))
    )
  ) {
    return NextResponse.json({ error: "Requête invalide.", code: "invalid_request" }, { status: 400 });
  }
  const liste = anciens as AncienPrix[];
  if (liste.length === 0) return NextResponse.json({ success: true });

  // meta relu en base : il porte aussi l'état de synchronisation Shopify, qui ne doit pas être
  // écrasé par une copie envoyée par le navigateur.
  const { data, error } = await supabase
    .from("boutique_produits")
    .select("id, meta")
    .eq("boutique_id", boutiqueId)
    .in("id", liste.map((a) => a.id));
  if (error) {
    return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
  }
  const metas = new Map((data ?? []).map((r) => [r.id as string, (r.meta ?? {}) as Record<string, unknown>]));

  const ecritures = liste
    .filter((a) => metas.has(a.id))
    .map((a) => {
      const meta = { ...metas.get(a.id)! };
      if (a.prix_avant_ajustement === null) delete meta.prix_avant_ajustement;
      else meta.prix_avant_ajustement = a.prix_avant_ajustement;
      return { id: a.id, prix_vente: a.prix_vente, prix_original: a.prix_original, meta };
    });

  const erreur = await ecrire(supabase, boutiqueId, ecritures);
  if (erreur) {
    return NextResponse.json({ error: erreur, code: "server_error" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
