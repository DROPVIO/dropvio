import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getBaseUrl } from "@/lib/get-base-url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const baseUrl = await getBaseUrl();

  const boutiqueRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}`, { cache: "no-store" });
  if (!boutiqueRes.ok) {
    return { title: "À propos" };
  }
  const { boutique } = (await boutiqueRes.json()) as { boutique: { nom: string } };

  return { title: `À propos — ${boutique.nom} · Dropvio` };
}

export default async function AProposPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const baseUrl = await getBaseUrl();

  const boutiqueRes = await fetch(`${baseUrl}/api/boutiques/slug/${slug}`, { cache: "no-store" });
  if (!boutiqueRes.ok) {
    notFound();
  }
  const { boutique } = (await boutiqueRes.json()) as {
    boutique: { nom: string; description: string | null };
  };

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)]">
      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-8">
          <p className="text-sm uppercase tracking-[0.3em] text-violet-300">À propos</p>
          <h1 className="mt-4 text-3xl font-bold text-[var(--text-primary)]">{boutique.nom}</h1>
          {boutique.description?.trim() ? (
            <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-[var(--text-muted)]">
              {boutique.description}
            </p>
          ) : (
            <p className="mt-6 text-sm text-[var(--text-faint)]">
              Cette boutique n&apos;a pas encore renseigné de description.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
