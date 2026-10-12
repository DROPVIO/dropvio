"use client";

import { useTranslations } from "next-intl";

/* Miniature décorative du dashboard, rendue dans l'écran du laptop et du téléphone du hero.
 *
 * Construite à sa taille réelle (1280×800 / 375×783) puis réduite par transform:scale, pour que
 * la typo et les espacements se calculent comme dans la vraie app plutôt que d'être dessinés
 * à la main en 6px. La maquette utilisait la propriété `zoom` : scale() donne le même rendu
 * et est supporté partout.
 *
 * Palette volontairement figée (#0d0d14 / #13131f / accent #7c3aed) : c'est une « capture »
 * du thème sombre de l'app, elle ne doit pas suivre le thème de la landing.
 *
 * Les noms de produits restent en anglais (noms de catalogue AliExpress). Les libellés d'axe
 * du graphique de la maquette (« Aug 28 »…) sont retirés : à 55 % d'échelle ils sont
 * illisibles, et les rendre dépendants de la date créerait un écart serveur/client. */

const STATS = [
  { k: "statMargin", sub: "statMarginSub", v: "24,8 %", c: "#a78bfa" },
  { k: "statStores", sub: "statStoresSub", v: "3", c: "#60a5fa" },
  { k: "statScore", sub: "statScoreSub", v: "72", c: "#34d399" },
  { k: "statProducts", sub: "statProductsSub", v: "18", c: "#fbbf24" },
] as const;

const RECENTS = [
  { nom: "Aurora Sunset Lamp", gain: "12,60 €", pct: "31,6 %", ok: true },
  { nom: "Magnetic Phone Mount", gain: "8,10 €", pct: "27,9 %", ok: true },
  { nom: "Heated Eye Mask", gain: "6,40 €", pct: "19,2 %", ok: true },
  { nom: "Posture Corrector", gain: "4,20 €", pct: "14,0 %", ok: null },
  { nom: "LED Strip 5m", gain: "−1,30 €", pct: "−5,4 %", ok: false },
] as const;

const COURBE = "M0 92 L30 86 L60 88 L90 74 L120 70 L150 62 L180 64 L210 50 L240 44 L270 40 L300 32";

function couleurGain(ok: boolean | null) {
  return ok === true ? "#15803d" : ok === null ? "#b45309" : "#b91c1c";
}

function Sparkline({ h }: { h: number }) {
  return (
    <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="block w-full" style={{ height: h }} aria-hidden>
      {[11, 23, 34].map((y) => (
        <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
      ))}
      <path d={`${COURBE} L300 120 L0 120 Z`} fill="rgba(124,58,237,0.18)" />
      <path d={COURBE} fill="none" stroke="#a78bfa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx="300" cy="32" r="2.4" fill="#a78bfa" />
    </svg>
  );
}

