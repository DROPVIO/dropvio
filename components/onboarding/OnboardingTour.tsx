"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useOnboarding } from "./OnboardingProvider";
import { ONBOARDING_STEPS } from "./onboarding-steps";

const GAP = 16;
const BUBBLE_WIDTH = 300;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export default function OnboardingTour() {
  const { active, step, stepIndex, totalSteps, next, prev, skip } = useOnboarding();
  const [targetRect, setTargetRect] = useState<Rect | null>(null);

  useEffect(() => {
    if (!active || !step) return;
    let cancelled = false;

    function measure() {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-onboarding-target="${step!.target}"]`);
      if (!el) {
        setTargetRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }

    // requestAnimationFrame plutôt qu'un appel synchrone : la mesure du DOM
    // se fait après le paint initial de l'effet, pas dans son corps direct.
    const raf = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    // La sidebar peut se replier/déplier en cours de tour (transition CSS) :
    // on repositionne à intervalle court le temps que l'étape reste affichée.
    const id = window.setInterval(measure, 200);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      window.clearInterval(id);
    };
  }, [active, step]);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") skip();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, skip]);

  if (!active || !step || !targetRect) return null;

  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;

  let bubbleTop = targetRect.top + targetRect.height / 2 - 70;
  bubbleTop = Math.max(16, Math.min(bubbleTop, viewportH - 240));

  let bubbleLeft = targetRect.left + targetRect.width + GAP;
  if (bubbleLeft + BUBBLE_WIDTH > viewportW - 16) {
    bubbleLeft = Math.max(16, viewportW - BUBBLE_WIDTH - 16);
  }

  const arrowTop = Math.min(Math.max(targetRect.top + targetRect.height / 2 - bubbleTop - 6, 20), 200);

  return createPortal(
    <div
      className="fixed inset-0 z-[400]"
      role="dialog"
      aria-modal="true"
      aria-label="Tutoriel de bienvenue Dropvio"
    >
      {/* Spotlight : assombrit toute la page sauf l'élément ciblé */}
      <div
        className="fixed rounded-xl transition-all duration-200 ease-out pointer-events-none"
        style={{
          top: targetRect.top - 6,
          left: targetRect.left - 6,
          width: targetRect.width + 12,
          height: targetRect.height + 12,
          boxShadow: "0 0 0 9999px rgba(4,6,10,0.72)",
          border: "2px solid rgba(52,211,153,0.65)",
        }}
      />

      {/* Bulle de coachmark */}
      <div
        className="fixed w-[300px] rounded-2xl border border-emerald-500/30 bg-[#0e1f18] shadow-[0_18px_40px_-12px_rgba(0,0,0,0.6)] p-5 transition-all duration-200 ease-out"
        style={{ top: bubbleTop, left: bubbleLeft }}
      >
        {/* Flèche pointant vers l'élément (à gauche de la bulle) */}
        <div
          className="absolute w-3 h-3 -left-[7px] rotate-45 bg-[#0e1f18] border-l border-b border-emerald-500/30"
          style={{ top: arrowTop }}
        />

        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400/80">
            Étape {stepIndex + 1}/{totalSteps}
          </span>
          <button
            onClick={skip}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 transition font-medium"
          >
            Passer le tutoriel
          </button>
        </div>

        <h3 className="text-[14px] font-semibold text-emerald-50 mb-1.5">{step.title}</h3>
        <p className="text-[12.5px] text-emerald-100/70 leading-relaxed mb-4">{step.body}</p>

        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            {ONBOARDING_STEPS.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all ${
                  i === stepIndex ? "w-4 bg-emerald-400" : "w-1.5 bg-emerald-500/25"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                onClick={prev}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium text-emerald-200/80 hover:bg-emerald-500/10 transition"
              >
                Précédent
              </button>
            )}
            <button
              onClick={next}
              className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold text-[#052e1c] bg-emerald-400 hover:bg-emerald-300 transition"
            >
              {stepIndex + 1 === totalSteps ? "Terminer" : "Suivant"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
