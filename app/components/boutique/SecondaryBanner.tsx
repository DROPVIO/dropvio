// Bandeau texte défilant, saisi par le marchand dans les Paramètres (settings.bandeauTexte)
// — indépendant des vidéos (voir VideoCarousel.tsx, settings.bandeauVideos), les deux
// n'ont plus besoin d'exister ensemble. Ne rend rien tant qu'aucun texte n'a été
// renseigné — pas de bande vide.
const REPEAT_COUNT = 8;

export default function SecondaryBanner({ texte }: { texte: string | null | undefined }) {
  const trimmed = texte?.trim();
  if (!trimmed) return null;

  // Répété plusieurs fois pour remplir la largeur en continu (pas un unique passage avec
  // un grand vide), puis dupliqué une fois de plus pour la boucle : translateX(-50%) sur
  // une piste faite de deux moitiés identiques revient exactement à la position de départ,
  // donc la boucle ne saute jamais.
  const singleSet = Array.from({ length: REPEAT_COUNT }, () => trimmed);
  const items = [...singleSet, ...singleSet];

  return (
    <div className="boutique-announcement-marquee border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="boutique-announcement-track py-3">
        {items.map((t, i) => (
          <span key={i} className="shrink-0 whitespace-nowrap px-6 text-sm text-[var(--text-muted)]">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}
