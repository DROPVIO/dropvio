import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");

describe("barre latérale — lueur de survol et de focus", () => {
  it("même lueur au survol et au focus clavier, sans changement de taille", () => {
    assert.match(css, /\.dv-nav-entree:hover,\s*\.dv-nav-entree:focus-visible\s*\{\s*box-shadow: 0 0 8px 0 var\(--nav-lueur\);\s*\}/);
    const regle = css.slice(css.indexOf(".dv-nav-entree:hover"), css.indexOf("}", css.indexOf(".dv-nav-entree:hover")));
    assert.doesNotMatch(regle, /transform|scale|width|height|margin|padding|color:/);
  });

  it("transition de 150 à 200 ms sur la lueur et le fond, coupée si « réduire les animations »", () => {
    assert.match(css, /\.dv-nav-entree \{\s*transition-property: color, background-color, border-color, box-shadow;\s*transition-duration: 180ms;/);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.dv-nav-entree \{ transition: none; \}/);
  });

  it("couleur d'accent, une valeur par thème", () => {
    assert.ok(css.includes("--nav-lueur: rgba(124, 58, 237, 0.45);"));
    assert.ok(css.includes("--nav-lueur: rgba(124, 58, 237, 0.28);"));
  });

  it("posée sur chaque entrée cliquable de la barre", () => {
    assert.equal(sidebar.match(/dv-nav-entree/g)?.length, 7);
  });
});
