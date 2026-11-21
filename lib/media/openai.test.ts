// Classification des erreurs OpenAI et messages renvoyés à l'utilisateur : npm test.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { erreurGenerationPourApi } from "./index";
import { classerErreurOpenAI, generateImageOpenAI } from "./openai";
import { MediaProviderError, MediaProviderNotConfiguredError } from "./types";

const fetchOrigine = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = fetchOrigine;
  delete process.env.OPENAI_API_KEY;
});

function repondre(...reponses: Response[]) {
  process.env.OPENAI_API_KEY = "sk-test";
  globalThis.fetch = (async () => reponses.shift() ?? new Response("{}", { status: 500 })) as typeof fetch;
}

describe("classerErreurOpenAI", () => {
  const cas: [number, Record<string, string>, string][] = [
    [401, { code: "invalid_api_key" }, "cle"],
    [429, { code: "insufficient_quota" }, "limite"],
    [429, { code: "rate_limit_exceeded" }, "limite"],
    [400, { code: "billing_hard_limit_reached" }, "limite"],
    [400, { code: "moderation_blocked" }, "refus"],
    [400, { code: "content_policy_violation" }, "refus"],
    [400, { message: "Your request was rejected by the safety system." }, "refus"],
    [404, { code: "model_not_found" }, "modele"],
    [400, { param: "model", message: "Invalid model" }, "modele"],
    [400, { param: "size", message: "Invalid size" }, "parametre"],
    [500, {}, "indisponible"],
    [503, {}, "indisponible"],
  ];
  for (const [status, erreur, attendu] of cas) {
    it(`${status} ${JSON.stringify(erreur)} → ${attendu}`, () => assert.equal(classerErreurOpenAI(status, erreur), attendu));
  }
});

describe("message renvoyé à l'utilisateur", () => {
  it("limite → « Limite de génération atteinte »", () => {
    assert.equal(erreurGenerationPourApi(new MediaProviderError("limite", { fournisseur: "OpenAI" })).code, "media_limite_atteinte");
  });
  it("refus → « Le prompt a été refusé »", () => {
    assert.equal(erreurGenerationPourApi(new MediaProviderError("refus", { fournisseur: "OpenAI" })).code, "media_prompt_refuse");
  });
  it("clé, modèle, paramètre, panne, réponse, fournisseur absent → « Service indisponible »", () => {
    for (const type of ["cle", "modele", "parametre", "indisponible", "reponse"] as const) {
      assert.equal(erreurGenerationPourApi(new MediaProviderError(type, { fournisseur: "OpenAI" })).code, "media_service_indisponible");
    }
    assert.equal(erreurGenerationPourApi(new MediaProviderNotConfiguredError("OpenAI")).code, "media_service_indisponible");
    assert.equal(erreurGenerationPourApi(new Error("inattendu")).code, "media_service_indisponible");
  });
});

describe("generateImageOpenAI", () => {
  it("sans clé : fournisseur non configuré, aucun appel réseau", async () => {
    globalThis.fetch = (async () => assert.fail("aucun appel attendu")) as typeof fetch;
    await assert.rejects(generateImageOpenAI("test"), MediaProviderNotConfiguredError);
  });

  it("429 insufficient_quota : erreur « limite » avec le détail pour les logs", async () => {
    repondre(new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "You exceeded your current quota" } }), { status: 429 }));
    await assert.rejects(generateImageOpenAI("test"), (e: unknown) => e instanceof MediaProviderError && e.type === "limite" && e.message.includes("insufficient_quota"));
  });

  it("401 : le message d'OpenAI (qui peut citer la clé) n'est pas repris", async () => {
    repondre(new Response(JSON.stringify({ error: { message: "Incorrect API key provided: sk-abc***xyz" } }), { status: 401 }));
    await assert.rejects(generateImageOpenAI("test"), (e: unknown) => e instanceof MediaProviderError && e.type === "cle" && !e.message.includes("sk-abc"));
  });

  it("panne réseau : erreur « indisponible »", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    await assert.rejects(generateImageOpenAI("test"), (e: unknown) => e instanceof MediaProviderError && e.type === "indisponible");
  });

  it("image en base64 (gpt-image) acceptée", async () => {
    repondre(new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }], output_format: "png" }), { status: 200 }));
    assert.equal((await generateImageOpenAI("test")).base64, "aGVsbG8=");
  });

  it("image en URL acceptée aussi : téléchargée et convertie en base64", async () => {
    repondre(
      new Response(JSON.stringify({ data: [{ url: "https://exemple.test/image.png" }] }), { status: 200 }),
      new Response(Buffer.from("hello"), { status: 200 }),
    );
    assert.equal((await generateImageOpenAI("test")).base64, Buffer.from("hello").toString("base64"));
  });

  it("avec photo de référence : /images/edits en multipart, photo jointe", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const appels: { url: string; corps: unknown }[] = [];
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      appels.push({ url: String(url), corps: init?.body });
      if (String(url).startsWith("https://ae-pic")) return new Response(Buffer.from("jpeg"), { status: 200, headers: { "content-type": "image/jpeg" } });
      return new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }] }), { status: 200 });
    }) as typeof fetch;
    await generateImageOpenAI("test", { reference: "https://ae-pic-a1.aliexpress-media.com/a.jpg" });
    assert.equal(appels[1].url, "https://api.openai.com/v1/images/edits");
    const corps = appels[1].corps as FormData;
    assert.ok(corps instanceof FormData);
    assert.equal(corps.get("prompt"), "test");
    assert.equal((corps.get("image") as File).type, "image/jpeg");
  });

  it("photo de référence qui n'est pas une image : erreur « reponse », aucun appel à OpenAI", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    const appels: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      appels.push(String(url));
      return new Response("<html>", { status: 200, headers: { "content-type": "text/html" } });
    }) as typeof fetch;
    await assert.rejects(generateImageOpenAI("test", { reference: "https://ae-pic-a1.aliexpress-media.com/a.jpg" }), (e: unknown) => e instanceof MediaProviderError && e.type === "reponse");
    assert.equal(appels.length, 1);
  });

  it("réponse sans image : erreur « reponse »", async () => {
    repondre(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await assert.rejects(generateImageOpenAI("test"), (e: unknown) => e instanceof MediaProviderError && e.type === "reponse");
  });
});
