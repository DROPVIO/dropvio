import { OPENAI_IMAGE_EDIT_URL, OPENAI_IMAGE_MODEL, OPENAI_IMAGE_URL } from "./openai-constantes";
import { MEDIA_MAX_OCTETS } from "./constantes";
import { fetchSur } from "../fetch-sur";
import {
  MediaProviderError,
  MediaProviderNotConfiguredError,
  type GenerateImageOptions,
  type GeneratedImage,
  type MediaErreurType,
} from "./types";

export { OPENAI_IMAGE_MODEL, OPENAI_IMAGE_URL };

const TEXT_INPUT_USD_PAR_MILLION = 5;
const IMAGE_OUTPUT_USD_PAR_MILLION = 30;
// La qualité haute peut dépasser la minute : au-delà de ce délai, la requête est abandonnée.
const TIMEOUT_MS = 180_000;

type OpenAIImageResponse = {
  data?: { b64_json?: string; url?: string }[];
  output_format?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string; type?: string; code?: string | null; param?: string | null };
};

export function buildOpenAIImageRequest(prompt: string, options: GenerateImageOptions = {}) {
  return {
    model: OPENAI_IMAGE_MODEL,
    prompt,
    n: 1,
    size: options.size ?? "1024x1024",
    quality: options.quality ?? "medium",
    output_format: "png",
  };
}

const CODES_LIMITE = new Set(["insufficient_quota", "billing_hard_limit_reached", "rate_limit_exceeded"]);
const CODES_REFUS = new Set(["moderation_blocked", "content_policy_violation", "content_filter"]);
const CODES_MODELE = new Set(["model_not_found", "invalid_model"]);

/** Classe une réponse d'erreur OpenAI (statut + corps) en cause exploitable. */
export function classerErreurOpenAI(status: number, erreur: OpenAIImageResponse["error"]): MediaErreurType {
  const code = erreur?.code ?? "";
  const message = (erreur?.message ?? "").toLowerCase();
  if (status === 401 || status === 403) return "cle";
  if (status === 429 || CODES_LIMITE.has(code)) return "limite";
  if (CODES_REFUS.has(code) || /safety system|content policy|moderation/.test(message)) return "refus";
  if (status === 404 || CODES_MODELE.has(code) || (erreur?.param === "model" && status === 400)) return "modele";
  if (status >= 500) return "indisponible";
  return "parametre";
}

/** Téléchargement de la photo de référence : URL fournie par l'utilisateur (fiche produit), donc
 *  toujours par fetchSur (protection SSRF et DNS rebinding). Remplaçable par les tests. */
export const telechargementReference = {
  fetch: (url: string, init: RequestInit): Promise<Response> => fetchSur(url, init),
};

/** Télécharge la photo de référence. Une photo illisible n'est pas une panne du fournisseur :
 *  l'erreur est classée « reponse ». */
async function photoReference(url: string): Promise<Blob> {
  let reponse: Response;
  try {
    reponse = await telechargementReference.fetch(url, { signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    throw new MediaProviderError("reponse", { fournisseur: "OpenAI", message: `photo de référence illisible (${error instanceof Error ? error.message : "réseau"})` });
  }
  const type = reponse.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const octets = reponse.ok ? await reponse.arrayBuffer() : null;
  if (!octets || !/^image\/(jpeg|png|webp)$/.test(type) || octets.byteLength > MEDIA_MAX_OCTETS) {
    throw new MediaProviderError("reponse", { fournisseur: "OpenAI", status: reponse.status, message: `photo de référence refusée (${type || "type inconnu"}, ${octets?.byteLength ?? 0} octets)` });
  }
  return new Blob([octets], { type });
}

/** Corps multipart de /v1/images/edits : mêmes paramètres que la génération, plus la photo. */
async function requeteEdition(prompt: string, options: GenerateImageOptions & { reference: string }): Promise<FormData> {
  const photo = await photoReference(options.reference);
  const corps = new FormData();
  for (const [cle, valeur] of Object.entries(buildOpenAIImageRequest(prompt, options))) corps.append(cle, String(valeur));
  corps.append("image", photo, `reference.${photo.type.split("/")[1]}`);
  return corps;
}

async function base64DepuisUrl(url: string): Promise<string> {
  const reponse = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!reponse.ok) throw new MediaProviderError("reponse", { fournisseur: "OpenAI", status: reponse.status, message: "URL d'image illisible" });
  return Buffer.from(await reponse.arrayBuffer()).toString("base64");
}

export async function generateImageOpenAI(prompt: string, options: GenerateImageOptions = {}): Promise<GeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new MediaProviderNotConfiguredError("OpenAI");
  }

  // Avec une photo de référence : /images/edits en multipart. Sans : inchangé.
  const { reference } = options;
  const corps = reference ? await requeteEdition(prompt, { ...options, reference }) : JSON.stringify(buildOpenAIImageRequest(prompt, options));

  let response: Response;
  try {
    response = await fetch(reference ? OPENAI_IMAGE_EDIT_URL : OPENAI_IMAGE_URL, {
      method: "POST",
      headers: reference ? { Authorization: `Bearer ${apiKey}` } : { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: corps,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new MediaProviderError("indisponible", { fournisseur: "OpenAI", message: error instanceof Error ? error.message : "réseau" });
  }
  const json = (await response.json().catch(() => ({}))) as OpenAIImageResponse;

  if (!response.ok) {
    const type = classerErreurOpenAI(response.status, json.error);
    // Le message d'erreur d'un 401 peut contenir un extrait de la clé : il n'est jamais repris.
    const message = type === "cle" ? "OpenAI a refusé la clé OPENAI_API_KEY." : json.error?.message ?? "réponse illisible";
    throw new MediaProviderError(type, { fournisseur: "OpenAI", status: response.status, code: json.error?.code ?? undefined, message });
  }

  // gpt-image renvoie l'image en base64 ; d'autres modèles renvoient une URL. Les deux sont acceptés.
  const premiere = json.data?.[0];
  const base64 = premiere?.b64_json ?? (premiere?.url ? await base64DepuisUrl(premiere.url) : undefined);
  if (!base64) {
    throw new MediaProviderError("reponse", { fournisseur: "OpenAI", status: response.status, message: "aucune image dans la réponse" });
  }

  const { input_tokens: tokensEntree, output_tokens: tokensSortie } = json.usage ?? {};
  const coutUsd =
    tokensEntree === undefined || tokensSortie === undefined
      ? null
      : (tokensEntree * TEXT_INPUT_USD_PAR_MILLION + tokensSortie * IMAGE_OUTPUT_USD_PAR_MILLION) / 1_000_000;

  return {
    base64,
    mimeType: `image/${json.output_format ?? "png"}`,
    model: OPENAI_IMAGE_MODEL,
    tokensEntree: tokensEntree ?? 0,
    tokensSortie: tokensSortie ?? 0,
    coutUsd,
  };
}
