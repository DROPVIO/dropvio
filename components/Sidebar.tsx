"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import ParametresModal from "./ParametresModal";
import type { User } from "@supabase/supabase-js";

type Profile = { nom_complet: string | null; plan: string };

// ─── Icons ───────────────────────────────────────────────────────────────────

const IcoTrophy = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 10.5V13M5.5 14.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M4 2.5H2.5V5c0 1.7 1.3 3 2.5 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M12 2.5h1.5V5c0 1.7-1.3 3-2.5 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M4 2.5h8v5a4 4 0 01-8 0V2.5Z" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);

const IcoGlobe = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 2c-1.5 1.8-2 3.7-2 6s.5 4.2 2 6M8 2c1.5 1.8 2 3.7 2 6s-.5 4.2-2 6M2.5 8h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoFolder = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 6h12v6.5A1.5 1.5 0 0112.5 14h-9A1.5 1.5 0 012 12.5V6Z" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2 6V4.5A1.5 1.5 0 013.5 3h3.1L8 4.5H14" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
);

const IcoCalc = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="2" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M5.5 5.5h5M5.5 8.5h1.5M9 8.5h1.5M5.5 11.5h1.5M9 11.5h1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoAudit = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="1.5" width="8.5" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M4.5 5h4M4.5 7.5h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <circle cx="11.5" cy="11.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M13.3 13.3L15 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoDashboard = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="2" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="2" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="2" y="9" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="9" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);

const IcoSettings = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 2V3.5M8 12.5V14M2 8H3.5M12.5 8H14M3.5 3.5L4.6 4.6M11.4 11.4L12.5 12.5M12.5 3.5L11.4 4.6M4.6 11.4L3.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoPlus = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const IcoChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoGear = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <circle cx="6.5" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M6.5 1.5V3M6.5 10V11.5M1.5 6.5H3M10 6.5H11.5M3 3L4 4M9 9L10 10M10 3L9 4M4 9L3 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

// ─── Nav config ───────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",         label: "Dashboard",             icon: <IcoDashboard /> },
  { href: "/produits-gagnants", label: "Produits gagnants",     icon: <IcoTrophy /> },
  { href: "/site-builder",      label: "Site Builder",          icon: <IcoGlobe /> },
  { href: "/mes-sites",         label: "Mes sites",             icon: <IcoFolder /> },
  { href: "/audit",             label: "Audit de site",         icon: <IcoAudit /> },
  { href: "/calculateur-marge", label: "Calculateur de marge",  icon: <IcoCalc />, soon: true },
];

