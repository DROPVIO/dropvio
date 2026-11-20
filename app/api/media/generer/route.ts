import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getServerUserPlanOnly } from "@/lib/supabase-server";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { erreurGenerationPourApi, generateImage } from "@/lib/media";
import { generationDisponible } from "@/lib/media/config";
import { eligibiliteProduit, photoAutorisee, promptImageProduit } from "@/lib/media/images-produits";
import { OPENAI_IMAGE_MODEL } from "@/lib/media/openai";
import { BUCKET_MEDIATHEQUE, extensionDe, stockageMedia } from "@/lib/media/mediatheque";
import { MEDIA_FORMATS, MEDIA_MAX_OCTETS, MEDIA_PROMPT_MAX, type MediaFormat, type MediaMime } from "@/lib/media/constantes";
import { sourceQuotaImages } from "@/lib/media/quota-images-regles";
import { libererImageBudget, reserverImageBudget } from "@/lib/media/quota-images-serveur";
import { estOutilIa, type OutilIa } from "@/lib/pauses-outils";
import { rendreCreditsOutil, reserverCreditsOutil } from "@/lib/pauses-outils-serveur";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-errors";

// Inférieur aux 15 minutes de expert_rembourser_expirees : une génération encore en cours ne
// peut pas être remboursée par le cron.
export const maxDuration = 300;

const PROMPT_MIN = 3;
// Consigne ajoutée par l'utilisateur au prompt construit depuis la fiche produit.
const CONSIGNE_MAX = 500;
// Garde-fou contre les abus, pas une limite de plan : le quota du mois reste la vraie limite.
// Assez haut pour une génération en lot sur toute une boutique.
const GENERATIONS_PAR_HEURE = 200;
const DUREE_URL_SIGNEE_S = 3600;

// Outils possibles selon le type de génération : un outil de produit ne peut pas servir à un
// prompt libre et inversement. Sans outil envoyé : l'outil du Studio IA correspondant.
const OUTILS_PRODUIT_BOUTIQUE: readonly OutilIa[] = ["studio_images_produits", "boutique_images_produits"];
const OUTILS_PRODUIT_CATALOGUE: readonly OutilIa[] = ["studio_images_produits"];
const OUTILS_PROMPT_LIBRE: readonly OutilIa[] = ["studio_prompt_libre", "landing_page"];

function outilDeLaRequete(demande: unknown, autorises: readonly OutilIa[]): OutilIa | null {
  if (demande === undefined || demande === null) return autorises[0];
  return estOutilIa(demande) && autorises.includes(demande) ? demande : null;
}

function avecConsigne(prompt: string, consigne: string): string {
  return consigne ? `${prompt}\nAdditional instructions from the merchant: ${consigne}` : prompt;
}

