import { permanentRedirect } from "next/navigation";

// Ancienne page de démonstration (catalogue fictif, jamais liée depuis l'app) : l'URL renvoie
// vers le vrai finder de produits.
export default function ProductsPage() {
  permanentRedirect("/produits-gagnants");
}
