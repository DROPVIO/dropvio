// Images générées avec le site : npm test.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOMBRE_IMAGES_PAR_SITE,
  coutImagesSite,
  etatCaseImages,
  genererSiteEtImages,
  promptsImagesSite,
  remplacerEmplacements,
  type ResultatImage,
} from "./images-site";

const EMPLACEMENT = '<div data-placeholder="image" style="min-height:280px">Ajoute ici une photo de ton produit</div>';

describe("case désactivée selon le plan", () => {
  it("sans abonnement : désactivée, raison « plan »", () => {
    assert.deepEqual(etatCaseImages(null, 50), { active: false, raison: "plan" });
  });
  it("plans payants (Pro, Agency, Expert) avec assez de quota : active", () => {
    for (const plan of ["pro", "agency", "expert"] as const) {
      assert.deepEqual(etatCaseImages(plan, 50), { active: true, images: NOMBRE_IMAGES_PAR_SITE, restantes: 50 }, plan);
    }
  });
  it("Expert, quota restant inférieur au nombre d'images : désactivée, avec le reste", () => {
    assert.deepEqual(etatCaseImages("expert", 2, 3), { active: false, raison: "quota", images: 3, restantes: 2 });
  });
  it("Expert, quota exactement suffisant : active", () => assert.equal(etatCaseImages("expert", 3, 3).active, true));
  it("quota pas encore lu : active (la route revérifie à chaque image)", () => assert.equal(etatCaseImages("expert", null).active, true));
});

describe("coût affiché", () => {
  it("une image du quota par image, et l'équivalent en euros au centime", () => {
    assert.deepEqual(coutImagesSite(0.1, 3), { images: 3, eur: 0.3 });
    assert.deepEqual(coutImagesSite(0.07, 3), { images: 3, eur: 0.21 });
  });
  it("valeur de départ : 3 images", () => assert.equal(NOMBRE_IMAGES_PAR_SITE, 3));
});

describe("prompts construits à partir du contenu du site", () => {
  const prompts = promptsImagesSite({ titre: "Lampe Aurora", description: "<p>Lampe <b>LED</b> à 16 couleurs</p>", brief: "Ambiance cosy, clientèle jeune" });
  it("un prompt par image, dans l'ordre hero, détail, mise en situation", () => {
    assert.deepEqual(prompts.map((p) => p.role), ["hero", "detail", "situation"]);
  });
  it("chaque prompt reprend titre, description sans HTML et brief", () => {
    for (const { prompt } of prompts) {
      assert.match(prompt, /"Lampe Aurora"/);
      assert.match(prompt, /Lampe LED à 16 couleurs/);
      assert.match(prompt, /Ambiance cosy/);
    }
  });
  it("mode boutique : le produit principal est le premier produit", () => {
    const [p] = promptsImagesSite({ titre: "Ma boutique", produits: ["", "Gourde isotherme", "Sac"] }, 1);
    assert.match(p.prompt, /Main product: Gourde isotherme\./);
  });
  it("nombre demandé respecté", () => assert.equal(promptsImagesSite({ titre: "x" }, 1).length, 1));
});

describe("remplacement des emplacements", () => {
  const html = `<section>${EMPLACEMENT}</section><section>${EMPLACEMENT}</section>`;
  it("les emplacements sont remplacés dans l'ordre", () => {
    const r = remplacerEmplacements(html, [{ url: "https://a/1.png", alt: "hero" }, { url: "https://a/2.png", alt: "détail" }, { url: "https://a/3.png", alt: "x" }]);
    assert.equal(r.remplaces, 2);
    assert.equal(r.emplacements, 2);
    assert.ok(r.html.indexOf("1.png") < r.html.indexOf("2.png"));
    assert.ok(!r.html.includes("data-placeholder"));
  });
  it("une image en échec laisse son emplacement vide", () => {
    const r = remplacerEmplacements(html, [null, { url: "https://a/2.png", alt: "détail" }]);
    assert.equal(r.remplaces, 1);
    assert.equal((r.html.match(/data-placeholder="image"/g) ?? []).length, 1);
    assert.ok(r.html.startsWith(`<section>${EMPLACEMENT}`));
  });
  it("l'emplacement d'une fiche produit (mode boutique) n'est jamais rempli", () => {
    const fiche = '<div class="grille-img-placeholder" data-placeholder="image">Photo à ajouter</div>';
    const r = remplacerEmplacements(`${fiche}${EMPLACEMENT}`, [{ url: "https://a/1.png", alt: "hero" }]);
    assert.ok(r.html.startsWith(fiche));
    assert.equal(r.remplaces, 1);
    assert.equal(r.emplacements, 1);
  });
  it("URL et texte alternatif échappés", () => {
    const r = remplacerEmplacements(EMPLACEMENT, [{ url: 'https://a/"x.png', alt: '<b>"' }]);
    assert.ok(!r.html.includes('"x.png') && r.html.includes("&quot;x.png"));
  });
});

describe("génération du site et des images", () => {
  const prompts = promptsImagesSite({ titre: "Lampe" });

  it("une image qui échoue ne fait pas échouer le site", async () => {
    let n = 0;
    const r = await genererSiteEtImages({
      genererSite: async () => "<html>",
      genererImage: async () => { if (++n === 2) throw new Error("media_limite_atteinte"); return { mediaId: `m${n}`, url: `u${n}` }; },
      prompts,
    });
    assert.deepEqual(r.site, { ok: true, valeur: "<html>" });
    assert.equal(r.images.filter((i) => "url" in i).length, 2);
    assert.deepEqual(r.images.find((i) => "erreur" in i), { role: "detail", erreur: "media_limite_atteinte" });
  });

  it("site et images lancés en parallèle", async () => {
    const debuts: string[] = [];
    let libererSite!: () => void;
    const site = new Promise<string>((resolve) => { libererSite = () => resolve("ok"); });
    const course = genererSiteEtImages({
      genererSite: () => { debuts.push("site"); return site; },
      genererImage: async () => { debuts.push("image"); return { mediaId: "m", url: "u" }; },
      prompts,
    });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(debuts, ["site", "image", "image", "image"]);
    libererSite();
    await course;
  });

  it("site en échec : les images restent, et un nouvel essai ne les regénère pas (quota décompté une fois)", async () => {
    let appelsImage = 0;
    const genererImage = async () => { appelsImage++; return { mediaId: `m${appelsImage}`, url: `u${appelsImage}` }; };
    const premier = await genererSiteEtImages({ genererSite: async () => { throw new Error("generation_truncated"); }, genererImage, prompts });
    assert.equal(premier.site.ok, false);
    assert.equal(appelsImage, 3);
    const second = await genererSiteEtImages({ genererSite: async () => "<html>", genererImage, prompts, dejaGenerees: premier.images });
    assert.equal(appelsImage, 3, "aucune nouvelle image générée");
    assert.deepEqual(second.images, premier.images);
  });

  it("nouvel essai : seule l'image en échec est regénérée", async () => {
    let appelsImage = 0;
    const deja: ResultatImage[] = [{ role: "hero", mediaId: "m1", url: "u1" }, { role: "detail", erreur: "x" }, { role: "situation", mediaId: "m3", url: "u3" }];
    const r = await genererSiteEtImages({ genererSite: async () => "ok", genererImage: async () => { appelsImage++; return { mediaId: "m2", url: "u2" }; }, prompts, dejaGenerees: deja });
    assert.equal(appelsImage, 1);
    assert.equal(r.images.every((i) => "url" in i), true);
  });
});
