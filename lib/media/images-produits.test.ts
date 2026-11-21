// Images produits (Studio IA, page boutique) : npm test.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eligibiliteProduit, photoAutorisee, promptImageProduit } from "./images-produits";

const PHOTO = "https://ae-pic-a1.aliexpress-media.com/kf/S123.jpg";
const produit = (nom: string | null, image_urls: unknown = [PHOTO]) => ({ id: "p", nom, description: "Mug en céramique", image_urls });

describe("produit sans photo ou sans nom", () => {
  it("sans nom (null, vide ou espaces) : refusé, raison sans_nom", () => {
    for (const nom of [null, "", "   "]) assert.deepEqual(eligibiliteProduit(produit(nom)), { ok: false, raison: "sans_nom" });
  });
  it("sans photo : refusé, raison sans_photo", () => {
    for (const urls of [[], null, "pas un tableau", [""]]) assert.deepEqual(eligibiliteProduit(produit("Mug", urls)), { ok: false, raison: "sans_photo" });
  });
  it("photo sur un hôte non autorisé ou en http : refusée", () => {
    assert.equal(eligibiliteProduit(produit("Mug", ["https://exemple.test/a.jpg"])).ok, false);
    assert.equal(eligibiliteProduit(produit("Mug", ["http://ae-pic-a1.aliexpress-media.com/a.jpg"])).ok, false);
    assert.equal(photoAutorisee("https://aliexpress-media.com.attaquant.test/a.jpg"), false);
  });
  it("nom et photo : accepté, première photo autorisée retenue", () => {
    assert.deepEqual(eligibiliteProduit(produit("Mug", ["https://exemple.test/a.jpg", PHOTO])), { ok: true, photo: PHOTO });
  });
});

describe("prompt", () => {
  it("reprend le nom et la description sans HTML", () => {
    const prompt = promptImageProduit(" Mug ", "<p>Mug <b>blanc</b></p>");
    assert.match(prompt, /"Mug"/);
    assert.match(prompt, /Product description: Mug blanc/);
  });
});
