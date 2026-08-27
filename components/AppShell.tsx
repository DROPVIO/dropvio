"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import OnboardingProvider from "./onboarding/OnboardingProvider";
import OnboardingTour from "./onboarding/OnboardingTour";

const PROTECTED_PATHS = ["/produits-gagnants", "/site-builder", "/mes-sites", "/dashboard", "/audit", "/tools/calculateur-marge"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const showSidebar = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
    <OnboardingProvider>
      <div className="flex min-h-screen">
        <Sidebar collapsed={collapsed} onCollapse={() => setCollapsed((c) => !c)} />
        <main
          className={`flex-1 min-w-0 transition-[margin-left] duration-200 ease-in-out ${
            collapsed ? "ml-16" : "ml-[260px]"
          }`}
        >
          {children}
        </main>
      </div>
      <OnboardingTour />
    </OnboardingProvider>
  );
}
