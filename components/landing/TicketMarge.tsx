"use client";

import { useEffect, useRef, useState } from "react";

// Relevé typographique (pas une carte UI) : lignes alignées en tabular-nums, filets
// pointillés en guise de conducteurs. Les montants finaux sont dans le HTML dès le rendu ;
// l'animation (apparition en cascade + décompte de la marge nette) n'est qu'un supplément et
// ne s'active qu'au scroll, jamais en prefers-reduced-motion.

const LIGNES = [
  { label: "Prix de vente TTC", valeur: "39,90 €" },
  { label: "TVA 20 %", valeur: "− 6,65 €" },
  { label: "Produit + livraison", valeur: "− 11,40 €" },
  { label: "Taxe import UE", valeur: "− 3,00 €" },
  { label: "Commission Stripe", valeur: "− 0,85 €" },
  { label: "Cotisations URSSAF 12,3 %", valeur: "− 4,09 €" },
] as const;

const MARGE_BRUTE = 28.5;
const MARGE_NETTE = 13.91;

const euros = (n: number) => `${n.toFixed(2).replace(".", ",")} €`;

export default function TicketMarge() {
  const ref = useRef<HTMLDivElement>(null);
  const [nette, setNette] = useState(MARGE_NETTE);

  useEffect(() => {
    const racine = ref.current;
    if (!racine) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lignes = Array.from(racine.querySelectorAll<HTMLElement>("[data-ch-line]"));
    let raf = 0;
    const timers: number[] = [];

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.disconnect();

          // Cascade de 80 ms entre les lignes.
          lignes.forEach((l, i) => {
            timers.push(window.setTimeout(() => l.setAttribute("data-ch-line", "in"), i * 80));
          });

          // Décompte de la marge brute vers la marge nette, une fois les lignes posées.
          const depart = performance.now() + lignes.length * 80 + 120;
          const duree = 900;
          const tick = (now: number) => {
            const p = Math.max(0, Math.min(1, (now - depart) / duree));
            const eased = 1 - Math.pow(1 - p, 3);
            setNette(MARGE_BRUTE + (MARGE_NETTE - MARGE_BRUTE) * eased);
            if (p < 1) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        });
      },
      { threshold: 0.35 }
    );
    io.observe(racine);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      timers.forEach(window.clearTimeout);
    };
  }, []);

  return (
    <div ref={ref} className="ch-mono text-[12px] tabular-nums sm:text-[13px]">
      <ul className="list-none">
        {LIGNES.map((l) => (
          <li key={l.label} data-ch-line="" className="flex items-baseline gap-2 py-[7px]">
            {/* Le libellé peut se réduire et passer à la ligne : à 360px la ligne la plus
                longue (« Cotisations URSSAF 12,3 % ») ne laissait que ~3px de marge, trop
                peu pour dépendre des métriques de police. Seul le montant reste insécable. */}
            <span className="min-w-0 text-[var(--ch-muted)]">{l.label}</span>
            <span aria-hidden className="min-w-[1rem] flex-1 translate-y-[-3px] border-b border-dotted border-[var(--ch-rule-strong)]" />
            <span className="shrink-0 tabular-nums text-[var(--ch-ink)]">{l.valeur}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-[var(--ch-rule-strong)] pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[var(--ch-faint)]">Marge brute</span>
          <span className="text-[var(--ch-faint)] line-through">{euros(MARGE_BRUTE)}</span>
        </div>
        <div className="mt-2.5 flex items-baseline justify-between gap-3">
          <span className="text-[var(--ch-muted)]">Marge nette</span>
          <span className="ch-display text-[clamp(1.9rem,4vw,2.6rem)] font-semibold leading-none tracking-[-0.03em] text-[var(--dv-accent)]">
            {euros(nette)}
          </span>
        </div>
      </div>

      <p className="mt-4 text-[11px] not-italic text-[var(--ch-faint)]">Exemple indicatif</p>
    </div>
  );
}
