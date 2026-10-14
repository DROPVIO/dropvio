import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-errors";
import { slugify } from "@/lib/slugify";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 120;

// Tri automatique des produits d'une boutique dans des collections (boutique_categories),
// d'après leur titre. L'utilisateur donne le nom des collections (et une description s'il
// veut préciser ce qu'elles contiennent) ; l'IA range chaque produit dans celle qui le décrit.
// Un produit qui ne correspond à aucune collection garde la sienne : le tri n'enlève jamais
// un produit d'une collection sans lui en donner une autre.

const COLLECTIONS_MAX = 30;
const NOM_MAX = 80;
const DESCRIPTION_MAX = 500;
// Produits envoyés par appel : la sortie (une affectation par produit) reste courte.
const PRODUITS_PAR_APPEL = 250;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CollectionDemandee = { nom: string; description: string };
type Collection = { id: string | null; nom: string; description: string };
type Produit = { id: string; nom: string; category_id: string | null };

const SYSTEM = `Tu ranges les produits d'une boutique e-commerce dans des collections, d'après leur titre.

Règles :
- Chaque produit va dans la collection qui le décrit le mieux, d'après le nom de la collection et sa description quand elle est donnée.
- Si aucune collection ne correspond vraiment au produit, réponds null pour ce produit : ne le force jamais dans une collection qui ne lui va pas.
- Un produit va dans une seule collection.
- Donne une affectation pour chaque produit de la liste, avec son numéro.`;

const SCHEMA = {
  type: "object",
  properties: {
    affectations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          produit: { type: "integer" },
          collection: { anyOf: [{ type: "integer" }, { type: "null" }] },
        },
        required: ["produit", "collection"],
        additionalProperties: false,
      },
    },
  },
  required: ["affectations"],
  additionalProperties: false,
};

function normaliserNom(nom: string): string {
  return nom.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

function lireCollections(valeur: unknown): CollectionDemandee[] | null {
  if (!Array.isArray(valeur) || valeur.length > COLLECTIONS_MAX) return null;
  const collections: CollectionDemandee[] = [];
  for (const brut of valeur) {
    const nom = typeof brut?.nom === "string" ? brut.nom.trim().slice(0, NOM_MAX) : "";
    if (!nom) continue;
    const description = typeof brut?.description === "string" ? brut.description.trim().slice(0, DESCRIPTION_MAX) : "";
    collections.push({ nom, description });
  }
  return collections;
}

/** Renvoie, pour chaque produit du lot, l'indice de sa collection ou null. */
async function classer(collections: Collection[], produits: Produit[]): Promise<(number | null)[] | null> {
  const listeCollections = collections
    .map((c, i) => `C${i + 1}. ${c.nom}${c.description ? ` — ${c.description}` : ""}`)
    .join("\n");
  const listeProduits = produits.map((p, i) => `${i + 1}. ${p.nom.slice(0, 200)}`).join("\n");

  const message = await client.beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-06-01"],
    fallbacks: [{ model: "claude-opus-4-8" }],
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `COLLECTIONS (numéro de collection = le nombre après C) :\n${listeCollections}\n\nPRODUITS :\n${listeProduits}`,
      },
    ],
  });

  if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
    console.error("[trier-produits] stop_reason:", message.stop_reason);
    return null;
  }
  const texte = message.content.find((b) => b.type === "text");
  if (!texte || texte.type !== "text") return null;

  let affectations: { produit: number; collection: number | null }[];
  try {
    affectations = (JSON.parse(texte.text) as { affectations: typeof affectations }).affectations;
  } catch {
    return null;
  }

  const resultat: (number | null)[] = produits.map(() => null);
  for (const { produit, collection } of affectations) {
    if (!Number.isInteger(produit) || produit < 1 || produit > produits.length) continue;
    resultat[produit - 1] =
      collection !== null && Number.isInteger(collection) && collection >= 1 && collection <= collections.length
        ? collection - 1
        : null;
  }
  return resultat;
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: boutiqueId } = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour trier tes produits.", code: "auth_required" }, { status: 401 });
  }

  if (!checkRateLimit(`trier-produits:${user.id}`, { max: 10, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de requêtes en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
      { status: 429 }
    );
  }

  const corps = await request.json().catch(() => null);
  const demandees = lireCollections(corps?.collections);
  const inclureExistantes = corps?.inclureExistantes !== false;
  if (!demandees) {
    return NextResponse.json({ error: "Requête invalide.", code: "invalid_request" }, { status: 400 });
  }

  // RLS : une boutique d'un autre utilisateur n'est simplement pas trouvée.
  const { data: boutique } = await supabase.from("boutiques").select("id").eq("id", boutiqueId).maybeSingle();
  if (!boutique) {
    return NextResponse.json({ error: "Boutique introuvable.", code: "boutique_not_found" }, { status: 404 });
  }

  const [{ data: existantes, error: catErr }, { data: produitsData, error: prodErr }] = await Promise.all([
    supabase.from("boutique_categories").select("id, nom, slug, position").eq("boutique_id", boutiqueId),
    supabase.from("boutique_produits").select("id, nom, category_id").eq("boutique_id", boutiqueId).order("position"),
  ]);
  if (catErr || prodErr) {
    return NextResponse.json({ error: (catErr ?? prodErr)!.message, code: "server_error" }, { status: 500 });
  }
  const produits = (produitsData ?? []) as Produit[];
  if (produits.length === 0) {
    return apiError("tri_aucun_produit", 400, "Ajoute des produits à la boutique avant de les trier.");
  }

  // Une collection saisie qui porte le nom d'une collection existante la réutilise (avec la
  // description saisie) au lieu d'en créer une deuxième du même nom.
  const collections: Collection[] = [];
  const parNom = new Map((existantes ?? []).map((c) => [normaliserNom(c.nom), c]));
  const dejaPrises = new Set<string>();
  for (const d of demandees) {
    const cle = normaliserNom(d.nom);
    if (dejaPrises.has(cle)) continue;
    dejaPrises.add(cle);
    collections.push({ id: parNom.get(cle)?.id ?? null, nom: parNom.get(cle)?.nom ?? d.nom, description: d.description });
  }
  if (inclureExistantes) {
    for (const c of existantes ?? []) {
      if (!dejaPrises.has(normaliserNom(c.nom))) collections.push({ id: c.id, nom: c.nom, description: "" });
    }
  }
  if (collections.length === 0) {
    return apiError("tri_aucune_collection", 400, "Indique au moins une collection dans laquelle trier les produits.");
  }

  // Classement avant toute écriture : si l'IA échoue, rien n'est créé ni déplacé.
  const affectations: (number | null)[] = [];
  try {
    for (let i = 0; i < produits.length; i += PRODUITS_PAR_APPEL) {
      const lot = await classer(collections, produits.slice(i, i + PRODUITS_PAR_APPEL));
      if (!lot) {
        return NextResponse.json({ error: "Réponse invalide. Réessaie.", code: "ai_invalid_response" }, { status: 500 });
      }
      affectations.push(...lot);
    }
  } catch (err) {
    console.error("[trier-produits]", err);
    return NextResponse.json({ error: "Erreur lors du tri. Réessaie.", code: "tri_echec" }, { status: 500 });
  }

  // Création des collections nouvelles, avec un slug libre dans la boutique.
  const slugsPris = new Set((existantes ?? []).map((c) => c.slug));
  let position = Math.max(-1, ...(existantes ?? []).map((c) => c.position ?? 0)) + 1;
  const creees: string[] = [];
  for (const c of collections) {
    if (c.id) continue;
    const base = slugify(c.nom.normalize("NFD").replace(/[̀-ͯ]/g, "")) || "collection";
    let slug = base;
    for (let n = 2; slugsPris.has(slug); n++) slug = `${base}-${n}`;
    slugsPris.add(slug);
    const { data, error } = await supabase
      .from("boutique_categories")
      .insert({ boutique_id: boutiqueId, nom: c.nom, slug, position: position++ })
      .select("id")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Erreur serveur", code: "server_error" }, { status: 500 });
    }
    c.id = data.id;
    creees.push(data.id);
  }

  // Déplacements, regroupés par collection cible (une requête par collection).
  const parCible = new Map<string, string[]>();
  const deplaces: { id: string; ancien: string | null }[] = [];
  const comptes = new Map<string, number>();
  let sansCollection = 0;
  produits.forEach((p, i) => {
    const indice = affectations[i];
    if (indice === null || indice === undefined) {
      sansCollection++;
      return;
    }
    const cible = collections[indice].id!;
    comptes.set(cible, (comptes.get(cible) ?? 0) + 1);
    if (p.category_id === cible) return;
    parCible.set(cible, [...(parCible.get(cible) ?? []), p.id]);
    deplaces.push({ id: p.id, ancien: p.category_id });
  });

  const maintenant = new Date().toISOString();
  for (const [cible, ids] of parCible) {
    const { error } = await supabase
      .from("boutique_produits")
      .update({ category_id: cible, updated_at: maintenant })
      .eq("boutique_id", boutiqueId)
      .in("id", ids);
    if (error) {
      return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
    }
  }

  return NextResponse.json({
    deplaces,
    creees,
    sansCollection,
    collections: collections.map((c) => ({ id: c.id, nom: c.nom, produits: comptes.get(c.id!) ?? 0 })),
  });
}

