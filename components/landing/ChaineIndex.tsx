"use client";

import { useEffect, useRef, useState } from "react";

type Step = { verbe: string; titre: string };

// Colonne sticky de la section « La chaîne » : acte en cours, index des six étapes et barre
// de progression. Ce composant porte aussi l'activation des animations de toute la section
// (il possède déjà le cycle de vie lié au scroll) : il pose data-ch-anim="on" sur la racine,
// ce qui déclenche les règles de révélation dans globals.css. Sans JS l'attribut n'existe
// pas, donc rien n'est masqué — c'est la garantie d'un rendu final correct sans script.
export default function ChaineIndex({ actes, steps }: { actes: string[]; steps: Step[] }) {
  const [actif, setActif] = useState(0);
  const [progress, setProgress] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    const racine = document.querySelector<HTMLElement>("[data-dv-chain]");
    if (!racine) return;

    // prefers-reduced-motion est géré en CSS pour cette partie (règles @media dans
    // globals.css) : l'attribut peut être posé dans tous les cas.
    racine.setAttribute("data-ch-anim", "on");

    // Révélation progressive des blocs de la section (mêmes seuils que le reste de la page).
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          io.unobserve(e.target);
          e.target.setAttribute("data-ch-reveal", "in");
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    racine.querySelectorAll("[data-ch-reveal]").forEach((el) => io.observe(el));

    // Étape active + progression : calculées au scroll plutôt que par seuils d'intersection,
    // pour que l'étape « courante » suive la lecture (repère au tiers haut du viewport) même
    // quand deux étapes sont visibles en même temps.
    const etapes = Array.from(racine.querySelectorAll<HTMLElement>("[data-chain-step]"));

    const mesurer = () => {
      const repere = window.innerHeight * 0.34;
      let courant = 0;
      etapes.forEach((el) => {
        const idx = Number(el.dataset.chainStep);
        if (el.getBoundingClientRect().top <= repere) courant = idx;
      });
      setActif(courant);

      const box = racine.getBoundingClientRect();
      const parcouru = repere - box.top;
      setProgress(Math.max(0, Math.min(1, parcouru / Math.max(1, box.height - window.innerHeight * 0.34))));
    };

    const onScroll = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(mesurer);
    };

    mesurer();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      io.disconnect();
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      racine.removeAttribute("data-ch-anim");
    };
  }, []);

  // 0-1 -> acte I, 2-3 -> acte II, 4-5 -> acte III
  const acte = actif <= 1 ? 0 : actif <= 3 ? 1 : 2;

  return (
    <div className="sticky top-28">
      <p className="ch-mono text-[11.5px] font-medium tracking-[0.18em] text-[var(--ch-faint)]">{actes[acte]}</p>

      <div className="mt-6 flex gap-5">
        {/* Barre de progression */}
        <div aria-hidden className="relative w-px shrink-0 bg-[var(--ch-rule)]">
          <div
            className="absolute inset-x-0 top-0 bg-[var(--dv-accent)] transition-[height] duration-200 ease-out"
            style={{ height: `${progress * 100}%` }}
          />
        </div>

        <ol className="list-none">
          {steps.map((s, i) => (
            <li key={s.verbe} className="ch-idx py-[7px]" data-active={i === actif}>
              <span className="ch-mono text-[12px] font-medium tracking-[0.14em]">{s.verbe}</span>
              <span className="ml-2.5 text-[13.5px] text-[var(--ch-muted)]">{s.titre}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
