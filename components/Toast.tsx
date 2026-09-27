"use client";

import { useCallback, useEffect, useState } from "react";

export type ToastMessage = { texte: string; ok: boolean };

/** État de toast local à une page. Volontairement sans contexte ni provider global : chaque
 *  page garde son état et rend son propre <ToastHost/>, ce qui évite de toucher AppShell. */
export function useToast(dureeMs = 6000) {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), dureeMs);
    return () => window.clearTimeout(id);
  }, [toast, dureeMs]);

  const succes = useCallback((texte: string) => setToast({ texte, ok: true }), []);
  const echec = useCallback((texte: string) => setToast({ texte, ok: false }), []);
  const fermer = useCallback(() => setToast(null), []);

  return { toast, succes, echec, fermer };
}

/** role="alert" pour une erreur (annonce immédiate), "status" pour un succès. */
export function ToastHost({ toast, onClose }: { toast: ToastMessage | null; onClose: () => void }) {
  if (!toast) return null;
  return (
    <div
      role={toast.ok ? "status" : "alert"}
      aria-live={toast.ok ? "polite" : "assertive"}
      className={`fixed bottom-5 right-5 z-50 max-w-[min(92vw,26rem)] rounded-xl border px-4 py-3 text-sm shadow-lg ${
        toast.ok
          ? "border-[var(--success)]/25 bg-[var(--surface)] text-[var(--text-primary)]"
          : "border-[var(--danger)]/30 bg-[var(--surface)] text-[var(--danger)]"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="shrink-0">{toast.ok ? "✓" : "⚠️"}</span>
        <span className="break-words">{toast.texte}</span>
        <button
          onClick={onClose}
          aria-label="Fermer la notification"
          className="ml-2 shrink-0 text-[var(--text-faint)] transition hover:text-[var(--text-muted)]"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
