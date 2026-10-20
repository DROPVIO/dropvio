import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getServerUserAndPlan } from "@/lib/supabase-server";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-errors";
import { reponseLimiteIa, SuiviBudgetIa, tokensEstimes } from "@/lib/ai-budget";
import { pagesValides } from "@/lib/site-builder-pages";
import {
  appliquerModificationsSite,
  pagesPourDemande,
  SCHEMA_MODIFICATIONS_SITE,
  TOUTES_LES_PAGES,
  type ModificationSite,
} from "@/lib/modifier-site";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const maxDuration = 300;

// Modification d'un site généré, sur toutes ses pages ou une seule (Site Builder, étape
// résultat : components/site-builder/ModifierSiteIA.tsx). Sans état : le client envoie les
// pages telles qu'il les affiche et enregistre lui-même le résultat (PATCH sites-generes).
// Même modèle et même fonction de budget que la génération (site_builder).

const MODELE = "claude-sonnet-5-5";
const SORTIE_MAX = 32000;
const DEMANDE_MAX = 2000;

const SYSTEM = `Tu es un développeur front-end expert en sites e-commerce. Tu modifies un site HTML existant selon la demande de son propriétaire, sous forme de remplacements ciblés, sans jamais renvoyer une page entière.

Chaque modification :
- "pages" : les clés des pages où l'appliquer, ou ["*"] pour toutes les pages (en-tête, navigation, pied de page, styles communs, ou élément présent sur plusieurs pages).
- "avant" : copie EXACTE, caractère pour caractère (espaces et retours à la ligne compris), d'un extrait présent dans chaque page visée. Prends juste assez de contexte pour qu'il soit unique dans la page, pas plus.
- "apres" : le texte qui remplace cet extrait. Pour ajouter du CSS ou du HTML, prends un repère existant (par exemple </style> ou une balise) et remets-le dans "apres".
- "partout" : true seulement pour remplacer CHAQUE occurrence d'un élément répété (par exemple toutes les cartes produit d'une grille) ; sinon false.
- "raison" : la modification faite, en une phrase courte.
Règles :
- Applique toute la demande, sur toutes les pages concernées : textes, titres, sections, couleurs, mise en page, éléments à ajouter ou retirer.
- Ne touche pas aux liens de navigation entre pages (href vers les fichiers .html), ni aux attributs data-dv et data-dv-* (le code s'en sert pour remplir les pages produit et d'achat), ni aux éléments vides qui les portent.
- N'invente ni prix, ni avis client, ni chiffre, ni marque. Garde la langue du site.
- Les modifications ne doivent pas se chevaucher.
- Les parties marquées [dv-omis] (longs scripts, blocs de commande répétés dans les cartes produit) sont omises pour gagner de la place : n'en recopie jamais dans "avant". Pour changer tous les blocs de commande, prends un extrait du premier bloc entier, sans identifiant propre à un produit (id="…-p0"), avec "partout": true.
- "resume" : ce que tu as changé, en une ou deux phrases, dans la langue de la demande.`;

export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserAndPlan();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour modifier ce site.", code: "auth_required" }, { status: 401 });
  }

  if (!checkRateLimit(`modifier-site:${user.id}`, { max: 20, windowMs: 3_600_000 })) {
    return NextResponse.json(
      { error: "Trop de générations en peu de temps. Réessaie dans quelques minutes.", code: "rate_limit" },
      { status: 429 }
    );
  }

  const corps = await request.json().catch(() => null);
  const demande = typeof corps?.demande === "string" ? corps.demande.trim().slice(0, DEMANDE_MAX) : "";
  const pages: Record<string, string> | null = pagesValides(corps?.pages)
    ? corps.pages
    : typeof corps?.html === "string" && corps.html.trim()
      ? { accueil: corps.html }
      : null;
  const cible = typeof corps?.cible === "string" ? corps.cible : TOUTES_LES_PAGES;
  if (!pages || demande.length < 3 || (cible !== TOUTES_LES_PAGES && !(cible in pages))) {
    return NextResponse.json({ error: "Requête invalide.", code: "invalid_request" }, { status: 400 });
  }

  const contenu = `DEMANDE DU PROPRIÉTAIRE :\n${demande}\n\nPAGES (clés : ${Object.keys(pages).join(", ")}) :\n\n${pagesPourDemande(pages, cible)}`;

  const suivi = new SuiviBudgetIa(supabase, user.id, plan, "site_builder", { fenetres: true });
  try {
    await suivi.verifier(suivi.estimer(tokensEstimes(SYSTEM + contenu), SORTIE_MAX));
    const message = await client.messages
      .stream({
        model: MODELE,
        max_tokens: SORTIE_MAX,
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA_MODIFICATIONS_SITE } },
        system: SYSTEM,
        messages: [{ role: "user", content: contenu }],
      })
      .finalMessage();
    suivi.ajouter(message.model, message.usage);

    if (message.stop_reason === "refusal" || message.stop_reason === "max_tokens") {
      console.error("[modifier-site] stop_reason:", message.stop_reason);
      return apiError("modification_echec", 502, "La modification n'a pas pu être appliquée. Reformule ou découpe ta demande.");
    }
    const texte = message.content.find((b) => b.type === "text");
    let sortie: { modifications: ModificationSite[]; resume: string };
    try {
      sortie = JSON.parse(texte && texte.type === "text" ? texte.text : "");
    } catch {
      return NextResponse.json({ error: "Réponse invalide. Réessaie.", code: "ai_invalid_response" }, { status: 500 });
    }

    const resultat = appliquerModificationsSite(pages, sortie.modifications ?? [], cible);
    console.log("[modifier-site] %d appliquée(s), %d ignorée(s), pages : %s", resultat.appliquees, resultat.ignorees, resultat.pagesModifiees.join(", "));
    if (resultat.appliquees === 0) {
      return apiError("modification_echec", 502, "La modification n'a pas pu être appliquée. Reformule ou découpe ta demande.");
    }
    return NextResponse.json({
      pages: resultat.pages,
      resume: typeof sortie.resume === "string" ? sortie.resume : "",
      appliquees: resultat.appliquees,
      ignorees: resultat.ignorees,
      pagesModifiees: resultat.pagesModifiees,
    });
  } catch (err) {
    const refus = reponseLimiteIa(err);
    if (refus) return refus;
    console.error("[modifier-site]", err);
    return NextResponse.json({ error: "Erreur lors de la génération. Réessaie.", code: "generation_failed" }, { status: 500 });
  } finally {
    await suivi.enregistrer();
  }
}
