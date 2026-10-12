"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

/* Section « Comment ça marche » : six cartes blanches sur fond sombre, reliées par un câble
 * qui se remplit au scroll.
 *
 * Le tracé ne peut pas être écrit en dur : les cartes ont des largeurs différentes et
 * alternent gauche/droite, donc chaque segment part du bas d'une carte pour rejoindre le haut
 * de la suivante avec un coude arrondi. On mesure donc les offsets (insensibles aux transform
 * du reveal, contrairement à getBoundingClientRect) puis on génère les `d` des paths.
 *
 * Le remplissage est un stroke-dashoffset piloté par le scroll, pas une animation : la
 * progression doit pouvoir repartir en arrière quand on remonte. */

const LARGEURS = [56, 64, 54, 58, 52, 58] as const;
const RAYON = 24;
/** Décalage vertical du point d'arrivée dans la carte suivante : la hauteur approximative de
 *  son en-tête, pour que le câble arrive à côté du libellé « Étape N » et non sur son bord. */
const ANCRE_Y = 72;

type Segment = { d: string; len: number; y1: number; y2: number };
type Point = { x: number; y: number; seg: number; sortie: boolean };
type Dispo = { segs: Segment[]; points: Point[]; mobile: boolean };

export default function ChaineSection() {
  const t = useTranslations("landing.chain");
  // Le CTA de fin de section reprend mot pour mot celui du hero : une seule sortie, une
  // seule promesse — d'où le second traducteur plutôt qu'une duplication des clés.
  const tHero = useTranslations("landing.hero");
  const chaineRef = useRef<HTMLDivElement>(null);

  const [dispo, setDispo] = useState<Dispo | null>(null);
  const [progres, setProgres] = useState<number[]>([]);
  const [active, setActive] = useState(-1);

  const calculeDispo = useCallback(() => {
    const conteneur = chaineRef.current;
    if (!conteneur) return;
    // Les cartes sont lues dans le DOM plutôt que via un tableau de refs : la mesure a lieu
    // dans un effet, donc après le commit, et ça évite douze refs pour six cartes.
    const cartes = Array.from(conteneur.querySelectorAll<HTMLElement>("[data-chain-card]"));
    const labels = Array.from(conteneur.querySelectorAll<HTMLElement>("[data-chain-label]"));
    if (cartes.length < 6 || labels.length < 6) return;

    const mobile = conteneur.offsetWidth < 768;
    const segs: Segment[] = [];
    const points: Point[] = [];

    if (mobile) {
      // Un seul rail vertical dans la gouttière, aligné sur le centre de chaque libellé.
      const x = 12;
      const ys = cartes.map((c, i) => c.offsetTop + labels[i].offsetTop + labels[i].offsetHeight / 2);
      ys.forEach((y, i) => points.push({ x, y, seg: i === 0 ? 0 : i - 1, sortie: i === 0 }));
      for (let i = 0; i < 5; i++) {
        segs.push({ d: `M${x} ${ys[i]} V${ys[i + 1]}`, len: ys[i + 1] - ys[i], y1: ys[i], y2: ys[i + 1] });
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const A = cartes[i];
        const B = cartes[i + 1];
        const aG = A.offsetLeft;
        const aD = aG + A.offsetWidth;
        const bG = B.offsetLeft;
        const bD = bG + B.offsetWidth;
        const y1 = A.offsetTop + A.offsetHeight;
        const y2 = B.offsetTop + ANCRE_Y;

        let x1: number;
        let x2: number;
        let d: string;
        if (aG < bG) {
          // La carte suivante est à droite : on descend puis on coude vers la droite.
          x1 = Math.round(aG + (bG - aG) * 0.6);
          x2 = bG;
          d = `M${x1} ${y1} V${y2 - RAYON} A${RAYON} ${RAYON} 0 0 0 ${x1 + RAYON} ${y2} H${x2}`;
        } else {
          x1 = Math.round(bD + (aD - bD) * 0.4);
          x2 = bD;
          d = `M${x1} ${y1} V${y2 - RAYON} A${RAYON} ${RAYON} 0 0 1 ${x1 - RAYON} ${y2} H${x2}`;
        }
        const len = y2 - RAYON - y1 + (Math.PI * RAYON) / 2 + (Math.abs(x2 - x1) - RAYON);
        segs.push({ d, len, y1, y2 });
        points.push({ x: x1, y: y1, seg: i, sortie: true }, { x: x2, y: y2, seg: i, sortie: false });
      }
    }

    setDispo((prev) => {
      const cle = JSON.stringify(segs.map((s) => s.d));
      const cleP = prev ? JSON.stringify(prev.segs.map((s) => s.d)) : "";
      return cle === cleP && prev?.mobile === mobile ? prev : { segs, points, mobile };
    });
  }, []);

  const calculeProgres = useCallback(() => {
    const conteneur = chaineRef.current;
    if (!conteneur || !dispo) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setProgres(dispo.segs.map(() => 1));
      setActive(5);
      return;
    }

    const haut = conteneur.getBoundingClientRect().top;
    const ancre = window.innerHeight * 0.6;
    const p = dispo.segs.map((s) =>
      Math.max(0, Math.min(1, (ancre - (haut + s.y1)) / Math.max(1, s.y2 - s.y1)))
    );

    // Carte active = celle dont le centre est le plus proche du centre du viewport, et
    // seulement si elle en est assez proche : sinon aucune n'est mise en avant.
    let meilleure = -1;
    let distMin = Infinity;
    conteneur.querySelectorAll<HTMLElement>("[data-chain-card]").forEach((c, i) => {
      const b = c.getBoundingClientRect();
      const d = Math.abs(b.top + b.height / 2 - window.innerHeight / 2);
      if (d < distMin) {
        distMin = d;
        meilleure = i;
      }
    });

    setProgres(p);
    setActive(distMin < window.innerHeight * 0.6 ? meilleure : -1);
  }, [dispo]);

  useEffect(() => {
    // setState différé (microtask) plutôt qu'en synchrone dans le corps de l'effet pour
    // éviter le re-render en cascade (react-hooks/set-state-in-effect) — même pattern que
    // components/Sidebar.tsx. Une microtask passe avant le paint : rien n'est visible entre
    // les deux, la mesure reste immédiate.
    queueMicrotask(calculeDispo);
    const conteneur = chaineRef.current;
    const ro = new ResizeObserver(calculeDispo);
    if (conteneur) ro.observe(conteneur);
    window.addEventListener("resize", calculeDispo);
    if (document.fonts?.ready) void document.fonts.ready.then(calculeDispo);
    const t0 = window.setTimeout(calculeDispo, 120);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", calculeDispo);
      window.clearTimeout(t0);
    };
  }, [calculeDispo]);

  useEffect(() => {
    queueMicrotask(calculeProgres);
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        calculeProgres();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [calculeProgres]);

  const mobile = dispo?.mobile ?? false;
  const segs = dispo?.segs ?? [];
  const points = dispo?.points ?? [];

  const carte = (i: number) => {
    const estActive = active === i;
    return {
      "data-chain-card": "",
      "data-rv": i % 2 === 0 ? "left" : "right",
      className: `relative z-[2] box-border max-w-full overflow-hidden rounded-[20px] bg-white transition-[border-color,box-shadow] duration-[350ms] ${
        i % 2 === 0 ? "self-start" : "self-end"
      }`,
      style: {
        "--dl": "0ms",
        width: mobile ? "100%" : `${LARGEURS[i]}%`,
        marginTop: i === 0 ? 0 : mobile ? 20 : 56,
        border: `1px solid ${estActive ? "#7C3AED" : "#E9E9EE"}`,
        boxShadow: estActive
          ? "0 0 0 1px #7C3AED, 0 0 0 6px rgba(139,92,246,0.22), 0 0 48px rgba(139,92,246,0.45), 0 30px 70px -24px rgba(124,58,237,0.3)"
          : "0 30px 70px -24px rgba(124,58,237,0.15), 0 12px 32px -16px rgba(0,0,0,0.55)",
      } as React.CSSProperties,
    };
  };

  const label = (i: number) => (
    <div data-chain-label="" className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7C3AED]">
      {t("step", { n: i + 1 })}
    </div>
  );

  const titre = "mt-3 text-[clamp(24px,2.4cqw,34px)] font-normal leading-[1.15] tracking-[-0.02em] text-[#111]";
  const corps = "mt-3 max-w-[520px] text-[16px] leading-[1.6] text-[#52525B]";
  const pad = mobile ? "px-5 pb-6 pt-[22px]" : "px-9 pb-9 pt-8";

  return (
    <section
      id="how"
      className="relative z-[1] -mt-px box-border text-[#F5F4F8]"
      style={{
        backgroundColor: "#0B0A0F",
        backgroundImage:
          "radial-gradient(ellipse 85% 75% at 50% 50%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.5) 100%)",
        padding: mobile ? "72px 16px" : "120px 64px",
        scrollMarginTop: "var(--dv-nav-h)",
      }}
    >
      <div className="mx-auto max-w-[760px] text-center">
        <div data-rv="up" style={{ "--dl": "0ms" } as React.CSSProperties} className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[#8B5CF6]">
          {t("eyebrow")}
        </div>
        <h2
          data-rv="up"
          style={{ "--dl": "80ms" } as React.CSSProperties}
          className="mt-3.5 text-[clamp(34px,4cqw,58px)] font-normal leading-[1.06] tracking-[-0.035em] text-[#F5F4F8]"
        >
          {t("title")}
        </h2>
        <p data-rv="up" style={{ "--dl": "160ms" } as React.CSSProperties} className="mt-4 text-[18px] leading-[1.5] text-[#A1A1AA]">
          {t("subtitle")}
        </p>
      </div>

      <div
        ref={chaineRef}
        className="relative mx-auto flex flex-col"
        style={{ maxWidth: 1120, marginTop: mobile ? 40 : 72, paddingLeft: mobile ? 24 : 0 }}
      >
        {/* Le câble. aria-hidden : c'est une illustration de la continuité du parcours,
            l'ordre des étapes est déjà porté par les libellés « Étape N ». */}
        <svg aria-hidden className="pointer-events-none absolute left-0 top-0 z-[1] h-full w-full overflow-visible">
          <defs>
            <filter id="dv-chain-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
          </defs>
          {segs.map((s, i) => {
            const off = s.len * (1 - (progres[i] ?? 0));
            return (
              <g key={i}>
                <path d={s.d} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="2" />
                <path
                  d={s.d}
                  fill="none"
                  stroke="#7C3AED"
                  strokeWidth="7"
                  strokeLinecap="round"
                  opacity="0.75"
                  filter="url(#dv-chain-glow)"
                  strokeDasharray={`${s.len} ${s.len}`}
                  strokeDashoffset={off}
                />
                <path
                  d={s.d}
                  fill="none"
                  stroke="#8B5CF6"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray={`${s.len} ${s.len}`}
                  strokeDashoffset={off}
                />
              </g>
            );
          })}
        </svg>

        {points.map((pt, i) => {
          const v = progres[pt.seg] ?? 0;
          const allume = pt.sortie ? v > 0 : v >= 0.999;
          return (
            <span
              key={i}
              aria-hidden
              className="absolute z-[3] h-2.5 w-2.5 rounded-full transition-[background,box-shadow] duration-[250ms]"
              style={{
                left: pt.x - 5,
                top: pt.y - 5,
                background: allume ? "#C4B5FD" : "#2E2B38",
                boxShadow: allume
                  ? "0 0 0 3px rgba(124,58,237,0.3), 0 0 14px rgba(139,92,246,0.95)"
                  : "0 0 0 1px rgba(255,255,255,0.1)",
              }}
            />
          );
        })}

        {/* ── Étape 1 — recherche produit ───────────────────────────────── */}
        <div {...carte(0)}>
          <div className="flex items-center gap-2 border-b border-[#EEEEF1] bg-[#F4F4F5] px-[18px] py-[14px]">
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <span key={c} className="h-[11px] w-[11px] rounded-full" style={{ background: c }} />
            ))}
            <span className="ml-3 h-[22px] flex-1 rounded-[7px] bg-[#E4E4E7]" />
          </div>
          <div className={pad}>
            {label(0)}
            <h3 className={titre}>{t("s1Title")}</h3>
            <p className={corps}>{t("s1Body")}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {(["s1F1", "s1F2", "s1F3", "s1F4"] as const).map((k) => (
                <span key={k} className="whitespace-nowrap rounded-full border border-[#E1E1E6] px-3 py-1.5 text-[13px] text-[#333]">
                  {t(k)}
                </span>
              ))}
            </div>
            <div className="dv-mono mt-4 border-t border-[#ECECF0] pt-4 text-sm leading-[1.5] tabular-nums text-[#333]">
              {t("s1Result", { n: 47 })}
            </div>
          </div>
        </div>

        {/* ── Étape 2 — marge nette ─────────────────────────────────────── */}
        <div {...carte(1)}>
          <div className={pad}>
            <div className="flex flex-wrap items-start gap-x-11 gap-y-7">
              <div className="min-w-0 flex-[1_1_240px]">
                {label(1)}
                <h3 className={titre}>{t("s2Title")}</h3>
                <p className={corps}>{t("s2Body")}</p>
              </div>
              <div className="min-w-0 flex-[1.25_1_300px]">
                {([["s2Sale", "39,90 €"], ["s2Cost", "−11,40 €"], ["s2Fees", "−1,46 €"]] as const).map(([k, v]) => (
                  <div key={k} className="flex items-baseline gap-2.5 py-2.5 text-[15px] leading-[1.35]">
                    <span className="min-w-0 text-[#333]">{t(k)}</span>
                    <span className="min-w-[12px] flex-[1_1_12px] border-b border-dotted border-[#C9C9D1]" />
                    <span className="flex-none text-right tabular-nums text-[#111]">{v}</span>
                  </div>
                ))}
                <div className="flex items-baseline gap-2.5 py-2.5 text-[15px] leading-[1.35]">
                  <span className="min-w-0 text-[#333]">{t("s2Tax")}</span>
                  <span className="min-w-[12px] flex-[1_1_12px] border-b border-dotted border-[#C9C9D1]" />
                  <span className="flex-none text-right text-[#52525B]">{t("s2TaxVal")}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-2.5 border-t border-[#E1E1E6] pb-2.5 pt-3 text-[15px]">
                  <span className="text-[#52525B]">{t("s2Gross")}</span>
                  <span className="flex-1" />
                  <span className="tabular-nums text-[#6B6B75] line-through">28,50 €</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 pt-1.5">
                  <span className="text-[16px] font-medium text-[#111]">{t("s2Net")}</span>
                  <span className="text-[clamp(38px,3.6cqw,52px)] font-medium leading-none tracking-[-0.03em] tabular-nums text-[#7C3AED]">
                    27,04 €
                  </span>
                </div>
                <div className="mt-2.5 text-right text-[13px] text-[#52525B]">{t("s2Illustrative")}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Étape 3 — audit IA ────────────────────────────────────────── */}
        <div {...carte(2)}>
          <div className={pad}>
            {label(2)}
            <h3 className={titre}>{t("s3Title")}</h3>
            <p className={corps}>{t("s3Body")}</p>
            <div className="mt-6 flex items-baseline gap-1.5 tabular-nums">
              <span className="text-[clamp(68px,7cqw,104px)] font-light leading-[0.9] tracking-[-0.05em] text-[#111]">64</span>
              <span className="text-[26px] text-[#52525B]">/100</span>
            </div>
            <div className="mt-[18px] border-t border-[#ECECF0]">
              {([["s3Fix1", "+12"], ["s3Fix2", "+7"], ["s3Fix3", "+4"]] as const).map(([k, v], i) => (
                <div
                  key={k}
                  className={`flex items-baseline gap-4 py-3 text-[15px] leading-[1.4] ${i ? "border-t border-[#ECECF0]" : ""}`}
                >
                  <span className="min-w-0 flex-1 text-[#111]">{t(k)}</span>
                  <span className="flex-none font-semibold tabular-nums text-[#7C3AED]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Étape 4 — génération du site ──────────────────────────────── */}
        <div {...carte(3)}>
          <div className={pad}>
            <div className="flex flex-wrap items-start gap-x-9 gap-y-6">
              <div className="min-w-0 flex-[1_1_220px]">
                {label(3)}
                <h3 className={titre}>{t("s4Title")}</h3>
                <p className={corps}>{t("s4Body")}</p>
              </div>
              <ul className="m-0 flex min-w-0 flex-[1_1_240px] list-none flex-col gap-2 p-0" aria-label={t("s4Legend")}>
                {(
                  [
                    ["s4T1", ["#0F172A", "#38BDF8", "#E2E8F0"], true],
                    ["s4T2", ["#8B6F4E", "#E9DFD3", "#2F3E36"], false],
                    ["s4T3", ["#E8B4B8", "#F6EDEA", "#6B3E4A"], false],
                    ["s4T4", ["#111111", "#F59E0B", "#F5F5F4"], false],
                  ] as const
                ).map(([k, couleurs, actif]) => (
                  <li
                    key={k}
                    className="flex items-center gap-3 rounded-xl px-[14px] py-3"
                    style={
                      actif
                        ? { border: "1px solid #8B5CF6", background: "rgba(124,58,237,0.06)", boxShadow: "0 0 18px rgba(124,58,237,0.28)" }
                        : { border: "1px solid #E1E1E6" }
                    }
                  >
                    <span
                      aria-hidden
                      className="grid h-[18px] w-[18px] flex-none place-items-center rounded-full border-[1.5px]"
                      style={{ borderColor: actif ? "#7C3AED" : "#B5B5BE" }}
                    >
                      {actif && <span className="h-2 w-2 rounded-full bg-[#7C3AED]" />}
                    </span>
                    <span className={`min-w-0 flex-1 text-[15px] ${actif ? "text-[#111]" : "text-[#52525B]"}`}>{t(k)}</span>
                    <span aria-hidden className="flex gap-1">
                      {couleurs.map((c) => (
                        <span
                          key={c}
                          className="h-[14px] w-[14px] rounded-[3px]"
                          style={{ background: c, boxShadow: "inset 0 0 0 1px rgba(17,17,17,0.12)" }}
                        />
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Étape 5 — commandes ───────────────────────────────────────── */}
        <div {...carte(4)}>
          <div className={pad}>
            {label(4)}
            <h3 className={titre}>{t("s5Title")}</h3>
            <p className={corps}>{t("s5Body")}</p>
            <div className="mt-5 border-t border-[#ECECF0]">
              {(
                [
                  ["#1042", "s5St1", "bg-[#F3EEFF] text-[#6D28D9]"],
                  ["#1043", "s5St2", "bg-[#E7F7EF] text-[#047857]"],
                  ["#1044", "s5St3", "border border-[#C9C9D1] text-[#111]"],
                ] as const
              ).map(([num, k, style], i) => (
                <div key={num} className={`flex items-center justify-between gap-3 py-3 ${i ? "border-t border-[#ECECF0]" : ""}`}>
                  <span className="dv-mono text-[15px] text-[#111]">{num}</span>
                  <span className={`rounded-full px-2.5 py-1 text-[13px] font-medium ${style}`}>{t(k)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Étape 6 — suivi poussé vers Shopify + sortie ──────────────── */}
        <div {...carte(5)}>
          <div className={pad}>
            {label(5)}
            <h3 className={titre}>{t("s6Title")}</h3>
            <p className={corps}>{t("s6Body")}</p>

            <ol className="relative m-0 mt-7 grid list-none grid-cols-4 gap-1 p-0">
              <span aria-hidden className="absolute left-[12.5%] right-[37.5%] top-[5.5px] h-px bg-[#E1E1E6]" />
              <span
                aria-hidden
                className="absolute right-[12.5%] top-[5.5px] h-px"
                style={{ left: "62.5%", background: "linear-gradient(90deg, #E1E1E6, #8B5CF6)" }}
              />
              {(["s6P1", "s6P2", "s6P3", "s6P4"] as const).map((k, i) => {
                const dernier = i === 3;
                return (
                  <li key={k} className="flex min-w-0 flex-col items-center gap-2.5 text-center">
                    <span
                      aria-hidden
                      className="relative z-[1] h-3 w-3 rounded-full"
                      style={
                        dernier
                          ? { background: "#7C3AED", boxShadow: "0 0 0 4px rgba(124,58,237,0.22), 0 0 16px rgba(139,92,246,0.9)" }
                          : { background: "#D4D4D8" }
                      }
                    />
                    <span className={`text-[13px] leading-[1.3] ${dernier ? "font-medium text-[#111]" : "text-[#52525B]"}`}>
                      {t(k)}
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-8 flex flex-col items-start gap-3">
              <Link
                href="/register"
                className="rounded-[10px] bg-[#7c3aed] px-[22px] py-[15px] text-[16px] font-semibold text-white no-underline transition-colors hover:bg-[#8b5cf6] hover:text-white"
                style={{ boxShadow: "0 0 24px rgba(124,58,237,0.35)" }}
              >
                {tHero("ctaPrimary")}
              </Link>
              <p className="m-0 text-sm leading-[1.45] text-[#52525B]">{tHero("note")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
