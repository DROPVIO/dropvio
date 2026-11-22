import test from "node:test";
import assert from "node:assert/strict";
import { erreurServeur } from "./api-errors";

test("erreurServeur ne renvoie ni message SQL, ni pile, ni chemin de fichier", async () => {
  const erreur = new Error('duplicate key value violates unique constraint "profils_pkey" at /Users/dev/app/lib/x.ts:12');
  const console0 = console.error;
  console.error = () => {};
  const reponse = erreurServeur("api/test", erreur);
  console.error = console0;
  assert.equal(reponse.status, 500);
  const corps = await reponse.json();
  const texte = JSON.stringify(corps);
  assert.doesNotMatch(texte, /duplicate key|constraint|profils_pkey/);
  assert.doesNotMatch(texte, /\/Users\/|\.ts:\d+|at /);
  assert.equal(corps.code, "server_error");
  assert.equal(corps.error, "Une erreur est survenue. Réessayez dans un instant.");
  assert.match(corps.values.reference, /^[0-9a-f-]{36}$/);
});

test("erreurServeur écrit le détail dans les logs avec la même référence", () => {
  const lignes: string[] = [];
  const console0 = console.error;
  console.error = (...args: unknown[]) => { lignes.push(args.map(String).join(" ")); };
  erreurServeur("api/test", new Error("détail technique"));
  console.error = console0;
  assert.equal(lignes.length, 1);
  assert.match(lignes[0], /\[api\/test\] Erreur [0-9a-f-]{36} : détail technique/);
});
