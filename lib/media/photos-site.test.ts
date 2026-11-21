// Photos du site (source et nombre) : npm test.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NOMBRE_PHOTOS_SITE_MAX,
  SOURCE_PHOTOS_DEFAUT,
  bornerNombrePhotos,
  photosFournies,
  sourceAvecNombre,
  utiliserPhotoProduit,
} from "./photos-site";

describe("photos du site", () => {
  it("ne génère rien par défaut : la source par défaut est la photo du produit", () => {
    assert.equal(SOURCE_PHOTOS_DEFAUT, "produit");
    assert.equal(utiliserPhotoProduit(SOURCE_PHOTOS_DEFAUT), true);
    assert.equal(sourceAvecNombre(SOURCE_PHOTOS_DEFAUT), false);
  });

  it("borne le nombre entre 1 et le nombre d'emplacements du site", () => {
    assert.equal(NOMBRE_PHOTOS_SITE_MAX, 3);
    assert.equal(bornerNombrePhotos(0), 1);
    assert.equal(bornerNombrePhotos(2), 2);
    assert.equal(bornerNombrePhotos(10), 3);
    assert.equal(bornerNombrePhotos(Number.NaN), 1);
  });

  it("ne garde que des liens valides, sans doublon, dans la limite choisie", () => {
    const liens = ["https://a.test/1.jpg", "pas-une-url", "https://a.test/1.jpg", "https://a.test/2.jpg", "https://a.test/3.jpg"];
    assert.deepEqual(photosFournies("liens", 2, [], liens), ["https://a.test/1.jpg", "https://a.test/2.jpg"]);
    assert.deepEqual(photosFournies("mediatheque", 3, ["https://m.test/x.png"], liens), ["https://m.test/x.png"]);
  });

  it("ne fournit aucune photo pour les sources produit, IA et aucune", () => {
    for (const source of ["produit", "ia", "aucune"] as const) {
      assert.deepEqual(photosFournies(source, 3, ["https://m.test/x.png"], ["https://a.test/1.jpg"]), []);
    }
  });

  it("n'envoie la photo du produit qu'avec la source produit", () => {
    assert.equal(utiliserPhotoProduit("mediatheque"), false);
    assert.equal(utiliserPhotoProduit("ia"), false);
  });
});
