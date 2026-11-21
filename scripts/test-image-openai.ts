import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import fs from "fs";
import path from "path";
import { generateImage, type ImageQuality } from "../lib/media";
import { OPENAI_IMAGE_MODEL, OPENAI_IMAGE_URL, buildOpenAIImageRequest } from "../lib/media/openai";

// Test isolé de la génération d'images OpenAI, sans passer par les routes de production. Chaque
// lancement est facturé par OpenAI.
//
//   npx tsx scripts/test-image-openai.ts            génère les 2 images
//   npx tsx scripts/test-image-openai.ts --apercu   affiche la requête, sans appel à l'API

const DOSSIER_SORTIE = path.join(".tests-modeles", "images");
const QUALITES: ImageQuality[] = ["medium", "high"];
const PROMPT =
  "Photo de produit e-commerce : une ceinture chauffante lombaire noire, posée sur un fond clair uni, lumière de studio douce, cadrage centré, sans texte ni logo.";

async function main() {
  if (process.argv.includes("--apercu")) {
    for (const quality of QUALITES) {
      console.log(`POST ${OPENAI_IMAGE_URL}`);
      console.log("Authorization: Bearer [masqué]");
      console.log(JSON.stringify(buildOpenAIImageRequest(PROMPT, { quality }), null, 2));
    }
    return;
  }

  fs.mkdirSync(DOSSIER_SORTIE, { recursive: true });
  const resultats = [];

  for (const quality of QUALITES) {
    console.log(`Génération en qualité ${quality}…`);
    const debut = Date.now();
    try {
      const image = await generateImage("expert", PROMPT, { quality });
      const fichier = path.join(DOSSIER_SORTIE, `${OPENAI_IMAGE_MODEL}-${quality}.png`);
      fs.writeFileSync(fichier, Buffer.from(image.base64, "base64"));
      resultats.push({
        Qualité: quality,
        "Durée (s)": Math.round((Date.now() - debut) / 1000),
        "Coût estimé ($)": image.coutUsd === null ? "non renvoyé" : image.coutUsd.toFixed(3),
        Fichier: fichier,
      });
    } catch (error) {
      console.error(`Échec en qualité ${quality} : ${error instanceof Error ? error.message : "erreur inconnue"}`);
    }
  }

  console.table(resultats);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Erreur inconnue");
  process.exit(1);
});
