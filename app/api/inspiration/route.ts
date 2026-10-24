import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { convertirEnJpeg, detecterFormat } from "@/lib/image-capture";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { BudgetIaDepasse, reponseBudgetDepasse, SuiviBudgetIa, tokensEstimes } from "@/lib/ai-budget";
import { validerFicheStyle } from "@/lib/style-fiche";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Captures d'inspiration (1 à 3) → fiche de style à valeurs fermées (lib/style-fiche.ts).
// Chaque fichier est identifié par ses octets (jamais par son extension ni son type MIME
// déclaré), converti en JPEG 1600 px max par sharp, et seule cette version convertie passe
// par le bucket PRIVÉ « inspiration » (038_storage_inspiration.sql) avant d'être relue en
// base64 pour un unique appel vision, puis supprimée : rien n'est servi par URL, et seule la
// fiche validée ressort de cette route. Écriture et lecture avec le client de session (pas le
// client admin) : les policies propriétaire de 038 s'appliquent et storage.objects.owner est
// bien renseigné. Un fichier illisible n'invalide pas le lot : il est signalé à part.
const BUCKET = "inspiration";
const MAX_FICHIERS = 3;
// Limite de sécurité côté serveur. En production (Vercel), une requête dépassant 4,5 Mo est
// refusée avant d'arriver ici : le Site Builder réduit donc les images dans le navigateur
// avant l'envoi (components/site-builder/InspirationStyle.tsx).
const MAX_OCTETS = 15 * 1024 * 1024;
const MODELE_VISION = "claude-sonnet-4-6";
const MAX_TOKENS_FICHE = 1024;
const TOKENS_PAR_IMAGE_MAX = 3200;
const MESSAGE_ILLISIBLE = "Cette image ne peut pas être lue. Essaie une capture d'écran ou un export JPEG.";

const PROMPT_SYSTEME = `Tu analyses 1 à 3 captures d'écran de sites web pour en extraire UNIQUEMENT des valeurs de style abstraites.

Réponds EXCLUSIVEMENT par un objet JSON valide, sans texte avant ni après, sans balise markdown, de cette forme exacte :
{"palette":{"fond":"#RRGGBB","encre":"#RRGGBB","accent":"#RRGGBB"},"typo":"serif|sans|mono","rayon":0|8|16|24|999,"densite":"aeree|normale|dense","banniere":"16/9|21/9|4/3|plein-écran","sections":["..."],"cartes":"plate|bordée|ombrée|flottante"}

Règles :
- palette : couleur de fond dominante, couleur du texte principal, couleur d'accent (boutons, liens), en hex #RRGGBB.
- typo : style des titres (serif, sans ou mono).
- rayon : arrondi dominant des cartes, boutons et images, choisi parmi 0, 8, 16, 24, 999 (999 = pilule).
- densite : espacement vertical des sections (aeree, normale ou dense).
- banniere : ratio du visuel principal en haut de page (16/9, 21/9, 4/3 ou plein-écran).
- sections : formes de sections observées, dans l'ordre de la page, 5 au maximum, choisies UNIQUEMENT parmi : hero-centré, hero-split, grille-3, grille-2-alterne, bandeau-citation, pas-à-pas.
- cartes : style dominant des cartes (plate, bordée, ombrée ou flottante).
- Si plusieurs captures divergent, choisis la valeur dominante.

INTERDIT : recopier ou résumer le moindre texte visible, nom de marque, logo, image, illustration ou mise en page détaillée des captures. Aucune autre clé, aucune autre valeur que celles listées.`;

function extraireJson(texte: string): unknown {
  const nettoye = texte.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const debut = nettoye.indexOf("{");
  const fin = nettoye.lastIndexOf("}");
  if (debut === -1 || fin <= debut) throw new Error("aucun objet JSON");
  return JSON.parse(nettoye.slice(debut, fin + 1));
}

