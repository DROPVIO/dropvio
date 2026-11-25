"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";

type Notification = { id: string; date: string; vue: boolean; numero: string | null; produit: string | null };
// luLe : heure de lecture, référence des durées relatives (« il y a 2 heures »).
type Etat = { nonVues: number; notifications: Notification[]; disponible: boolean; luLe: number };

const INTERVALLE_MS = 60_000;

async function lireNotifications(): Promise<Etat | null> {
  try {
    const res = await fetch("/api/notifications");
    return res.ok ? { ...(await res.json()), luLe: Date.now() } : null;
  } catch {
    // Cloche silencieuse en cas d'erreur réseau : la page reste utilisable.
    return null;
  }
}

/** Cloche des nouvelles ventes, en haut à droite des pages de l'application. Le compteur est
 *  celui des notifications non vues ; ouvrir le panneau les marque vues. Masquée tant que la
 *  table notifications n'existe pas (migration 051). */
export default function ClocheVentes() {
  const t = useTranslations("ventes.cloche");
  const format = useFormatter();
  const pathname = usePathname();
  const [etat, setEtat] = useState<Etat | null>(null);
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const appliquer = (lu: Etat | null) => { if (lu) setEtat(lu); };
    lireNotifications().then(appliquer);
    const minuterie = setInterval(() => lireNotifications().then(appliquer), INTERVALLE_MS);
    return () => clearInterval(minuterie);
  }, [pathname]);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: PointerEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("pointerdown", fermer);
    return () => document.removeEventListener("pointerdown", fermer);
  }, [ouvert]);

  if (!etat?.disponible) return null;

  async function basculer() {
    const ouvrir = !ouvert;
    setOuvert(ouvrir);
    if (ouvrir && etat && etat.nonVues > 0) {
      setEtat({ ...etat, nonVues: 0 });
      await fetch("/api/notifications/vues", { method: "POST" }).catch(() => {});
    }
  }

  return (
    <div ref={conteneur} className="fixed right-4 top-3 z-30" onKeyDown={(e) => { if (e.key === "Escape") setOuvert(false); }}>
      <button
        type="button"
        onClick={() => void basculer()}
        aria-expanded={ouvert}
        aria-label={etat.nonVues > 0 ? t("libelleNonVues", { count: etat.nonVues }) : t("libelle")}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-sm transition hover:text-[var(--text-primary)]"
      >
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 7a4 4 0 118 0v2.5l1.2 2H2.8L4 9.5V7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
          <path d="M6.5 13.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
        {etat.nonVues > 0 && (
          <span data-compteur className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-violet-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
            {etat.nonVues > 99 ? "99+" : etat.nonVues}
          </span>
        )}
      </button>

      {ouvert && (
        <div role="dialog" aria-label={t("titre")} className="absolute right-0 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-2 shadow-xl">
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("titre")}</p>
          {etat.notifications.length === 0 ? (
            <p className="px-3 py-4 text-sm text-[var(--text-muted)]">{t("vide")}</p>
          ) : (
            <ul className="flex flex-col">
              {etat.notifications.map((n) => (
                <li key={n.id} className="rounded-lg px-3 py-2 text-sm">
                  <p className="text-[var(--text-primary)]">
                    {!n.vue && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-500 align-middle" />}
                    {t("nouvelleVente", { numero: n.numero ?? "—" })}
                  </p>
                  {n.produit && <p className="truncate text-xs text-[var(--text-muted)]">{n.produit}</p>}
                  <p className="text-[11px] text-[var(--text-faint)]">{format.relativeTime(new Date(n.date), etat.luLe)}</p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/ventes" onClick={() => setOuvert(false)} className="mt-1 block rounded-lg px-3 py-2 text-sm font-semibold text-[var(--accent-text)] hover:bg-[var(--surface-2)]">
            {t("voirVentes")}
          </Link>
        </div>
      )}
    </div>
  );
}
