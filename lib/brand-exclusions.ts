// Liste de marques/licences à ne jamais faire apparaître dans un texte généré (titre ou
// description produit) — écrite deux fois en dur lors du sourcing Halloween/Valentin
// (scripts jetables, aujourd'hui supprimés), centralisée ici pour son premier usage
// permanent en code de prod (voir app/api/generer-texte-produit/route.ts).
export const EXCLUDED_BRAND_WORDS = [
  "disney", "marvel", "pokemon", "pokémon", "hello kitty", "kuromi", "my melody",
  "sanrio", "harry potter", "star wars", "nba", "nfl", "mickey", "minnie", "frozen",
  "spiderman", "spider-man", "batman", "superman", "minions", "despicable me", "hulk",
  "avengers", "barbie", "hot wheels", "lego", "nike", "adidas", "puma", "gucci",
  "chanel", "dior", "louis vuitton", "supreme", "pikachu", "naruto", "one piece",
  "stitch", "winnie the pooh", "elsa", "peppa pig", "paw patrol", "bluey", "hermes",
  "chrome hearts", "kaws", "sesame street",
  "chucky", "freddy krueger", "jason voorhees", "michael myers", "ghostface", "scream",
  "harley quinn", "wednesday addams", "squid game", "cruella", "maleficent", "beetlejuice",
  "pennywise", "coraline", "jack skellington", "nightmare before christmas",
  "voldemort", "minecraft", "among us", "fortnite", "five nights at freddy", "fnaf",
  "spongebob", "stranger things", "v for vendetta", "joker",
];

export function containsExcludedBrand(text: string): boolean {
  const t = ` ${text.toLowerCase()} `;
  return EXCLUDED_BRAND_WORDS.some((w) => t.includes(w));
}
