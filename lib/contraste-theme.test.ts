import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// Contraste WCAG des couleurs de texte des thèmes (app/globals.css), calculé à partir du fichier :
// toute variable de texte doit atteindre 4,5:1 (AA, texte normal) sur chaque fond du thème,
// calques --surface-2 et --surface-3 compris (posés sur --bg et sur --surface).

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function bloc(selecteur: string): Record<string, string> {
  const debut = css.indexOf(`${selecteur} {`);
  assert.ok(debut >= 0, selecteur);
  const corps = css.slice(debut, css.indexOf("}", debut));
  return Object.fromEntries([...corps.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

type Rgb = [number, number, number];
function couleur(valeur: string, dessous?: Rgb): Rgb {
  const hex = valeur.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255) as Rgb;
  const rgba = valeur.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/);
  assert.ok(rgba && dessous, valeur);
  const a = Number(rgba[4]);
  return [1, 2, 3].map((i, k) => (Number(rgba[i]) / 255) * a + dessous[k] * (1 - a)) as Rgb;
}
const lum = (c: Rgb) => {
  const l = c.map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
};
const ratio = (a: Rgb, b: Rgb) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

const TEXTES = ["text-primary", "text-muted", "text-faint", "accent-text", "accent-secondary-text", "success-text", "warning-text", "danger-text"];

function fonds(v: Record<string, string>): Record<string, Rgb> {
  const bg = couleur(v.bg);
  const surface = couleur(v.surface);
  return {
    bg,
    "bg-sunken": couleur(v["bg-sunken"]),
    surface,
    "surface-2/bg": couleur(v["surface-2"], bg),
    "surface-3/bg": couleur(v["surface-3"], bg),
    "surface-2/surface": couleur(v["surface-2"], surface),
    "surface-3/surface": couleur(v["surface-3"], surface),
  };
}

for (const [theme, selecteur] of [
  ["sombre", ":root"],
  ["clair", ':root[data-theme="light"]'],
  ["boutique sombre", '[data-boutique-theme="dark"]'],
  ["boutique clair", '[data-boutique-theme="light"]'],
] as const) {
  describe(`contraste — thème ${theme}`, () => {
    const v = bloc(selecteur);
    const f = fonds(v);
    for (const texte of TEXTES) {
      it(`--${texte} : 4,5:1 au moins sur chaque fond`, () => {
        assert.ok(v[texte], `--${texte} absente`);
        for (const [nom, fond] of Object.entries(f)) {
          const r = ratio(couleur(v[texte]), fond);
          assert.ok(r >= 4.5, `--${texte} ${v[texte]} sur ${nom} : ${r.toFixed(2)}:1`);
        }
      });
    }
    it("boutons : texte blanc sur --accent et --danger à 4,5:1 au moins", () => {
      for (const fill of ["accent", "danger"]) {
        const r = ratio([1, 1, 1], couleur(v[fill]));
        assert.ok(r >= 4.5, `blanc sur --${fill} ${v[fill]} : ${r.toFixed(2)}:1`);
      }
    });
  });
}

describe("contraste — composants", () => {
  it("les textes colorés utilisent les variables de texte, pas les couleurs de fond", () => {
    // Les fichiers ont été convertis en bloc : il ne doit plus rester de text-[var(--accent)] etc.
    const restes = execSync(
      String.raw`grep -rlE "text-\[var\(--(accent|accent-secondary|success|warning|danger)\)\]" app components lib --include=*.tsx --include=*.ts --exclude=*.test.ts || true`,
      { cwd: new URL("..", import.meta.url).pathname, encoding: "utf8" }
    ).trim();
    assert.equal(restes, "");
  });

  it("UsageMeter suit le thème (plus de text-white codé en dur)", () => {
    const meter = readFileSync(new URL("../components/UsageMeter.tsx", import.meta.url), "utf8");
    assert.doesNotMatch(meter, /text-white|text-zinc-|text-emerald-/);
    assert.ok(meter.includes("text-[var(--text-primary)]"));
  });
});