export async function POST(request: NextRequest) {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return NextResponse.json({ error: "Connecte-toi pour analyser des captures.", code: "auth_required" }, { status: 401 });
  }

  const form = await request.formData();
  const fichiers = form.getAll("files");
  if (fichiers.length === 0 || fichiers.length > MAX_FICHIERS) {
    return NextResponse.json({ error: `Envoie entre 1 et ${MAX_FICHIERS} captures.`, code: "inspiration_nombre", values: { max: MAX_FICHIERS } }, { status: 400 });
  }

  // Tri fichier par fichier : un fichier refusé est signalé dans erreursFichiers sans faire
  // échouer les autres.
  // code : clé traduite côté client (siteBuilder.inspiration.fichiers.*) ; erreur : texte pour les logs.
  const erreursFichiers: { fichier: string; erreur: string; code: string }[] = [];
  const convertis: { nom: string; jpeg: Buffer }[] = [];
  for (const f of fichiers) {
    if (!(f instanceof File)) {
      erreursFichiers.push({ fichier: "?", erreur: "Fichier invalide.", code: "invalide" });
      continue;
    }
    if (f.size > MAX_OCTETS) {
      erreursFichiers.push({ fichier: f.name, erreur: "Image trop lourde (15 Mo maximum).", code: "tropLourde" });
      continue;
    }
    const octets = Buffer.from(await f.arrayBuffer());
    if (!detecterFormat(octets)) {
      erreursFichiers.push({ fichier: f.name, erreur: "Ce fichier n'est pas une image.", code: "pasUneImage" });
      continue;
    }
    try {
      convertis.push({ nom: f.name, jpeg: await convertirEnJpeg(octets) });
    } catch (err) {
      console.warn("[inspiration] conversion", f.name, err instanceof Error ? err.message : err);
      erreursFichiers.push({ fichier: f.name, erreur: MESSAGE_ILLISIBLE, code: "illisible" });
    }
  }
  if (convertis.length === 0) {
    return NextResponse.json({ error: "Aucune image n'a pu être lue.", code: "inspiration_aucune_image", erreursFichiers }, { status: 400 });
  }

  // Budget IA vérifié avant tout envoi au stockage et à Claude. Une image JPEG de 1600 px au
  // plus coûte au maximum ~1 600 tokens une fois redimensionnée par l'API ; on en compte le
  // double par prudence.
  const suivi = new SuiviBudgetIa(supabase, user.id, plan, "inspiration_ia");
  try {
    await suivi.verifier(suivi.estimer(tokensEstimes(PROMPT_SYSTEME) + convertis.length * TOKENS_PAR_IMAGE_MAX + 50, MAX_TOKENS_FICHE));
  } catch (err) {
    if (err instanceof BudgetIaDepasse) return reponseBudgetDepasse(err);
    throw err;
  }

  const chemins: string[] = [];
  try {
    for (const c of convertis) {
      const chemin = `${user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(chemin, c.jpeg, { contentType: "image/jpeg", upsert: false });
      if (error) {
        console.error("[inspiration] upload", error.message);
        return NextResponse.json(
          { error: "Impossible d'enregistrer les captures (bucket « inspiration » absent ? voir 038_storage_inspiration.sql).", code: "inspiration_stockage" },
          { status: 500 }
        );
      }
      chemins.push(chemin);
    }

    const images: Anthropic.ImageBlockParam[] = [];
    for (const chemin of chemins) {
      const { data, error } = await supabase.storage.from(BUCKET).download(chemin);
      if (error || !data) {
        console.error("[inspiration] download", error?.message);
        return NextResponse.json({ error: "Impossible de relire les captures.", code: "inspiration_stockage" }, { status: 500 });
      }
      images.push({
        type: "image",
        source: {
          type: "base64",
          media_type: "image/jpeg",
          data: Buffer.from(await data.arrayBuffer()).toString("base64"),
        },
      });
    }

    const reponse = await client.messages.create({
      model: MODELE_VISION,
      max_tokens: MAX_TOKENS_FICHE,
      system: PROMPT_SYSTEME,
      messages: [
        {
          role: "user",
          content: [...images, { type: "text", text: "Renvoie la fiche de style JSON de ces captures." }],
        },
      ],
    });
    suivi.ajouter(reponse.model, reponse.usage);
    await suivi.enregistrer();

    const texte = reponse.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    let brut: unknown;
    try {
      brut = extraireJson(texte);
    } catch {
      console.error("[inspiration] réponse non JSON :", texte.slice(0, 300));
      return NextResponse.json(
        { error: "L'analyse n'a pas renvoyé de fiche exploitable. Réessaie.", code: "inspiration_fiche_invalide", erreursFichiers },
        { status: 502 }
      );
    }

    const { fiche, corrections } = validerFicheStyle(brut);
    return NextResponse.json({ fiche, corrections, erreursFichiers });
  } catch (err) {
    console.error("[inspiration]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erreur lors de l'analyse des captures.", code: "inspiration_erreur", erreursFichiers }, { status: 500 });
  } finally {
    // Captures supprimées dès l'analyse terminée (réussie ou non) : elles ne servent qu'à
    // cet appel. Un échec de suppression est seulement journalisé.
    if (chemins.length > 0) {
      const { error } = await supabase.storage.from(BUCKET).remove(chemins);
      if (error) console.error("[inspiration] suppression", error.message);
    }
  }
}
