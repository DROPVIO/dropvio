export type Temoignage = {
  id: string;
  texte: string;
  auteur?: string | null;
  note?: number | null;
};

// Contenant visuel uniquement — aucune donnée réelle n'est branchée aujourd'hui (pas
// d'avis natifs côté Shopify, voir la vérification faite avant de construire ce
// composant : aucune app tierce type Judge.me/Loox/Yotpo n'est intégrée). Ne rend RIEN
// tant que `avis` est vide — jamais de titre ou de section orpheline, même logique que
// les bestsellers/le spotlight sur cette page : pas de contenu sans donnée réelle
// derrière, pas de faux avis.
export default function TestimonialsMarquee({ avis, titre }: { avis: Temoignage[]; titre: string }) {
  if (!avis || avis.length === 0) return null;

  // Liste dupliquée pour une boucle de défilement continue et sans à-coup (translateY de
  // 0 à -50% de la piste doublée revient exactement à la position de départ).
  const track = [...avis, ...avis];

  return (
    <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 lg:px-8">
      <p className="text-center text-sm uppercase tracking-[0.3em] text-violet-300">{titre}</p>
      <div className="boutique-testimonials-marquee mt-6">
        <div className="boutique-testimonials-track">
          {track.map((item, index) => (
            <div key={`${item.id}-${index}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
              {typeof item.note === "number" ? (
                <div className="text-sm text-violet-300">{"⭐".repeat(Math.max(1, Math.min(5, Math.round(item.note))))}</div>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{item.texte}</p>
              {item.auteur ? (
                <p className="mt-2 text-xs font-semibold text-[var(--text-primary)]">{item.auteur}</p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