function LigneRecente({ r, bordure }: { r: (typeof RECENTS)[number]; bordure: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-[11px] ${bordure ? "border-t border-white/[0.06]" : ""}`}>
      <span className="h-[30px] w-[30px] flex-none rounded-[7px] bg-white/[0.06]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-white">{r.nom}</div>
        <div className="text-[11px] text-white/40">AliExpress</div>
      </div>
      <div className="text-right tabular-nums">
        <div className="text-[13px] font-semibold" style={{ color: couleurGain(r.ok) }}>{r.gain}</div>
        <div className="text-[11px] text-white/40">{r.pct}</div>
      </div>
    </div>
  );
}

/** Variante desktop : 1280×800, réduite pour tenir dans l'écran du laptop. */
export function MockupDesktop({ largeur, hauteur }: { largeur: number; hauteur: number }) {
  const t = useTranslations("landing.mockup");
  const k = largeur / 1280;

  return (
    <div style={{ width: largeur, height: hauteur, overflow: "hidden" }}>
      <div
        style={{ width: 1280, height: 800, transform: `scale(${k})`, transformOrigin: "top left" }}
        className="flex flex-col bg-white font-[family-name:var(--font-geist-sans)] text-[#111]"
      >
        {/* Chrome du navigateur */}
        <div className="flex h-10 flex-none items-center gap-[7px] border-b border-[#e3e3e8] bg-[#f3f3f5] px-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[11px] w-[11px] rounded-full bg-[#d3d3d9]" />
          ))}
          <div className="mx-auto flex h-[26px] w-[420px] items-center justify-center rounded-[7px] border border-[#e3e3e8] bg-white text-[13px] text-[#555]">
            {t("url")}
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <div className="box-border flex w-[228px] flex-none flex-col gap-[3px] border-r border-[#ececf0] px-[14px] py-[18px]">
            <div className="flex items-center gap-[9px] px-1.5 pb-[18px]">
              <span className="h-6 w-6 rounded-[7px] bg-[#7c3aed]" />
              <span className="text-[17px] font-bold tracking-[-0.03em]">Dropvio</span>
            </div>
            <div className="flex items-center gap-[11px] rounded-[9px] bg-[#7c3aed]/10 px-3 py-[9px] text-sm font-semibold text-[#5b21b6]">
              <span className="h-4 w-4 flex-none rounded bg-[#7c3aed]" />
              {t("dashboard")}
            </div>
            {(["navProducts", "navMargin", "navAudit", "navBuilder", "navStores"] as const).map((key) => (
              <div key={key} className="flex items-center gap-[11px] rounded-[9px] px-3 py-[9px] text-sm text-[#555]">
                <span className="h-4 w-4 flex-none rounded bg-[#cfcfd8]" />
                {t(key)}
              </div>
            ))}
            <div className="mt-auto flex items-center gap-[11px] px-3 py-[9px] text-sm text-[#555]">
              <span className="h-4 w-4 flex-none rounded bg-[#cfcfd8]" />
              {t("navSettings")}
            </div>
          </div>

          {/* Contenu */}
          <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-hidden bg-[#f7f7f9] px-8 py-[30px]">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold">{t("dashboard")}</div>
                <div className="mt-1 text-sm text-[#8a8a94]">{t("lastDays")}</div>
              </div>
              <div className="rounded-[10px] bg-[#7c3aed] px-[14px] py-[9px] text-[13px] font-semibold text-white">
                {t("analyze")}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-[14px]">
              {STATS.map((s) => (
                <div key={s.k} className="rounded-xl border border-[#e6e6eb] bg-white px-4 py-[14px]">
                  <div className="text-xs text-[#6b6b75]">{t(s.k)}</div>
                  <div className="mt-1.5 text-[26px] font-bold leading-none tracking-[-0.02em] tabular-nums">{s.v}</div>
                  <div className="mt-0.5 text-[11px] text-[#8a8a94]">{t(s.sub)}</div>
                </div>
              ))}
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-[14px]">
              <div className="flex flex-col rounded-xl border border-[#e6e6eb] bg-white px-5 py-[18px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">{t("chart")}</span>
                  <span className="text-xs text-[#8a8a94]">%</span>
                </div>
                <div className="mt-[14px] flex flex-1 items-end">
                  <svg viewBox="0 0 300 120" preserveAspectRatio="none" className="block h-[300px] w-full" aria-hidden>
                    {[30, 60, 90].map((y) => (
                      <line key={y} x1="0" y1={y} x2="300" y2={y} stroke="#ececf0" />
                    ))}
                    <path d={`${COURBE} L300 120 L0 120 Z`} fill="rgba(124,58,237,0.08)" />
                    <path d={COURBE} fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  </svg>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#e6e6eb] bg-white px-5 py-[18px]">
                <div className="mb-1.5 text-sm font-semibold">{t("recent")}</div>
                {RECENTS.map((r, i) => (
                  <div key={r.nom} className={`flex items-center gap-3 py-[11px] ${i ? "border-t border-[#ececf0]" : ""}`}>
                    <span className="h-[30px] w-[30px] flex-none rounded-[7px] bg-[#f0f0f3]" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{r.nom}</div>
                      <div className="text-[11px] text-[#8a8a94]">AliExpress</div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="text-[13px] font-semibold" style={{ color: couleurGain(r.ok) }}>{r.gain}</div>
                      <div className="text-[11px] text-[#8a8a94]">{r.pct}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Variante mobile : 375×783, réduite pour tenir dans l'écran du téléphone. */
export function MockupMobile({ largeur, hauteur }: { largeur: number; hauteur: number }) {
  const t = useTranslations("landing.mockup");
  const k = largeur / 375;

  return (
    <div style={{ width: largeur, height: hauteur, overflow: "hidden" }}>
      <div
        style={{ width: 375, height: 783, transform: `scale(${k})`, transformOrigin: "top left" }}
        className="flex flex-col bg-[#0d0d14] font-[family-name:var(--font-geist-sans)] text-white"
      >
        <div className="flex h-11 flex-none items-center justify-between bg-[#13131f] px-[26px] text-sm font-semibold">
          <span>9:41</span>
          <span className="flex gap-1">
            <span className="h-2.5 w-4 rounded-sm bg-white" />
            <span className="box-border h-2.5 w-[22px] rounded-[3px] border-[1.5px] border-white" />
          </span>
        </div>

        <div className="flex flex-none items-center justify-between border-b border-white/[0.06] bg-[#13131f] px-[18px] pb-[14px] pt-2.5">
          <div className="flex items-center gap-2">
            <span className="h-[22px] w-[22px] rounded-md bg-[#7c3aed]" />
            <span className="text-[19px] font-bold">{t("dashboard")}</span>
          </div>
          <span className="h-7 w-7 rounded-full bg-white/[0.08]" />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
          <div className="grid grid-cols-2 gap-2.5">
            {STATS.map((s) => (
              <div key={s.k} className="rounded-xl border border-white/[0.07] bg-[#13131f] px-[14px] py-3">
                <div className="text-xs text-white/45">{t(s.k)}</div>
                <div className="mt-1 text-[22px] font-bold tabular-nums" style={{ color: s.c }}>{s.v}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#13131f] p-[14px]">
            <div className="mb-2.5 text-sm font-semibold">{t("chart")}</div>
            <Sparkline h={150} />
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-[#13131f] px-[14px] py-1.5">
            {RECENTS.slice(0, 2).map((r, i) => (
              <LigneRecente key={r.nom} r={r} bordure={i > 0} />
            ))}
          </div>
        </div>

        <div className="flex flex-none justify-around border-t border-white/[0.06] bg-[#13131f] px-1.5 pb-[26px] pt-2.5">
          {([["tabHome", true], ["navProducts", false], ["tabMargin", false], ["tabAudit", false], ["tabStores", false]] as const).map(
            ([key, actif]) => (
              <div
                key={key}
                className={`flex flex-col items-center gap-1 text-[10px] ${actif ? "font-semibold text-[#a78bfa]" : "text-white/45"}`}
              >
                <span className={`h-5 w-5 rounded-md ${actif ? "bg-[#7c3aed]" : "bg-white/20"}`} />
                {t(key)}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