const PLAN_CLS: Record<string, string> = {
  free:   "text-zinc-500",
  pro:    "text-violet-400",
  agency: "text-amber-400",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({
  collapsed,
  onCollapse,
}: {
  collapsed: boolean;
  onCollapse: () => void;
}) {
  const pathname = usePathname();
  const router   = useRouter();

  const [user,       setUser]       = useState<User | null>(null);
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [modalOpen,  setModalOpen]  = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        supabase
          .from("profils")
          .select("nom_complet, plan")
          .eq("id", data.user.id)
          .maybeSingle()
          .then(({ data: p }) => { if (p) setProfile(p as Profile); });
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const initials  = (profile?.nom_complet || user?.email || "?").slice(0, 2).toUpperCase();
  const planKey   = profile?.plan ?? "free";
  const planLabel = `Plan ${planKey.charAt(0).toUpperCase() + planKey.slice(1)}`;
  const displayName = profile?.nom_complet || user?.email || "";

  return (
    <>
      <aside
        className={`fixed top-0 left-0 h-screen bg-[#09090f] border-r border-white/[0.06] flex flex-col z-40 transition-[width] duration-200 ease-in-out overflow-hidden ${
          collapsed ? "w-16" : "w-[260px]"
        }`}
      >
        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2.5 border-b border-white/[0.06] shrink-0 h-[57px] px-4">
          <span className="text-xl shrink-0 leading-none">⚡</span>
          <span
            className={`text-[15px] font-bold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent whitespace-nowrap transition-[opacity,width] duration-150 ${
              collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
            }`}
          >
            Dropvio
          </span>
        </div>

        {/* ── Nav ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden p-2 gap-1">

          {/* CTA */}
          <button
            onClick={() => router.push("/site-builder")}
            title={collapsed ? "Nouvelle génération" : undefined}
            className={`flex items-center gap-2.5 rounded-xl font-semibold text-sm transition-all shadow-[0_0_18px_rgba(124,58,237,0.18)] bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white shrink-0 ${
              collapsed
                ? "w-10 h-10 mx-auto justify-center"
                : "w-full px-4 py-2.5"
            }`}
          >
            <IcoPlus />
            {!collapsed && <span className="whitespace-nowrap">Nouvelle génération</span>}
          </button>

          <div className="h-px bg-white/[0.05] my-1.5 shrink-0" />

          {/* Links */}
          {NAV_ITEMS.map(({ href, label, icon, soon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <a
                key={href}
                href={soon ? undefined : href}
                title={collapsed ? label : undefined}
                onClick={soon ? (e) => e.preventDefault() : undefined}
                className={`relative flex items-center gap-3 rounded-lg text-sm transition-all duration-150 shrink-0 ${
                  collapsed ? "w-10 h-10 mx-auto justify-center" : "px-3 py-2.5"
                } ${
                  soon
                    ? "opacity-40 cursor-not-allowed text-zinc-500"
                    : isActive
                    ? "bg-white/[0.07] text-white"
                    : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
                }`}
              >
                {/* Active pill */}
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-violet-500 rounded-r-full" />
                )}

                <span className={`shrink-0 ${isActive ? "text-violet-400" : soon ? "text-zinc-600" : "text-zinc-500"}`}>
                  {icon}
                </span>

                {!collapsed && (
                  <>
                    <span className="flex-1 whitespace-nowrap">{label}</span>
                    {soon && (
                      <span className="text-[9px] font-bold bg-white/[0.05] border border-white/[0.07] text-zinc-600 px-1.5 py-0.5 rounded-full">
                        bientôt
                      </span>
                    )}
                  </>
                )}
              </a>
            );
          })}

          {/* Paramètres */}
          <div className="h-px bg-white/[0.05] my-1 shrink-0" />
          <button
            onClick={() => setModalOpen(true)}
            title={collapsed ? "Paramètres" : undefined}
            className={`relative flex items-center gap-3 rounded-lg text-sm transition-all duration-150 shrink-0 text-zinc-400 hover:text-white hover:bg-white/[0.04] ${
              collapsed ? "w-10 h-10 mx-auto justify-center" : "px-3 py-2.5"
            }`}
          >
            <span className="shrink-0 text-zinc-500"><IcoSettings /></span>
            {!collapsed && <span className="flex-1 whitespace-nowrap text-left">Paramètres</span>}
          </button>
        </div>

        {/* ── Collapse button ───────────────────────────────────────────── */}
        <div className={`px-2 pb-1 shrink-0 ${collapsed ? "flex justify-center" : ""}`}>
          <button
            onClick={onCollapse}
            title={collapsed ? "Agrandir la sidebar" : "Réduire la sidebar"}
            className={`flex items-center gap-2 rounded-lg text-[11px] text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] transition h-8 ${
              collapsed ? "w-10 justify-center" : "w-full px-3"
            }`}
          >
            {collapsed ? <IcoChevronRight /> : (
              <>
                <IcoChevronLeft />
                <span className="whitespace-nowrap">Réduire</span>
              </>
            )}
          </button>
        </div>

        {/* ── User block ────────────────────────────────────────────────── */}
        <div className="border-t border-white/[0.06] p-2 shrink-0">
          {user && (
            <button
              onClick={() => setModalOpen(true)}
              title={collapsed ? `${displayName} · Paramètres` : undefined}
              className={`flex items-center gap-2.5 w-full rounded-xl hover:bg-white/[0.05] transition-colors px-2 py-2 group text-left ${
                collapsed ? "justify-center" : ""
              }`}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-violet-800 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                {initials}
              </div>

              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-zinc-200 truncate leading-snug">
                      {displayName}
                    </p>
                    <p className={`text-[10px] leading-snug ${PLAN_CLS[planKey] ?? PLAN_CLS.free}`}>
                      {planLabel}
                    </p>
                  </div>
                  <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors shrink-0">
                    <IcoGear />
                  </span>
                </>
              )}
            </button>
          )}
        </div>
      </aside>

      {/* Paramètres modal */}
      {modalOpen && user && (
        <ParametresModal user={user} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
