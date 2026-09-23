"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import Sidebar from "@/components/Sidebar";
import OnboardingProvider from "@/components/onboarding/OnboardingProvider";
import OnboardingTour from "@/components/onboarding/OnboardingTour";

type FormationCollection = "courte" | "longue";
type FormationOffre = FormationCollection | "bundle";

type FormationModule = {
  id: string;
  titre: string;
  description: string;
  collection: FormationCollection;
  contenuHtml: string;
};

type Owned = { courte: boolean; longue: boolean };

type FormationState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok"; modules: FormationModule[]; owned: Owned };

const FORMATION_PRIX: Record<FormationOffre, number> = {
  courte: 24.99,
  longue: 59.99,
  bundle: 69.99,
};

function formatPrix(prix: number): string {
  return `${prix.toFixed(2).replace(".", ",")}€`;
}

// prose-invert (Tailwind Typography) fige un rendu clair-sur-sombre pour le HTML des
// leçons dépliées inline — sans ce hook, le contenu resterait illisible (texte clair sur
// carte --surface blanche) une fois le thème clair actif.
function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const read = () => setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return isLight;
}

export default function FormationPage() {
  const t = useTranslations("dashboard.formation");
  const tCommon = useTranslations("dashboard.common");
  const [state, setState] = useState<FormationState>({ status: "loading" });
  const [buying, setBuying] = useState<FormationOffre | null>(null);
  const [banner, setBanner] = useState<"success" | "canceled" | null>(null);

  // /formation est publique (page de vente accessible sans compte), mais un utilisateur
  // connecté doit retrouver la sidebar/structure habituelle de l'app — contrairement aux
  // autres pages protégées, ce choix ne peut pas se faire uniquement sur le pathname
  // (AppShell) puisque la même route sert les deux publics. authChecked distingue "pas
  // encore su" de "confirmé déconnecté", pour ne jamais flasher la mauvaise mise en page.
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const isLight = useIsLightTheme();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser()
      .then(({ data }) => {
        setIsLoggedIn(!!data.user);
      })
      .catch(() => {
        // Un échec réseau/SDK sur cette vérification ne doit jamais laisser la page
        // bloquée indéfiniment sur le placeholder noir ci-dessous (voir authChecked) —
        // on retombe sur la version déconnectée plutôt que de ne jamais l'afficher.
        setIsLoggedIn(false);
      })
      .finally(() => {
        setAuthChecked(true);
      });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setIsLoggedIn(!!session?.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  const load = () => {
    fetch("/api/formation")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setState({ status: "error", message: json.error ?? t("errorLoad") });
          return;
        }
        setState({ status: "ok", modules: json.modules, owned: json.owned });
      })
      .catch(() => setState({ status: "error", message: t("errorServer") }));
  };

  // `load` n'est volontairement pas dans les deps (ni mémoïsé) : un seul chargement au
  // montage. Il capture `t`, stable pour une locale donnée — un changement de langue
  // recharge de toute façon l'arbre (router.refresh dans les Paramètres).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  // Retour de Stripe Checkout. Le webhook (asynchrone) peut prendre une poignée de
  // secondes à débloquer l'accès : on affiche le message tout de suite puis on relance un
  // fetch après un court délai pour donner une chance au webhook d'être passé.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const success = params.has("success");
    const canceled = params.has("canceled");
    if (!success && !canceled) return;

    params.delete("success");
    params.delete("canceled");
    const query = params.toString();
    window.history.replaceState(null, "", query ? `/formation?${query}` : "/formation");

    setBanner(success ? "success" : "canceled");
    if (success) setTimeout(load, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acheter = async (offre: FormationOffre) => {
    setBuying(offre);
    try {
      const res = await fetch("/api/formation/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offre }),
      });
      if (res.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent("/formation")}`;
        return;
      }
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? t("errorCheckout"));
        setBuying(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      alert(t("errorServer"));
      setBuying(null);
    }
  };

  const owned = state.status === "ok" ? state.owned : { courte: false, longue: false };
  const hasBoth = owned.courte && owned.longue;

  // Titre/accroche/public/bullets par collection, résolus depuis les traductions.
  const offreInfo = (collection: FormationCollection) => ({
    titre: t(`${collection}Titre`),
    accroche: t(`${collection}Accroche`),
    public: t(`${collection}Public`),
    bullets: t.raw(`${collection}Bullets`) as string[],
  });

  const content = (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-sans px-4 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[var(--accent)] text-xs font-medium tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            {t("badge")}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto mt-3">{t("subtitle")}</p>
        </div>

        {banner === "success" && (
          <div className="mb-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[var(--success)] text-sm text-center px-4 py-3">
            {t("bannerSuccess")}
          </div>
        )}
        {banner === "canceled" && (
          <div className="mb-8 rounded-xl bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-muted)] text-sm text-center px-4 py-3">
            {t("bannerCanceled")}
          </div>
        )}

        {state.status === "loading" && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-10 text-center text-[var(--text-faint)] text-sm">
            {tCommon("loading")}
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-10 text-center text-[var(--text-muted)] text-sm">
            {state.message}
          </div>
        )}

        {state.status === "ok" && (
          <div className="flex flex-col gap-10">
            {/* ── Cartes de vente pour les collections non possédées ──────────── */}
            {(["courte", "longue"] as const).some((c) => !owned[c]) && (
              <div className="flex flex-col gap-5">
                {(["courte", "longue"] as const)
                  .filter((c) => !owned[c])
                  .map((collection) => {
                    const info = offreInfo(collection);
                    return (
                      <div key={collection} className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <h2 className="text-lg font-bold text-[var(--text-primary)]">{info.titre}</h2>
                            <p className="text-[var(--text-muted)] text-sm mt-1">{info.accroche}</p>
                          </div>
                          <div className="text-2xl font-extrabold text-[var(--text-primary)] shrink-0">
                            {formatPrix(FORMATION_PRIX[collection])}
                          </div>
                        </div>
                        <p className="text-[var(--text-faint)] text-xs mt-4 italic">{info.public}</p>
                        <ul className="mt-4 flex flex-col gap-1.5">
                          {info.bullets.map((b) => (
                            <li key={b} className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                              <span className="text-[var(--accent)] shrink-0 mt-0.5">✓</span>
                              {b}
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => acheter(collection)}
                          disabled={buying !== null}
                          className="mt-5 w-full rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 disabled:opacity-50 text-white font-semibold text-sm py-2.5 transition-all"
                        >
                          {buying === collection
                            ? t("redirecting")
                            : t("buy", { prix: formatPrix(FORMATION_PRIX[collection]) })}
                        </button>
                      </div>
                    );
                  })}

                {/* Bundle, mis en avant tant que les deux ne sont pas déjà possédées */}
                {!hasBoth && (
                  <div className="rounded-2xl bg-gradient-to-br from-violet-950/60 to-[var(--surface)] border border-violet-500/30 p-6 relative overflow-hidden">
                    <span className="absolute top-0 right-0 text-[10px] font-bold bg-violet-500 text-white px-3 py-1 rounded-bl-lg">
                      {t("bundleBadge")}
                    </span>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">{t("bundleTitle")}</h2>
                    <p className="text-[var(--text-muted)] text-sm mt-1">{t("bundleDesc")}</p>
                    <div className="flex items-center gap-2 mt-4">
                      <span className="text-2xl font-extrabold text-[var(--text-primary)]">{formatPrix(FORMATION_PRIX.bundle)}</span>
                      <span className="text-sm text-[var(--text-faint)] line-through">
                        {formatPrix(FORMATION_PRIX.courte + FORMATION_PRIX.longue)}
                      </span>
                      <span className="text-xs text-[var(--success)] font-medium">
                        {t("bundleSave", {
                          montant: formatPrix(FORMATION_PRIX.courte + FORMATION_PRIX.longue - FORMATION_PRIX.bundle),
                        })}
                      </span>
                    </div>
                    <button
                      onClick={() => acheter("bundle")}
                      disabled={buying !== null}
                      className="mt-5 w-full rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-semibold text-sm py-2.5 transition-all"
                    >
                      {buying === "bundle"
                        ? t("redirecting")
                        : t("buyBundle", { prix: formatPrix(FORMATION_PRIX.bundle) })}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Contenu des collections possédées ────────────────────────────── */}
            {(["courte", "longue"] as const).map((collection) => {
              if (!owned[collection]) return null;
              const modules = state.modules.filter((m) => m.collection === collection);
              return (
                <section key={collection}>
                  <h2 className="text-lg font-bold text-[var(--text-primary)] mb-4">{t(`${collection}Titre`)}</h2>
                  <div className="flex flex-col gap-4">
                    {modules.map((m) => (
                      <details
                        key={m.id}
                        className="group rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 open:pb-8"
                      >
                        <summary className="cursor-pointer list-none flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{m.titre}</h3>
                            <p className="text-[var(--text-muted)] text-sm mt-2">{m.description}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <Link
                              href={`/formation/lire/${m.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition hover:bg-violet-500/20"
                            >
                              {t("read")}
                            </Link>
                            <span className="text-[var(--text-faint)] text-xs mt-1 group-open:rotate-180 transition-transform">
                              ▾
                            </span>
                          </div>
                        </summary>
                        <div
                          className={`prose prose-sm max-w-none mt-6 text-[var(--text-muted)] ${isLight ? "" : "prose-invert"}`}
                          dangerouslySetInnerHTML={{ __html: m.contenuHtml }}
                        />
                      </details>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  // Tant qu'on ne sait pas encore si un visiteur est connecté, aucune des deux mises en
  // page n'est affichée — évite de flasher la version publique puis de basculer sur la
  // sidebar une fraction de seconde plus tard (ou l'inverse).
  if (!authChecked) {
    return <div className="min-h-screen bg-[var(--bg)]" />;
  }

  if (!isLoggedIn) {
    return content;
  }

  return (
    <OnboardingProvider>
      <div className="flex min-h-screen">
        <Sidebar collapsed={sidebarCollapsed} onCollapse={() => setSidebarCollapsed((c) => !c)} />
        <main
          className={`flex-1 min-w-0 transition-[margin-left] duration-200 ease-in-out ${
            sidebarCollapsed ? "ml-16" : "ml-[260px]"
          }`}
        >
          {content}
        </main>
      </div>
      <OnboardingTour />
    </OnboardingProvider>
  );
}
