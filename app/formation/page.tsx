"use client";

import { useEffect, useState } from "react";
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

const OFFRE_INFO: Record<FormationCollection, {
  titre: string;
  accroche: string;
  public: string;
  bullets: string[];
}> = {
  courte: {
    titre: "Formation courte",
    accroche: "L'essentiel pour lancer une boutique qui tient, sans y passer des semaines.",
    public: "Pour ceux qui n'ont pas le temps de tout lire mais veulent des bases solides et applicables tout de suite.",
    bullets: [
      "Le calcul de marge complet à faire avant chaque lancement",
      "Choisir un produit et un fournisseur fiable, avec méthode",
      "Construire une fiche produit et une boutique qui convertissent",
      "Trésorerie, cadre légal France et service client sans mauvaise surprise",
      "Un condensé sérieux, pas un résumé superficiel",
    ],
  },
  longue: {
    titre: "Formation longue",
    accroche: "La méthode complète, approfondie, avec études de cas et grilles prêtes à l'emploi.",
    public: "Pour ceux qui veulent tout maîtriser en profondeur, avant de se lancer ou pour structurer une activité déjà démarrée.",
    bullets: [
      "Chaque sujet développé en profondeur, exemples chiffrés multiples",
      "Études de cas complètes, anatomie des échecs les plus fréquents",
      "Grilles d'évaluation fournisseurs, checklists boutique et lancement",
      "Glossaire, sources, comparatif des canaux publicitaires",
      "26 parties pour construire une activité qui dure",
    ],
  },
};

function formatPrix(prix: number): string {
  return `${prix.toFixed(2).replace(".", ",")}€`;
}

export default function FormationPage() {
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
          setState({ status: "error", message: json.error ?? "Impossible de charger la formation." });
          return;
        }
        setState({ status: "ok", modules: json.modules, owned: json.owned });
      })
      .catch(() => setState({ status: "error", message: "Impossible de contacter le serveur." }));
  };

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
        alert(json.error ?? "Impossible de démarrer le paiement.");
        setBuying(null);
        return;
      }
      window.location.href = json.url;
    } catch {
      alert("Impossible de contacter le serveur.");
      setBuying(null);
    }
  };

  const owned = state.status === "ok" ? state.owned : { courte: false, longue: false };
  const hasBoth = owned.courte && owned.longue;

  const content = (
    <div className="min-h-screen bg-[#0d0d14] text-white font-sans px-4 py-16">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Formation
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight">Formation dropshipping</h1>
          <p className="text-zinc-400 text-sm max-w-md mx-auto mt-3">
            Achat unique, accès à vie. Pas d&apos;abonnement.
          </p>
        </div>

        {banner === "success" && (
          <div className="mb-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center px-4 py-3">
            Paiement reçu — l&apos;accès s&apos;active en quelques secondes.
          </div>
        )}
        {banner === "canceled" && (
          <div className="mb-8 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-400 text-sm text-center px-4 py-3">
            Paiement annulé, rien n&apos;a été débité.
          </div>
        )}

        {state.status === "loading" && (
          <div className="rounded-2xl bg-[#13131f] border border-white/5 p-10 text-center text-zinc-500 text-sm">
            Chargement…
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-2xl bg-[#13131f] border border-white/5 p-10 text-center text-zinc-400 text-sm">
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
                    const info = OFFRE_INFO[collection];
                    return (
                      <div key={collection} className="rounded-2xl bg-[#13131f] border border-white/5 p-6">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <h2 className="text-lg font-bold text-white">{info.titre}</h2>
                            <p className="text-zinc-400 text-sm mt-1">{info.accroche}</p>
                          </div>
                          <div className="text-2xl font-extrabold text-white shrink-0">
                            {formatPrix(FORMATION_PRIX[collection])}
                          </div>
                        </div>
                        <p className="text-zinc-500 text-xs mt-4 italic">{info.public}</p>
                        <ul className="mt-4 flex flex-col gap-1.5">
                          {info.bullets.map((b) => (
                            <li key={b} className="flex items-start gap-2 text-sm text-zinc-300">
                              <span className="text-violet-400 shrink-0 mt-0.5">✓</span>
                              {b}
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => acheter(collection)}
                          disabled={buying !== null}
                          className="mt-5 w-full rounded-xl bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 disabled:opacity-50 text-white font-semibold text-sm py-2.5 transition-all"
                        >
                          {buying === collection ? "Redirection…" : `Acheter — ${formatPrix(FORMATION_PRIX[collection])}`}
                        </button>
                      </div>
                    );
                  })}

                {/* Bundle, mis en avant tant que les deux ne sont pas déjà possédées */}
                {!hasBoth && (
                  <div className="rounded-2xl bg-gradient-to-br from-violet-950/60 to-[#13131f] border border-violet-500/30 p-6 relative overflow-hidden">
                    <span className="absolute top-0 right-0 text-[10px] font-bold bg-violet-500 text-white px-3 py-1 rounded-bl-lg">
                      MEILLEURE OFFRE
                    </span>
                    <h2 className="text-lg font-bold text-white">Les deux formations</h2>
                    <p className="text-zinc-400 text-sm mt-1">
                      Version courte pour démarrer vite, version longue pour tout approfondir — l&apos;accès aux deux, à vie.
                    </p>
                    <div className="flex items-center gap-2 mt-4">
                      <span className="text-2xl font-extrabold text-white">{formatPrix(FORMATION_PRIX.bundle)}</span>
                      <span className="text-sm text-zinc-500 line-through">
                        {formatPrix(FORMATION_PRIX.courte + FORMATION_PRIX.longue)}
                      </span>
                      <span className="text-xs text-emerald-400 font-medium">
                        économise {formatPrix(FORMATION_PRIX.courte + FORMATION_PRIX.longue - FORMATION_PRIX.bundle)}
                      </span>
                    </div>
                    <button
                      onClick={() => acheter("bundle")}
                      disabled={buying !== null}
                      className="mt-5 w-full rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-semibold text-sm py-2.5 transition-all"
                    >
                      {buying === "bundle" ? "Redirection…" : `Acheter le bundle — ${formatPrix(FORMATION_PRIX.bundle)}`}
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
                  <h2 className="text-lg font-bold text-white mb-4">{OFFRE_INFO[collection].titre}</h2>
                  <div className="flex flex-col gap-4">
                    {modules.map((m) => (
                      <details
                        key={m.id}
                        className="group rounded-2xl bg-[#13131f] border border-white/5 p-6 open:pb-8"
                      >
                        <summary className="cursor-pointer list-none flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-sm font-semibold text-white">{m.titre}</h3>
                            <p className="text-zinc-400 text-sm mt-2">{m.description}</p>
                          </div>
                          <span className="text-zinc-500 text-xs shrink-0 mt-1 group-open:rotate-180 transition-transform">
                            ▾
                          </span>
                        </summary>
                        <div
                          className="prose prose-invert prose-sm max-w-none mt-6 text-zinc-300"
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
    return <div className="min-h-screen bg-[#0d0d14]" />;
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
