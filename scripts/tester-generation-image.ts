// Teste la génération d'image de bout en bout, sans passer par l'interface :
//   npm run media:test
// Lit OPENAI_API_KEY dans .env.local. Appel réel au fournisseur : 1 image carrée en qualité
// basse, facturée par OpenAI. N'écrit rien en base ni dans le stockage, ne consomme pas de quota.
// (scripts/test-image-openai.ts compare, lui, les qualités medium et high.)
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import { testerGenerationImage } from "../lib/media";

testerGenerationImage("expert").then((resultat) => {
  console.log(JSON.stringify(resultat, null, 2));
  process.exit(resultat.ok ? 0 : 1);
});