// Réservée aux plans payants (Pro, Agency, Expert). Une génération doit passer, dans l'ordre : le
// garde-fou horaire, la pause et les crédits de l'outil (Pro et Agency, lib/pauses-outils.ts),
// puis le quota du mois.
// L'image est réservée AVANT l'appel au fournisseur (expert_consommer pour Expert, compteur
// images_ia du budget images pour Pro et Agency), puis rendue en cas d'échec : deux générations
// simultanées ne peuvent pas dépasser le quota.
export async function POST(request: Request) {
  const { supabase, user, plan } = await getServerUserPlanOnly();
  if (!user) {
    return apiError("auth_required", 401, "Connecte-toi pour générer une image.");
  }
  const source = sourceQuotaImages(plan);
  if (!generationDisponible(plan) || !source) {
    return apiError("plan_payant_requis", 403, "La génération d'images est réservée aux plans payants.");
  }
  if (!(await checkRateLimit(`media-generer:${user.id}`, { max: GENERATIONS_PAR_HEURE, windowMs: 3_600_000 }))) {
    return apiError("media_trop_de_requetes", 429, "Trop de générations en peu de temps.");
  }

  const body = await request.json().catch(() => null);
  const format = body?.format as MediaFormat;
  const produitId = typeof body?.produitId === "string" ? body.produitId : null;
  const produitCatalogueId = typeof body?.produitCatalogueId === "string" ? body.produitCatalogueId : null;
  const referenceMediaId = typeof body?.referenceMediaId === "string" ? body.referenceMediaId : null;
  const consigne = typeof body?.consigne === "string" ? body.consigne.trim().slice(0, CONSIGNE_MAX) : "";
  const outil = outilDeLaRequete(
    body?.outil,
    produitId ? OUTILS_PRODUIT_BOUTIQUE : produitCatalogueId ? OUTILS_PRODUIT_CATALOGUE : OUTILS_PROMPT_LIBRE
  );
  if (!outil) {
    return apiError("invalid_request", 400, "Outil invalide pour ce type de génération.");
  }
  const admin = createSupabaseAdminClient();

  // Images produits : le prompt et la photo viennent de la fiche produit (boutique de
  // l'utilisateur, ou catalogue commun), jamais du navigateur ; seule la consigne est libre.
  let prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  let reference: string | undefined;
  if (produitId) {
    const { data: produit, error: produitError } = await admin
      .from("boutique_produits")
      .select("id, nom, description, image_urls, boutiques!inner(user_id)")
      .eq("id", produitId)
      .eq("boutiques.user_id", user.id)
      .maybeSingle();
    if (produitError) {
      console.error("[media/generer] Produit illisible :", produitError.message);
      return apiError("media_service_indisponible", 503, "Produit illisible.");
    }
    if (!produit) return apiError("not_found", 404, "Produit introuvable.");
    const eligibilite = eligibiliteProduit(produit);
    if (!eligibilite.ok) {
      return apiError(eligibilite.raison === "sans_nom" ? "media_produit_sans_nom" : "media_produit_sans_photo", 400, "Produit sans nom ou sans photo.");
    }
    prompt = avecConsigne(promptImageProduit(produit.nom!, produit.description), consigne);
    reference = eligibilite.photo;
  } else if (produitCatalogueId) {
    const { data: produit } = await supabase.from("produits").select("id, nom, image").eq("id", produitCatalogueId).maybeSingle();
    if (!produit) return apiError("not_found", 404, "Produit introuvable.");
    if (!produit.nom?.trim()) return apiError("media_produit_sans_nom", 400, "Produit sans nom.");
    if (!produit.image || !photoAutorisee(produit.image)) return apiError("media_produit_sans_photo", 400, "Produit sans photo.");
    prompt = avecConsigne(promptImageProduit(produit.nom, null), consigne);
    reference = produit.image;
  } else if (referenceMediaId) {
    // Prompt libre avec une image de référence ajoutée dans les Réglages du Studio : seulement
    // une image de SA médiathèque, lue par une URL signée de courte durée.
    const { data: media } = await supabase.from("medias").select("chemin").eq("id", referenceMediaId).maybeSingle();
    if (!media) return apiError("media_introuvable", 404, "Image de référence introuvable.");
    const { data: signee } = await admin.storage.from(BUCKET_MEDIATHEQUE).createSignedUrl(media.chemin, 300);
    if (!signee?.signedUrl) return apiError("media_service_indisponible", 503, "Image de référence illisible.");
    reference = signee.signedUrl;
  }

  if (prompt.length < PROMPT_MIN || prompt.length > MEDIA_PROMPT_MAX || !Object.hasOwn(MEDIA_FORMATS, format)) {
    return apiError("invalid_request", 400, "Prompt ou format invalide.");
  }
  // Une erreur de base (table ou fonction absente, migration 046 non appliquée…) ne doit pas
  // faire planter la route : sans réponse JSON, l'interface n'affiche qu'un message générique.
  let stockage: { utilise: number; max: number };
  try {
    stockage = await stockageMedia(admin, user.id, plan);
  } catch (error) {
    console.error("[media/generer] Stockage illisible :", error instanceof Error ? error.message : "Erreur inconnue");
    return apiError("media_service_indisponible", 503, "Médiathèque indisponible.");
  }
  if (stockage.utilise + MEDIA_MAX_OCTETS > stockage.max) {
    return apiError("media_stockage_plein", 403, "Espace de stockage plein.");
  }

  // ── Pause et crédits de l'outil (Pro, Agency) : réservés avant tout le reste ──
  const reservationOutil = await reserverCreditsOutil(admin, user.id, plan, outil);
  if (!reservationOutil.ok) {
    if (reservationOutil.raison === "pause") {
      return apiError("outil_en_pause", 429, "Limite atteinte pour cet outil.", { values: { reprise: reservationOutil.finPause } });
    }
    if (reservationOutil.raison === "a_definir") return apiError("outil_reglages_a_definir", 403, `Réglages de l'outil ${outil} à définir.`);
    if (reservationOutil.raison === "migration") {
      console.error("[media/generer] Migration 054_outils_pauses.sql non appliquée.");
      return apiError("outil_migration_requise", 503, "Pauses par outil indisponibles : migration 054 non appliquée.");
    }
    return apiError("media_service_indisponible", 503, "Réservation des crédits de l'outil impossible.");
  }
  const creditsOutil = reservationOutil.reservationId;

  // ── Réservation d'une image sur le quota du mois ──
  let reservationExpert: string | null = null;
  if (source === "expert") {
    const { data: reservationId, error: reservationError } = await admin.rpc("expert_consommer", {
      p_user_id: user.id,
      p_type: "image",
      p_modele: OPENAI_IMAGE_MODEL,
    });
    if (reservationError) {
      console.error("[media/generer] Réservation impossible :", reservationError.message);
      await rendreCreditsOutil(admin, creditsOutil);
      return apiError("media_service_indisponible", 503, "Réservation du quota impossible.");
    }
    if (!reservationId) {
      await rendreCreditsOutil(admin, creditsOutil);
      return apiError("expert_quota_images", 403, "Quota d'images épuisé : rachète des crédits sur /quota.");
    }
    reservationExpert = reservationId as string;
  } else {
    const reservation = await reserverImageBudget(admin, user.id, plan);
    if (!reservation.ok) {
      // L'image n'est pas générée : les crédits de l'outil sont rendus.
      await rendreCreditsOutil(admin, creditsOutil);
      if (reservation.raison === "quota") return apiError("images_quota_epuise", 403, "Budget d'images du mois épuisé.");
      if (reservation.raison === "migration") {
        console.error("[media/generer] Migration 052_usage_images_ia.sql non appliquée.");
        return apiError("images_migration_requise", 503, "Génération indisponible : migration 052 non appliquée.");
      }
      return apiError("media_service_indisponible", 503, "Réservation du quota impossible.");
    }
  }

  const finaliser = async (reussie: boolean, tokensEntree = 0, tokensSortie = 0, coutUsd = 0) => {
    if (reservationExpert) {
      const { error } = await admin.rpc("expert_finaliser", {
        p_reservation_id: reservationExpert,
        p_reussie: reussie,
        p_tokens_entree: tokensEntree,
        p_tokens_sortie: tokensSortie,
        p_cout_usd: coutUsd,
      });
      if (error) console.error("[media/generer] Finalisation impossible :", error.message);
      return;
    }
    // Budget images seulement : l'image n'entre ni dans le budget IA ni dans ses limites
    // glissantes (pas de ligne dans usage_ia_journal).
    if (!reussie) await libererImageBudget(admin, user.id);
  };
  // Échec de génération : quota du mois ET crédits de l'outil rendus.
  const echouer = async () => {
    await finaliser(false);
    await rendreCreditsOutil(admin, creditsOutil);
  };

  let chemin: string | null = null;
  // Durées et étape en cours, pour les logs : un échec après une longue attente doit dire s'il
  // vient du fournisseur ou de l'enregistrement qui suit.
  const debutGeneration = Date.now();
  let etape: "fournisseur" | "enregistrement" = "fournisseur";
  try {
    const image = await generateImage(plan, prompt, { size: MEDIA_FORMATS[format], quality: "medium", reference });
    console.log(`[media/generer] Image reçue du fournisseur en ${((Date.now() - debutGeneration) / 1000).toFixed(1)} s (outil ${outil}, modèle ${image.model}).`);
    etape = "enregistrement";
    const octets = Buffer.from(image.base64, "base64");
    const id = randomUUID();
    chemin = `${user.id}/${id}.${extensionDe(image.mimeType as MediaMime)}`;

    const { error: envoiError } = await admin.storage
      .from(BUCKET_MEDIATHEQUE)
      .upload(chemin, octets, { contentType: image.mimeType, upsert: false });
    if (envoiError) throw new Error(envoiError.message);

    const { error: ligneError } = await admin.from("medias").insert({
      id,
      user_id: user.id,
      type: "image",
      origine: "generation",
      prompt,
      modele: image.model,
      format,
      taille_octets: octets.length,
      mime: image.mimeType,
      chemin,
      generation_id: reservationExpert,
      // Colonne ajoutée par la migration 048 : seulement pour une image de produit de boutique,
      // pour que la génération libre ne dépende pas de cette migration.
      ...(produitId ? { boutique_produit_id: produitId } : {}),
    });
    if (ligneError) throw new Error(ligneError.message);

    await finaliser(true, image.tokensEntree, image.tokensSortie, image.coutUsd ?? 0);

    // Aperçu immédiat (URL signée privée) : la copie publique n'est créée qu'à l'enregistrement
    // sur un produit.
    const { data: apercu } = await admin.storage.from(BUCKET_MEDIATHEQUE).createSignedUrl(chemin, DUREE_URL_SIGNEE_S);
    return NextResponse.json({ id, url: apercu?.signedUrl ?? null });
  } catch (error) {
    // Détail technique (cause, statut HTTP, code et message du fournisseur) : logs seulement.
    console.error(
      `[media/generer] Échec à l'étape « ${etape} » après ${((Date.now() - debutGeneration) / 1000).toFixed(1)} s :`,
      error instanceof Error ? `${error.name} — ${error.message}` : "Erreur inconnue"
    );
    if (chemin) await admin.storage.from(BUCKET_MEDIATHEQUE).remove([chemin]);
    await echouer();
    const { code, status, message } = erreurGenerationPourApi(error);
    return apiError(code, status, message);
  }
}
