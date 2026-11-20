"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
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

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const t = useTranslations("dashboard.nav");
  // Tiroir de navigation mobile (< md).
  const [mobileOpen, setMobileOpen] = useState(false);

  // Échap ferme le tiroir mobile.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const showSidebar = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <OnboardingProvider>
      <div className="flex min-h-screen">
        <Sidebar
          collapsed={collapsed}
          onCollapse={toggleCollapsed}
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        {mobileOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <main
          className={`flex-1 min-w-0 transition-[margin-left] duration-200 ease-in-out ${
            collapsed ? "ml-0 md:ml-16" : "ml-0 md:ml-[260px]"
          }`}
        >
          {/* Barre mobile : ouvre le tiroir de navigation. */}
          <div className="md:hidden sticky top-0 z-20 h-14 flex items-center gap-2.5 px-4 bg-[var(--bg-sunken)] border-b border-[var(--border)]">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label={t("openMenu")}
              aria-expanded={mobileOpen}
              className="-ml-2 flex h-10 w-10 items-center justify-center rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <Logo className="w-6 h-6 shrink-0 text-[var(--logo-accent)]" />
            <span className="text-[15px] font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] bg-clip-text text-transparent">
              Dropvio
            </span>
          </div>
          <ClocheVentes />
          <PaiementActionBanner />
          {children}
        </main>
      </div>
      <OnboardingTour />
    </OnboardingProvider>
  );
}
