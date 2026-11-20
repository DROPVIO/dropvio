// Audit IA d'une page rendue (par défaut la landing du serveur local), avec exactement la même
// logique que /api/audit-site : même prompt, même modèle, même compactage, même lecture du JSON.
//   npx tsx scripts/auditer-landing.ts [url] [fichier-resultat.json]
// Appel réel à Claude (facturé, quelques dizaines de centimes) ; n'écrit rien en base.
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });

import fs from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { AUDIT_MODELE, compacterHtml } from "../lib/audit-config";
import { NOMS_LANGUE, PROMPT, SORTIE_MAX, SYSTEM, extractJson, isAuditResult } from "../lib/audit-site-prompt";

type Categorie = { id: string; nom: string; score: number; max: number; points_faibles?: string[]; corrections_specifiques?: string[] };

async function main() {
  const url = process.argv[2] ?? "http://localhost:3000/";
  const sortie = process.argv[3];

  const page = await fetch(url, { headers: { "Accept-Language": "fr" } });
  if (!page.ok) throw new Error(`Page inaccessible (${page.status})`);
  const html = await page.text();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await client.messages
    .stream({
      model: AUDIT_MODELE,
      max_tokens: SORTIE_MAX,
      system: `${SYSTEM}\n\nLANGUE : rédige tous les textes du JSON (score_designer, resume_executif, nom de chaque critère, points_forts, points_faibles, corrections_specifiques) en ${NOMS_LANGUE.fr}. Les clés et les id restent tels quels.\n\nLes données base64 intégrées ont été remplacées par __DV_DONNEES_n__ : l'image ou la police est bien présente dans la page.`,
      messages: [{ role: "user", content: PROMPT + compacterHtml(html).html }],
    })
    .finalMessage();

  const texte = message.content.find((b) => b.type === "text");
  if (!texte || texte.type !== "text") throw new Error(`Réponse vide (stop_reason ${message.stop_reason})`);
  const resultat: unknown = JSON.parse(extractJson(texte.text));
  if (!isAuditResult(resultat)) throw new Error("Réponse d'audit invalide");

  const r = resultat as { score_global: number; resume_executif?: string; categories: Categorie[] };
  console.log(`URL : ${url} — ${html.length} caractères — tokens ${message.usage.input_tokens}/${message.usage.output_tokens}`);
  console.log(`SCORE GLOBAL : ${r.score_global}/100`);
  if (r.resume_executif) console.log(`Résumé : ${r.resume_executif}`);
  for (const c of r.categories) {
    console.log(`\n■ ${c.nom} : ${c.score}/${c.max}`);
    for (const p of c.points_faibles ?? []) console.log(`   – ${p}`);
    for (const p of c.corrections_specifiques ?? []) console.log(`   → ${p}`);
  }
  if (sortie) fs.writeFileSync(sortie, JSON.stringify(resultat, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
