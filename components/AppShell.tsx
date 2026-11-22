"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import Logo from "./Logo";
import OnboardingProvider from "./onboarding/OnboardingProvider";
import OnboardingTour from "./onboarding/OnboardingTour";
import PaiementActionBanner from "./expert/PaiementActionBanner";
import ClocheVentes from "./ClocheVentes";

// Mémorise la sidebar réduite (icônes seules) entre les rechargements et les sessions.
const SIDEBAR_COLLAPSED_KEY = "dropvio-sidebar-collapsed";
// localStorage n'émet "storage" que vers les autres onglets : événement maison pour l'onglet courant.
const SIDEBAR_COLLAPSED_EVENT = "dropvio-sidebar-collapsed-change";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeCollapsed(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_COLLAPSED_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, onChange);
  };
}

function toggleCollapsed(): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, readCollapsed() ? "0" : "1");
  } catch {
    // Stockage indisponible : on ne peut pas mémoriser le choix.
  }
  window.dispatchEvent(new Event(SIDEBAR_COLLAPSED_EVENT));
}

const PROTECTED_PATHS = ["/studio", "/quota", "/produits-gagnants", "/site-builder", "/mes-sites", "/dashboard", "/audit", "/tools/calculateur-marge", "/ventes"];

/** Cadre des pages de l'outil (et de /formation pour un compte connecté).
 *  - Desktop (≥ 1024 px) : barre latérale en colonne fixe ; le contenu est décalé de sa largeur
 *    réelle, étendue (260 px) ou repliée (64 px), portée par la variable CSS --largeur-barre.
 *    L'état replié est mémorisé (localStorage).
 *  - Mobile (< 1024 px) : tiroir <dialog> ouvert avec showModal() par le bouton en haut à gauche.
 *    Échap, un clic sur le fond ou sur un lien le ferment ; le focus revient au bouton ; la page
 *    derrière ne défile pas. */
export function CadreApp({ children, pied }: { children: React.ReactNode; pied?: React.ReactNode }) {
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const t = useTranslations("dashboard.nav");
  const tiroirRef = useRef<HTMLDialogElement>(null);
  const boutonRef = useRef<HTMLButtonElement>(null);
  const [tiroirOuvert, setTiroirOuvert] = useState(false);

  const ouvrirTiroir = () => {
    tiroirRef.current?.showModal();
    setTiroirOuvert(true);
  };
  const fermerTiroir = () => tiroirRef.current?.close();

  // Fermeture (Échap, fond, lien, passage en desktop) : défilement rendu, focus sur le bouton.
  useEffect(() => {
    const dialogue = tiroirRef.current;
    if (!dialogue) return;
    const surFermeture = () => {
      setTiroirOuvert(false);
      boutonRef.current?.focus();
    };
    dialogue.addEventListener("close", surFermeture);
    return () => dialogue.removeEventListener("close", surFermeture);
  }, []);

  useEffect(() => {
    if (!tiroirOuvert) return;
    const precedent = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 1024px)");
    const surChangement = (e: MediaQueryListEvent) => { if (e.matches) tiroirRef.current?.close(); };
    desktop.addEventListener("change", surChangement);
    return () => {
      document.body.style.overflow = precedent;
      desktop.removeEventListener("change", surChangement);
    };
  }, [tiroirOuvert]);

  return (
    <OnboardingProvider>
      <div
        className="flex min-h-screen"
        style={{ "--largeur-barre": collapsed ? "64px" : "260px" } as React.CSSProperties}
      >
        <Sidebar collapsed={collapsed} onCollapse={toggleCollapsed} />

        <dialog
          ref={tiroirRef}
          aria-label={t("navigation")}
          // Un clic sur le fond (hors du panneau) atteint le <dialog> lui-même.
          onClick={(e) => { if (e.target === e.currentTarget) fermerTiroir(); }}
          className="m-0 h-dvh max-h-none w-[260px] max-w-[85vw] p-0 bg-transparent backdrop:bg-black/50 lg:hidden"
        >
          {tiroirOuvert ? <Sidebar collapsed={false} onCollapse={toggleCollapsed} variante="tiroir" onCloseMobile={fermerTiroir} /> : null}
        </dialog>

        <main className="min-w-0 flex-1 transition-[margin-left] duration-200 ease-in-out lg:ml-[var(--largeur-barre)]">
          {/* Barre mobile : ouvre le tiroir de navigation. */}
          <div className="sticky top-0 z-20 flex h-14 items-center gap-2.5 border-b border-[var(--border)] bg-[var(--bg-sunken)] px-4 lg:hidden">
            <button
              ref={boutonRef}
              type="button"
              onClick={ouvrirTiroir}
              aria-label={t("openMenu")}
              aria-expanded={tiroirOuvert}
              aria-haspopup="dialog"
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <Logo className="h-6 w-6 shrink-0 text-[var(--logo-accent)]" />
            <span className="bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] bg-clip-text text-[15px] font-bold text-transparent">
              Dropvio
            </span>
          </div>
          {children}
          {pied}
        </main>
      </div>
      <OnboardingTour />
    </OnboardingProvider>
  );
}

/** pied : pied de page juridique (components/PiedDePageLegal.tsx), placé dans la colonne de
 *  contenu des pages de l'outil pour ne pas passer sous la barre latérale. */
export default function AppShell({ children, pied }: { children: React.ReactNode; pied?: React.ReactNode }) {
  const pathname = usePathname();
  const showSidebar = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!showSidebar) {
    return (
      <>
        {children}
        {pied}
      </>
    );
  }

  return (
    <CadreApp pied={pied}>
      <ClocheVentes />
      <PaiementActionBanner />
      {children}
    </CadreApp>
  );
}
