// Contrôles de la landing rendue (serveur de dev lancé) : liens internes, ancres, alt, h1, prix.
//   node scripts/verifier-landing.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const navigateur = await chromium.launch();
const page = await navigateur.newPage({ locale: "fr-FR", reducedMotion: "reduce" });
await page.goto(BASE + "/", { waitUntil: "networkidle" });

const infos = await page.evaluate(() => {
  const visibles = (el) => el.getClientRects().length > 0;
  const liens = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
  const prix = [...document.querySelectorAll("#tarifs *")]
    .filter((el) => el.children.length === 0 && /^\d+(?:[,.]\d+)?\s?€$|^€\d+/.test(el.textContent.trim()))
    .map((el) => el.textContent.trim().replace(/\s/g, " "));
  return {
    liens,
    h1: [...document.querySelectorAll("h1")].filter(visibles).length,
    imagesSansAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
    images: document.querySelectorAll("img").length,
    ids: [...document.querySelectorAll("[id]")].map((e) => e.id),
    prixTarifs: prix,
  };
});

const internes = [...new Set(infos.liens.filter((h) => h.startsWith("/") || h.startsWith("#")))];
const morts = [];
for (const href of internes) {
  if (href.startsWith("#")) {
    if (href.length > 1 && !infos.ids.includes(href.slice(1))) morts.push(`${href} (ancre absente)`);
    continue;
  }
  const chemin = href.split("#")[0];
  const reponse = await fetch(BASE + chemin, { redirect: "manual" });
  // 3xx vers /login ou /abonnement : lien vers une page protégée, valide.
  if (reponse.status >= 400) morts.push(`${href} (HTTP ${reponse.status})`);
}
await navigateur.close();

console.log(`Liens internes testés : ${internes.length} → morts : ${morts.length ? morts.join(", ") : "aucun"}`);
console.log(`h1 visibles : ${infos.h1}`);
console.log(`Images : ${infos.images}, sans alt : ${infos.imagesSansAlt}`);
console.log(`Prix de la section tarifs : ${infos.prixTarifs.join(" | ")}`);
const doublons = infos.prixTarifs.filter((p, i, t) => t.indexOf(p) !== i);
console.log(`Prix affichés deux fois dans la section tarifs : ${doublons.length ? doublons.join(", ") : "aucun"}`);