// Annulation d'un tri : remet chaque produit déplacé dans sa collection d'avant et supprime les
// collections que ce tri avait créées (redevenues vides).
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: boutiqueId } = await context.params;
  const { supabase, user } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour trier tes produits.", code: "auth_required" }, { status: 401 });
  }

  const corps = await request.json().catch(() => null);
  const deplaces: unknown = corps?.deplaces;
  const creees: unknown = corps?.creees;
  if (
    !Array.isArray(deplaces) ||
    !deplaces.every((d) => typeof d?.id === "string" && UUID.test(d.id) && (d.ancien === null || (typeof d.ancien === "string" && UUID.test(d.ancien)))) ||
    !Array.isArray(creees) ||
    !creees.every((c) => typeof c === "string" && UUID.test(c))
  ) {
    return NextResponse.json({ error: "Requête invalide.", code: "invalid_request" }, { status: 400 });
  }

  const parAncien = new Map<string | null, string[]>();
  for (const d of deplaces as { id: string; ancien: string | null }[]) {
    parAncien.set(d.ancien, [...(parAncien.get(d.ancien) ?? []), d.id]);
  }
  const maintenant = new Date().toISOString();
  for (const [ancien, ids] of parAncien) {
    const { error } = await supabase
      .from("boutique_produits")
      .update({ category_id: ancien, updated_at: maintenant })
      .eq("boutique_id", boutiqueId)
      .in("id", ids);
    if (error) {
      return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
    }
  }

  if (creees.length > 0) {
    // Détachées d'abord : un produit ajouté entre-temps dans une de ces collections reste
    // dans la boutique, sans collection (même règle que la suppression manuelle).
    await supabase
      .from("boutique_produits")
      .update({ category_id: null, updated_at: maintenant })
      .eq("boutique_id", boutiqueId)
      .in("category_id", creees as string[]);
    const { error } = await supabase
      .from("boutique_categories")
      .delete()
      .eq("boutique_id", boutiqueId)
      .in("id", creees as string[]);
    if (error) {
      return NextResponse.json({ error: error.message, code: "server_error" }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
