import { resolveVideoEmbed } from "@/lib/video-embed";

export type Bandeau = {
  texte?: string | null;
  videos?: string[];
};

// Bandeau secondaire, saisi par le marchand dans les Paramètres (settings.bandeau) — pas
// de synchronisation Shopify, même limite technique que les avis clients (aucune donnée
// générique de ce type récupérable via l'API Admin déjà connectée). Ne rend rien tant
// qu'aucun texte ni aucune vidéo n'a été renseigné — pas de section vide.
export default function SecondaryBanner({ bandeau }: { bandeau: Bandeau | null | undefined }) {
  const texte = bandeau?.texte?.trim();
  const videos = (bandeau?.videos ?? []).map((v) => v.trim()).filter(Boolean);

  if (!texte && videos.length === 0) return null;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {texte ? <p className="text-center text-sm leading-6 text-[var(--text-muted)]">{texte}</p> : null}
        {videos.length > 0 ? (
          <div className={`flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 ${texte ? "mt-4" : ""}`}>
            {videos.map((url, index) => {
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
        ) : null}
      </div>
    </div>
  );
}
