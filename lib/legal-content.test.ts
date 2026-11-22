import test from "node:test";
import assert from "node:assert/strict";
import { PAGES_LEGALES, lireDocumentLegal, markdownVersHtml } from "./legal-content";

test("chaque page juridique a son fichier Markdown, rendu avec un titre", async () => {
  for (const page of PAGES_LEGALES) {
    assert.match(await lireDocumentLegal(page), /<h1>.+<\/h1>/);
  }
});

test("mentions légales et CGV : titres seuls, à compléter", async () => {
  for (const page of ["mentions-legales", "cgv"] as const) {
    assert.match(await lireDocumentLegal(page), /\[À COMPLÉTER PAR LENNY\]/);
  }
});

test("le HTML brut du Markdown est retiré", () => {
  assert.doesNotMatch(markdownVersHtml("Texte <script>alert(1)</script>"), /<script/);
});
