"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// pagedjs (v0.4.3) est chargé via une balise <script> pointant sur le bundle UMD statique
// public/formation/paged.min.js (copié depuis node_modules/pagedjs/dist/paged.min.js), pas
// via `import("pagedjs")` : le package publie un champ "exports" qui, en contexte ESM,
// résout vers sa source non-bundlée (src/index.js) — celle-ci suppose le pipeline de build
// (rollup) de pagedjs lui-même et casse une fois passée dans Turbopack/webpack
// ("contains.call is not a function", dépendance interne dom4 mal poly-remplie). Le bundle
// UMD pré-construit expose un global stable, indépendant du bundler — c'est l'intégration
// recommandée par pagedjs pour les frameworks JS. Ce global s'appelle `PagedModule` dans le
// build minifié (`paged.min.js`) — contrairement au build non minifié (`paged.js`) qui
// l'expose sous `Paged` — incohérence propre au packaging de pagedjs 0.4.3, vérifiée
// empiriquement sur le fichier réellement servi plutôt que supposée depuis la doc.
declare global {
  interface Window {
    PagedModule?: {
      Previewer: new () => {
        preview: (content: string, stylesheets: string[], renderTo: HTMLElement) => Promise<unknown>;
      };
    };
  }
}

const PAGEDJS_SCRIPT_SRC = "/formation/paged.min.js";

function loadPagedScript(): Promise<void> {
  if (window.PagedModule) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${PAGEDJS_SCRIPT_SRC}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Échec de chargement de pagedjs")));
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = PAGEDJS_SCRIPT_SRC;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Échec de chargement de pagedjs"));
    document.head.appendChild(script);
  });
}

export default function PagedReader({
  titre,
  contenuHtml,
}: {
  titre: string;
  contenuHtml: string;
}) {
  const t = useTranslations("dashboard.formation");
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await loadPagedScript();
        if (cancelled || !containerRef.current || !window.PagedModule) return;

        containerRef.current.innerHTML = "";
        const previewer = new window.PagedModule.Previewer();
        await previewer.preview(contenuHtml, ["/formation/paged-reader.css"], containerRef.current);
        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("Erreur de pagination Paged.js :", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contenuHtml]);

  return (
    <div className="min-h-screen bg-[#3a3a3e]">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-black/20 bg-[#2a2a2e] px-6 py-3">
        <Link href="/formation" className="text-sm text-zinc-300 transition hover:text-white">
          {t("readerBack")}
        </Link>
        <p className="text-sm font-medium text-zinc-100">{titre}</p>
        <div className="w-32" />
      </div>

      {status === "loading" && (
        <p className="py-16 text-center text-sm text-zinc-300">{t("readerLoading")}</p>
      )}
      {status === "error" && (
        <p className="py-16 text-center text-sm text-red-300">{t("readerError")}</p>
      )}

      {/* Paged.js remplace ce conteneur par ses propres <div class="pagedjs_page"> (une par
          feuille). L'espacement/l'ombre entre feuilles vient du CSS global ci-dessous. */}
      <div ref={containerRef} className="py-10" />

      <style jsx global>{`
        .pagedjs_pages {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 32px;
        }
        .pagedjs_page {
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        }
      `}</style>
    </div>
  );
}
