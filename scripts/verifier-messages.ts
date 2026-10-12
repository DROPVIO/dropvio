// Vérifie la parité des fichiers de traduction messages/{fr,en,es,it}.json :
// - mêmes clés partout (une clé présente dans une langue et absente d'une autre est signalée) ;
// - même type de valeur (texte, liste) pour une même clé ;
// - mêmes variables ({nom}, {count, plural, …}) et mêmes balises (<strong>, <email>…) ;
// - aucune valeur vide, sauf les exceptions documentées ci-dessous.
// Usage : npx tsx scripts/verifier-messages.ts (code de sortie 1 si un écart est trouvé).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const LANGUES = ["fr", "en", "es", "it"] as const;
const REFERENCE = "fr";

// Valeurs volontairement vides dans certaines langues : l'encart « Version française
// faisant foi » n'a pas lieu d'être sur la version française des pages légales.
const VIDES_AUTORISES = new Set(["fr:legal.commun.versionFaisantFoi"]);

type Valeur = string | unknown[];

function aplatir(objet: Record<string, unknown>, prefixe = "", sortie = new Map<string, Valeur>()) {
  for (const [cle, valeur] of Object.entries(objet)) {
    const chemin = prefixe ? `${prefixe}.${cle}` : cle;
    if (valeur !== null && typeof valeur === "object" && !Array.isArray(valeur)) {
      aplatir(valeur as Record<string, unknown>, chemin, sortie);
    } else {
      sortie.set(chemin, valeur as Valeur);
    }
  }
  return sortie;
}

// Noms des arguments ICU ({nom}, {count, plural, …}, y compris dans les branches) et des
// balises de texte riche (<strong>, <email>…).
function signature(texte: string): { variables: string[]; balises: string[] } {
  const variables = new Set([...texte.matchAll(/\{\s*(\w+)\s*[,}]/g)].map((m) => m[1]));
  const balises = new Set([...texte.matchAll(/<\/?([a-zA-Z][\w-]*)>/g)].map((m) => m[1]));
  return { variables: [...variables].sort(), balises: [...balises].sort() };
}

const fichiers = new Map(
  LANGUES.map((langue) => {
    const chemin = join(process.cwd(), "messages", `${langue}.json`);
    return [langue, aplatir(JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>)] as const;
  })
);

const erreurs: string[] = [];
const toutesLesCles = new Set<string>();
for (const valeurs of fichiers.values()) for (const cle of valeurs.keys()) toutesLesCles.add(cle);

for (const cle of [...toutesLesCles].sort()) {
  const reference = fichiers.get(REFERENCE)!.get(cle);
  for (const langue of LANGUES) {
    const valeur = fichiers.get(langue)!.get(cle);
    if (valeur === undefined) {
      erreurs.push(`[${langue}] clé absente : ${cle}`);
      continue;
    }
    if (typeof valeur === "string" && valeur.trim() === "" && !VIDES_AUTORISES.has(`${langue}:${cle}`)) {
      erreurs.push(`[${langue}] valeur vide : ${cle}`);
    }
    if (reference === undefined || langue === REFERENCE) continue;
    if (Array.isArray(valeur) !== Array.isArray(reference)) {
      erreurs.push(`[${langue}] type différent du français : ${cle}`);
      continue;
    }
    if (typeof valeur === "string" && typeof reference === "string" && reference.trim() !== "" && valeur.trim() !== "") {
      const a = signature(reference);
      const b = signature(valeur);
      if (a.variables.join() !== b.variables.join()) {
        erreurs.push(`[${langue}] variables différentes : ${cle} (fr: ${a.variables.join(", ") || "aucune"} / ${langue}: ${b.variables.join(", ") || "aucune"})`);
      }
      if (a.balises.join() !== b.balises.join()) {
        erreurs.push(`[${langue}] balises différentes : ${cle} (fr: ${a.balises.join(", ") || "aucune"} / ${langue}: ${b.balises.join(", ") || "aucune"})`);
      }
    }
  }
}

const total = fichiers.get(REFERENCE)!.size;
if (erreurs.length > 0) {
  console.error(`${erreurs.length} écart(s) dans messages/*.json :`);
  for (const e of erreurs) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`messages/*.json : ${total} clés, identiques dans ${LANGUES.join(", ")} (variables et balises comprises).`);
