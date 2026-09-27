"use client";

import { useEffect, useRef, useState } from "react";

// Les deux dernières étapes présentées comme un seul flux en quatre statuts. Horizontal à
// partir de sm, vertical en dessous. État par défaut = flux terminé (dernier statut actif) :
// sans JS ou en prefers-reduced-motion, l'affichage est déjà correct ; l'animation ne fait
// qu'avancer le statut actif de gauche à droite quand la bande entre dans le viewport.

const STATUTS = ["Commande Shopify", "Transmise au fournisseur", "Expédiée", "Suivi envoyé à Shopify"] as const;
const DERNIER = STATUTS.length - 1;

export default function FluxStatuts() {
  const ref = useRef<HTMLDivElement>(null);
  const [actif, setActif] = useState(DERNIER);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.disconnect();
          setActif(0);
          for (let i = 1; i <= DERNIER; i++) {
            timers.push(window.setTimeout(() => setActif(i), 260 + i * 420));
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(el);

    return () => {
      io.disconnect();
      timers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    // Les rails sont hors du <ol> (ce ne sont pas des items) : le conteneur relatif leur
    // sert de référence, la liste se superpose par-dessus.
    <div ref={ref} className="relative mt-7">
          {/* Rail horizontal (sm+) */}
          <span
            aria-hidden
            className="absolute left-[5px] right-[5px] top-[5px] hidden h-px bg-[var(--ch-rule-strong)] sm:block"
          />
          <span
            aria-hidden
            className="absolute left-[5px] top-[5px] hidden h-px bg-[var(--dv-accent)] transition-[width] duration-500 ease-out sm:block"
            style={{ width: `calc((100% - 10px) * ${actif / DERNIER})` }}
          />
          {/* Rail vertical (mobile) */}
          <span
            aria-hidden
            className="absolute bottom-[10px] left-[5px] top-[10px] w-px bg-[var(--ch-rule-strong)] sm:hidden"
          />

      <ol className="relative flex list-none flex-col gap-5 sm:flex-row sm:gap-0">
          {STATUTS.map((s, i) => {
            const fait = i <= actif;
            return (
              <li key={s} className="relative flex flex-1 items-start gap-3 sm:block">
                <span
                  aria-hidden
                  className={`relative mt-[1px] h-[11px] w-[11px] shrink-0 transition-colors duration-300 sm:mt-0 ${
                    fait ? "bg-[var(--dv-accent)]" : "bg-[var(--ch-raised)] ring-1 ring-[var(--ch-rule-strong)]"
                  }`}
                />
                <span
                  className={`ch-mono block text-[11.5px] leading-[1.45] tracking-[0.08em] transition-colors duration-300 sm:mt-4 sm:pr-4 ${
                    fait ? "text-[var(--ch-ink)]" : "text-[var(--ch-faint)]"
                  }`}
                >
                  {s}
                  {i === actif && <span className="sr-only"> (statut courant)</span>}
                </span>
              </li>
            );
          })}
      </ol>
    </div>
  );
}
