"use client";

import { useEffect, useRef, useState } from "react";
import { MockupDesktop, MockupMobile } from "./DashboardMockup";

/* Mockup du hero : un laptop qui s'ouvre, puis un téléphone qui monte à côté.
 *
 * Tout est en CSS, aucune image. La scène est dessinée à taille fixe (980×540) puis réduite
 * par transform:scale pour tenir dans la place que lui laisse la grille du hero — la seule
 * mesure dont le JS a réellement besoin.
 *
 * La maquette réduisait en plus la typo du hero par itérations (heroFit) pour forcer une
 * hauteur de 100dvh exactement, au prix d'un rognage si le viewport était très plat. Remplacé
 * par un min-height côté app/page.tsx : la section remplit l'écran sur un format normal et
 * s'allonge au lieu de rogner sur un écran bas. Moins de code, et plus rien ne peut être coupé. */

const SCENE_W = 980;
const SCENE_H = 540;

/** Durée totale de la séquence : capot 200→1300 ms, téléphone 1200→1900 ms. */
const FIN_MS = 2000;

type Phase = "attente" | "joue" | "fini";

export default function HeroDevices() {
  const boiteRef = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.6);
  const [phase, setPhase] = useState<Phase>("attente");
  const [sobre, setSobre] = useState(false);

  // Échelle : on remplit la boîte sans jamais déborder, donc le min des deux ratios.
  useEffect(() => {
    const boite = boiteRef.current;
    if (!boite) return;
    const mesure = () => {
      const { clientWidth: w, clientHeight: h } = boite;
      if (!w || !h) return;
      setK((prev) => {
        const next = Math.max(0.1, Math.min(w / SCENE_W, h / SCENE_H));
        return Math.abs(next - prev) > 0.002 ? next : prev;
      });
    };
    mesure();
    const ro = new ResizeObserver(mesure);
    ro.observe(boite);
    return () => ro.disconnect();
  }, []);

  // Démarrage différé : on attend les polices pour que le mockup ne se recompose pas
  // pendant l'ouverture du capot, et on ne lance rien si l'onglet est en arrière-plan.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // setState différé plutôt qu'en synchrone dans le corps de l'effet, pour éviter le
      // re-render en cascade (react-hooks/set-state-in-effect) — même pattern que Sidebar.tsx.
      queueMicrotask(() => {
        setSobre(true);
        setPhase("fini");
      });
      return;
    }

    let annule = false;
    let tFin: number | undefined;
    const lance = () => {
      if (annule) return;
      setPhase("joue");
      tFin = window.setTimeout(() => !annule && setPhase("fini"), FIN_MS);
    };

    const quandPret = () => {
      if (annule) return;
      if (document.visibilityState === "hidden") {
        document.addEventListener("visibilitychange", quandPret, { once: true });
        return;
      }
      (document.fonts?.ready ?? Promise.resolve()).then(() => window.setTimeout(lance, 150));
    };
    quandPret();

    // Garde-fou : si les polices ne résolvent jamais, la scène s'anime quand même.
    const tSecours = window.setTimeout(lance, 2500);

    return () => {
      annule = true;
      window.clearTimeout(tFin);
      window.clearTimeout(tSecours);
    };
  }, []);

  /** `both` + delay négatif n'est pas utilisé ici : la phase « attente » garde l'état initial
   *  via `paused`, ce qui évite un flash de la scène ouverte avant le départ. */
  const a = (nom: string, duree: number, ease: string, delai: number) =>
    phase === "fini" ? undefined : `${nom} ${duree}ms ${ease} ${delai}ms both${phase === "attente" ? " paused" : ""}`;

  const EASE_LID = "cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div ref={boiteRef} className="flex h-full min-h-0 w-full min-w-0 items-center justify-center overflow-hidden">
      <div style={{ perspective: "1200px", perspectiveOrigin: "50% 487px" }}>
        <div
          className="relative"
          style={{
            width: SCENE_W,
            height: SCENE_H,
            transform: `scale(${k})`,
            transformStyle: "preserve-3d",
            ["--dv-rise-y" as string]: `${Math.round(60 / Math.max(k, 0.2))}px`,
          }}
        >
          {/* Ombres portées : elles s'élargissent avec l'ouverture du capot. */}
          <div
            aria-hidden
            className="absolute rounded-[50%]"
            style={{
              left: 30, top: 494, width: 720, height: 30,
              background: "radial-gradient(closest-side, rgba(20,20,30,0.14), rgba(20,20,30,0))",
              animation: a("dv-shadow", 1100, EASE_LID, 200),
            }}
          />
          <div
            aria-hidden
            className="absolute rounded-[50%]"
            style={{
              left: 782, top: 494, width: 200, height: 24,
              background: "radial-gradient(closest-side, rgba(20,20,30,0.14), rgba(20,20,30,0))",
              animation: a("dv-fade", 700, "ease-out", 1200),
            }}
          />

          {/* Capot : pivote depuis sa charnière basse. */}
          <div
            className="absolute box-border"
            style={{
              left: 20, top: 20, width: 720, height: 468,
              transformOrigin: "50% 100%",
              animation: a("dv-lid", 1100, EASE_LID, 200),
              borderRadius: "18px 18px 6px 6px",
              background: "#d6d6db",
              padding: 2,
              boxShadow: "inset 0 0 0 1px #c2c2c8",
            }}
          >
            <div
              className="box-border h-full w-full"
              style={{ borderRadius: "16px 16px 4px 4px", background: "#141416", padding: "9px 9px 13px" }}
            >
              <div className="relative overflow-hidden rounded-[3px] bg-white" style={{ width: 700, height: 438 }}>
                <MockupDesktop largeur={700} hauteur={438} />
                {!sobre && phase !== "fini" && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 50%, rgba(255,255,255,0) 100%)",
                      animation: a("dv-glare", 900, "ease-out", 450),
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Tranche du capot fermé : disparaît dès que l'ouverture commence. */}
          {!sobre && phase !== "fini" && (
            <div
              aria-hidden
              className="absolute box-border"
              style={{
                left: 22, top: 476, width: 716, height: 11,
                borderRadius: "7px 7px 1px 1px",
                background: "linear-gradient(#ececef,#cfcfd5)",
                boxShadow: "inset 0 0 0 1px #c2c2c8",
                animation: a("dv-off", 180, "ease-out", 260),
              }}
            />
          )}

          {/* Socle */}
          <div
            aria-hidden
            className="absolute"
            style={{
              left: 0, top: 487, width: 760, height: 17,
              borderRadius: "2px 2px 12px 12px",
              background: "linear-gradient(#f0f0f2,#c8c8ce)",
              boxShadow: "0 1px 0 #b9b9bf",
            }}
          />

          {/* Téléphone */}
          <div
            className="absolute box-border"
            style={{
              left: 798, top: 164, width: 168, height: 340,
              animation: a("dv-rise", 700, "cubic-bezier(0.34, 1.56, 0.64, 1)", 1200),
              borderRadius: 30,
              background: "#c9c9cf",
              padding: 2,
              boxShadow: "inset 0 0 0 1px #b3b3ba",
            }}
          >
            <div className="box-border h-full w-full" style={{ borderRadius: 28, background: "#111114", padding: 3 }}>
              <div className="overflow-hidden rounded-[25px] bg-white" style={{ width: 158, height: 330 }}>
                <MockupMobile largeur={158} hauteur={330} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
