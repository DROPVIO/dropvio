// Liste centralisée des niches du catalogue produits — source unique pour le sélecteur de
// app/produits-gagnants/page.tsx, les mots-clés de scripts/seed-produits.ts, et le champ
// boutiques.settings.niche (voir app/site-builder/boutique/[id]/page.tsx). Avant ce fichier,
// cette liste était dupliquée en dur dans produits-gagnants/page.tsx (id/label/emoji) sans
// lien avec les clés de NICHE_KEYWORDS du script de seed — même valeurs, deux sources
// distinctes qui pouvaient diverger silencieusement.
export type Niche = { id: string; label: string; emoji: string; desc: string };

export const NICHES: Niche[] = [
  { id: "halloween", label: "Halloween",     emoji: "🎃", desc: "Déguisements, déco & accessoires" },
  { id: "fitness",  label: "Fitness",        emoji: "💪", desc: "Sport & musculation" },
  { id: "beaute",   label: "Beauté",         emoji: "💄", desc: "Soins & maquillage" },
  { id: "animaux",  label: "Animaux",        emoji: "🐾", desc: "Accessoires pets" },
  { id: "gaming",   label: "Gaming",         emoji: "🎮", desc: "Jeux & accessoires" },
  { id: "bureau",   label: "Home Office",    emoji: "🖥️", desc: "Bureau & setup" },
  { id: "cuisine",  label: "Cuisine",        emoji: "🍳", desc: "Ustensiles & gadgets" },
  { id: "bebe",     label: "Bébé",           emoji: "👶", desc: "Puériculture" },
  { id: "voiture",  label: "Voiture",        emoji: "🚗", desc: "Auto & moto" },
  { id: "jardin",   label: "Jardinage",      emoji: "🌱", desc: "Plantes & outils" },
  { id: "yoga",     label: "Bien-être",      emoji: "🧘", desc: "Yoga & méditation" },
  { id: "tech",     label: "Tech",           emoji: "📱", desc: "Gadgets & électronique" },
  { id: "led",      label: "LED & Déco",     emoji: "💡", desc: "Lumières & ambiance" },
  { id: "outdoor",  label: "Outdoor",        emoji: "🏕️", desc: "Camping & randonnée" },
  { id: "mode",     label: "Mode",           emoji: "👗", desc: "Accessoires & bijoux" },
  { id: "maison",   label: "Maison",         emoji: "🏠", desc: "Déco intérieure" },
  { id: "voyage",   label: "Voyage",         emoji: "✈️", desc: "Bagages & accessoires" },
  { id: "sport",    label: "Sport",          emoji: "⚽", desc: "Équipements sportifs" },
  { id: "ecologie", label: "Écologie",       emoji: "♻️", desc: "Produits durables" },
  { id: "photo",    label: "Photo",          emoji: "📸", desc: "Accessoires photo/vidéo" },
  { id: "selfcare", label: "Self-care",      emoji: "🛁", desc: "Bien-être personnel" },
];

export const NICHE_IDS = new Set(NICHES.map((n) => n.id));

export function nicheLabel(id: string | null | undefined): string | null {
  if (!id) return null;
  return NICHES.find((n) => n.id === id)?.label ?? id;
}
