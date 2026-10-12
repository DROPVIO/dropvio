import type { Metadata } from "next";
import {
  chargerBoutiquePublique,
  metadonneesBoutique,
  metadonneesIntrouvable,
  traductionsBoutique,
  urlAbsolueBoutique,
} from "@/lib/boutique-public";

// La page panier est un composant client : son titre (langue de la boutique) vient d'ici.
// Jamais indexée : son contenu dépend du navigateur du visiteur.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const donnees = await chargerBoutiquePublique(slug);
  if (!donnees) return metadonneesIntrouvable();
  const { boutique } = donnees;
  const t = await traductionsBoutique(boutique.langue);

  return metadonneesBoutique({
    boutique,
    titre: t("meta.panierTitre", { nom: boutique.nom }),
    description: t("meta.accueilDescription", { nom: boutique.nom }),
    canonical: `${await urlAbsolueBoutique(slug)}/panier`,
    indexable: false,
  });
}

export default function PanierLayout({ children }: { children: React.ReactNode }) {
  return children;
}
