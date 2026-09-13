// Couleurs alignées sur PagedReader.tsx (palette isolée #2a2a2e/#3a3a3e, non connectée aux
// tokens --bg/--accent du reste de l'app) pour éviter un flash visuel entre ce fallback et
// le rendu réel de la page.
export default function Loading() {
  return (
    <div className="min-h-screen bg-[#3a3a3e] flex items-center justify-center">
      <div className="w-6 h-6 rounded-full border-2 border-white/70 border-t-transparent animate-spin" />
    </div>
  );
}
