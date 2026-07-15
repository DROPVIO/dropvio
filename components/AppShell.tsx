"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

const PROTECTED_PATHS = ["/produits-gagnants", "/site-builder", "/mes-sites", "/dashboard", "/audit"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const showSidebar = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  if (!showSidebar) {
    return <>{children}</>;
  }

  return (
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
  );
}
