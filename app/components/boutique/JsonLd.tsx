// Données structurées schema.org (JSON-LD) d'une page publique de boutique. `<` est échappé
// pour qu'un texte saisi par le vendeur (nom, description) ne puisse pas fermer la balise
// script (recommandation du guide JSON-LD de Next.js).
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
