"use client";

import { useTranslations } from "next-intl";

import { useEffect, useMemo, useRef, useState } from "react";
import { CLE_ACCUEIL, CLE_CATALOGUE, titrePageConnue } from "@/lib/site-builder-pages";

// Aperçu d'un site multi-pages (sites_generes.pages, clé → HTML standalone) : UNE page à la
// fois dans une même iframe, et une barre de pages au-dessus. Les liens internes de la page
// (index.html, catalogue.html, collection-….html, #…) sont interceptés dans l'iframe par un
// petit script et renvoyés au parent par postMessage : l'iframe ne navigue jamais, seule la
// page active change. Les pages ne sont jamais fusionnées : seul pages[active] est rendu.
//
// sandbox="allow-scripts" SANS allow-same-origin : le script d'interception (et ceux de la
// page générée) s'exécutent dans une origine opaque, sans accès à l'app. C'est plus permissif
// que l'aperçu d'une seule page (scripts désactivés), mais nécessaire à l'interception.

const SOURCE_MESSAGE = "dropvio-apercu-pages";

// Libellé tiré de la clé : accueil → Accueil, catalogue → Catalogue, pages légales → leur
// titre (Mentions légales, CGV, Confidentialité), collection-x-y → X y.
export function libellePage(cle: string): string {
  const connu = titrePageConnue(cle);
  if (connu) return connu;
  const brut = cle.replace(/^collection-/, "").replace(/-/g, " ").trim() || cle;
  return brut.charAt(0).toUpperCase() + brut.slice(1);
}

// Ordre de la barre : accueil, catalogue, puis les autres clés dans l'ordre reçu.
function ordonner(cles: string[]): string[] {
  return [
    ...cles.filter((c) => c === CLE_ACCUEIL),
    ...cles.filter((c) => c === CLE_CATALOGUE),
    ...cles.filter((c) => c !== CLE_ACCUEIL && c !== CLE_CATALOGUE),
  ];
}

// Script injecté dans chaque page de l'aperçu. Intercepte, en phase de capture, les clics sur
// les liens internes : <clé>.html (index → accueil) et #ancre. Une ancre présente dans la page
// défile sur place ; sinon elle est traitée comme une page (#catalogue → catalogue). Les liens
// avec schéma (https:, mailto:, tel:…) ou protocole relatif (//) ne sont pas interceptés.
const SCRIPT_INTERCEPTION = `<script>
(function () {
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.indexOf("//") === 0) return;
    var page = /^([a-z0-9-]+)\\.html(?:#.*)?$/i.exec(href);
    var cible = null;
    if (page) {
      cible = page[1].toLowerCase() === "index" ? "${CLE_ACCUEIL}" : page[1].toLowerCase();
    } else if (href.charAt(0) === "#") {
      e.preventDefault();
      var id = href.slice(1);
      var el = id ? document.getElementById(id) : null;
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
      if (!id) { window.scrollTo(0, 0); return; }
      cible = id.toLowerCase();
    } else {
      return;
    }
    e.preventDefault();
    parent.postMessage({ source: "${SOURCE_MESSAGE}", cible: cible }, "*");
  }, true);
})();
</script>`;

function avecInterception(html: string): string {
  const fin = html.toLowerCase().lastIndexOf("</body>");
  return fin === -1 ? `${html}${SCRIPT_INTERCEPTION}` : `${html.slice(0, fin)}${SCRIPT_INTERCEPTION}${html.slice(fin)}`;
}

export default function ApercuPages({
  pages,
  hauteur = "70vh",
}: {
  pages: Record<string, string>;
  hauteur?: string;
}) {
  const t = useTranslations("siteBuilder.apercu");
  const cles = useMemo(() => ordonner(Object.keys(pages)), [pages]);
  const [active, setActive] = useState<string>(CLE_ACCUEIL);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);

  // Clé active inconnue (pages régénérées, collection retirée…) : retour à l'accueil, ou à la
  // première page s'il n'y a pas d'accueil.
  const cleAffichee = active in pages ? active : CLE_ACCUEIL in pages ? CLE_ACCUEIL : cles[0];
  const srcDoc = useMemo(() => (cleAffichee ? avecInterception(pages[cleAffichee]) : ""), [pages, cleAffichee]);

  function allerA(cle: string) {
    if (!(cle in pages)) return;
    setActive(cle);
    // Nouvelle page : la zone d'aperçu revient en haut (l'iframe, rechargée par srcDoc,
    // repart elle-même du début de la page).
    zoneRef.current?.scrollIntoView({ block: "nearest" });
  }

  useEffect(() => {
    function surMessage(e: MessageEvent) {
      // Seule l'iframe de cet aperçu est écoutée (origine opaque : on vérifie la source).
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data as { source?: unknown; cible?: unknown } | null;
      if (!data || data.source !== SOURCE_MESSAGE || typeof data.cible !== "string") return;
      if (data.cible in pages) {
        setActive(data.cible);
        zoneRef.current?.scrollIntoView({ block: "nearest" });
      }
    }
    window.addEventListener("message", surMessage);
    return () => window.removeEventListener("message", surMessage);
  }, [pages]);

  return (
    <div ref={zoneRef} className="flex flex-col">
      <nav
        aria-label={t("pagesDuSite")}
        className="flex gap-1 overflow-x-auto border-b border-[var(--border)] bg-[var(--surface-2)] px-3 py-2"
      >
        {cles.map((cle) => (
          <button
            key={cle}
            type="button"
            onClick={() => allerA(cle)}
            aria-current={cle === cleAffichee ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              cle === cleAffichee
                ? "bg-violet-600 text-white"
                : "text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
            }`}
          >
            {libellePage(cle)}
          </button>
        ))}
      </nav>
      {/* Fond blanc comme l'aperçu d'une seule page : rendu fidèle de la page générée. */}
      <iframe
        ref={iframeRef}
        key={cleAffichee}
        srcDoc={srcDoc}
        title={t("titreIframe", { page: cleAffichee ? libellePage(cleAffichee) : "" })}
        className="w-full"
        style={{ height: hauteur, border: "none", background: "#fff" }}
        sandbox="allow-scripts"
      />
    </div>
  );
}
