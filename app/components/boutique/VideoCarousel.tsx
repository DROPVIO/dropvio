import { resolveVideoEmbed } from "@/lib/video-embed";

// Carrousel vidéo, saisi par le marchand dans les Paramètres (settings.bandeauVideos) —
// indépendant du texte défilant (voir SecondaryBanner.tsx, settings.bandeauTexte). Ne rend
// rien tant qu'aucune vidéo n'a été renseignée — pas de section vide.
export default function VideoCarousel({ videos }: { videos: string[] | null | undefined }) {
  const cleaned = (videos ?? []).map((v) => v.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1">
        {cleaned.map((url, index) => {
          const embed = resolveVideoEmbed(url);
          return (
            <div
              key={`${url}-${index}`}
              className="aspect-video w-64 shrink-0 snap-start overflow-hidden rounded-2xl bg-[var(--surface-2)] transition-transform duration-300 hover:scale-105"
            >
              {embed.type === "direct" ? (
                <video src={embed.url} controls className="h-full w-full object-cover" />
              ) : (
                <iframe
                  src={embed.embedUrl}
                  title={`Vidéo ${index + 1}`}
                  className="h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
