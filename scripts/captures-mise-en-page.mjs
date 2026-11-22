// Captures headless de la mise en page et contrôle du défilement horizontal.
//   node scripts/captures-mise-en-page.mjs docs/captures/avant
// Serveur de dev lancé sur http://localhost:3000. Pages protégées : sans compte de test, elles
// redirigent vers /login (l'URL finale est notée dans le rapport JSON).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const dossier = process.argv[2] ?? "docs/captures/avant";
const PAGES = ["/", "/dashboard", "/site-builder", "/produits-gagnants", "/formation", "/abonnement", "/quota", "/faq", "/expert", "/login"];
const LARGEURS = [375, 768, 1280, 1440];

fs.mkdirSync(dossier, { recursive: true });
const navigateur = await chromium.launch();
const resultats = [];
for (const largeur of LARGEURS) {
  const contexte = await navigateur.newContext({ viewport: { width: largeur, height: 900 }, locale: "fr-FR", reducedMotion: "reduce" });
  const page = await contexte.newPage();
  for (const chemin of PAGES) {
    await page.goto(BASE + chemin, { waitUntil: "networkidle", timeout: 60_000 }).catch(() => {});
    // Défilement complet : déclenche les animations d'apparition (sinon les sections restent masquées).
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(window.innerHeight * 0.6)) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
    const mesure = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      // Éléments qui dépassent à droite (hors éléments masqués ou fixes de 0 px).
      debordements: [...document.querySelectorAll("body *")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed";
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ").slice(0, 3).join(".")}`),
    }));
    const nom = `${chemin === "/" ? "accueil" : chemin.slice(1).replace(/\//g, "_")}-${largeur}.png`;
    await page.screenshot({ path: path.join(dossier, nom), fullPage: true });
    resultats.push({ chemin, largeur, urlFinale: new URL(page.url()).pathname, defilementHorizontal: mesure.scrollWidth > mesure.innerWidth, ...mesure });
  }
  await contexte.close();
}
await navigateur.close();
fs.writeFileSync(path.join(dossier, "mesures.json"), JSON.stringify(resultats, null, 2));
for (const r of resultats) {
  console.log(`${r.defilementHorizontal ? "DÉBORDE" : "ok     "} ${String(r.largeur).padStart(4)} ${r.chemin.padEnd(20)} → ${r.urlFinale.padEnd(12)} ${r.scrollWidth}/${r.innerWidth} ${r.debordements.join(" ")}`);
}
