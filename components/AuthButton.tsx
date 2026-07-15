"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";
import ParametresModal from "./ParametresModal";

const PROTECTED_PATHS = ["/produits-gagnants", "/site-builder", "/mes-sites"];

export default function AuthButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const isProtectedPage = PROTECTED_PATHS.some((p) => pathname.startsWith(p));

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function openModal() {
    setDropdownOpen(false);
    setModalOpen(true);
  }

  if (!user || !isProtectedPage) return null;

  const initials = user.email?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setDropdownOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#13131f] border border-white/10 hover:border-white/20 transition text-sm"
        >
          <span className="w-6 h-6 rounded-full bg-violet-600 flex items-center justify-center text-[10px] font-bold text-white">
            {initials}
          </span>
          <span className="text-zinc-300 text-xs hidden sm:block max-w-[140px] truncate">
            {user.email}
          </span>
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="text-zinc-500">
            <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {dropdownOpen && (
          <>
            <div className="fixed inset-0" onClick={() => setDropdownOpen(false)} />
            <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#13131f] border border-white/10 shadow-xl overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-white/5">
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>

              <nav className="p-1.5 flex flex-col gap-0.5">
                {[
                  { href: "/produits-gagnants", label: "🏆 Produits gagnants" },
                  { href: "/site-builder",      label: "🌐 Site Builder" },
                  { href: "/mes-sites",         label: "📁 Mes sites" },
                ].map(({ href, label }) => (
                  <a
                    key={href}
                    href={href}
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center px-3 py-2 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.05] hover:text-white transition"
                  >
                    {label}
                  </a>
                ))}
              </nav>

              <div className="p-1.5 border-t border-white/5 flex flex-col gap-0.5">
                <button
                  onClick={openModal}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-zinc-300 hover:bg-white/[0.05] hover:text-white transition"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="4" r="2" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M2 10.5c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Compte
                </button>

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 transition"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M4.5 2H2.5C2.2 2 2 2.2 2 2.5v7c0 .3.2.5.5.5H4.5M8 8.5L10.5 6 8 3.5M10.5 6H4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Se déconnecter
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {modalOpen && user && (
        <ParametresModal user={user} onClose={() => setModalOpen(false)} />
      )}
    </>
  );
}
