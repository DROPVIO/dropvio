import test from "node:test";
import assert from "node:assert/strict";
import { envoyerEmail, type ClientEmail } from "./email";

const message = { a: "client@exemple.fr", sujet: "Sujet", html: "<p>x</p>", texte: "x" };

function client(reponse: () => Promise<{ error: { message: string } | null }>) {
  const appels: unknown[] = [];
  const c: ClientEmail = { emails: { send: async (p) => { appels.push(p); return reponse(); } } };
  return { c, appels };
}

test("sans clé ou sans expéditeur : rien n'est envoyé, aucune erreur", async (t) => {
  t.mock.method(console, "warn", () => {});
  const { c, appels } = client(async () => ({ error: null }));
  assert.deepEqual(await envoyerEmail(message, { env: { EMAIL_EXPEDITEUR: "Dropvio <a@b.fr>" }, client: c }), { envoye: false });
  assert.deepEqual(await envoyerEmail(message, { env: { RESEND_API_KEY: "k" }, client: c }), { envoye: false });
  assert.equal(appels.length, 0);
});

test("envoi réussi : expéditeur, destinataire, sujet, HTML et texte transmis", async () => {
  const { c, appels } = client(async () => ({ error: null }));
  assert.deepEqual(await envoyerEmail(message, { env: { RESEND_API_KEY: "k", EMAIL_EXPEDITEUR: "Dropvio <a@b.fr>" }, client: c }), { envoye: true });
  assert.deepEqual(appels[0], { from: "Dropvio <a@b.fr>", to: "client@exemple.fr", subject: "Sujet", html: "<p>x</p>", text: "x" });
});

test("échec de Resend (erreur renvoyée ou exception) : envoye false, jamais d'exception", async (t) => {
  t.mock.method(console, "error", () => {});
  const env = { RESEND_API_KEY: "k", EMAIL_EXPEDITEUR: "Dropvio <a@b.fr>" };
  assert.deepEqual(await envoyerEmail(message, { env, client: client(async () => ({ error: { message: "refusé" } })).c }), { envoye: false });
  assert.deepEqual(await envoyerEmail(message, { env, client: client(async () => { throw new Error("réseau"); }).c }), { envoye: false });
});
