"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { isAppLocale, toIntlTag } from "@/lib/locale";
import { HEURE_MS, JOUR_MS, debutTranche, libelleTranche, pasPourPlage, trancheSuivante, tranches, type Pas } from "@/lib/temps-graphique";
import { useIsLightTheme } from "@/components/dashboard/useIsLightTheme";

// Tableau des ventes Shopify du dashboard (données : /api/dashboard/ventes). Chiffres clés de
// la période et comparaison avec la période précédente de même durée, ventes par produit,
// chiffre d'affaires total et par produit dans le temps. Zoom : molette sur une courbe
// (centré sur le curseur), glisser pour sélectionner une plage, vue d'ensemble en bas pour se
// déplacer, ou périodes prédéfinies. Le pas (heure, jour, semaine, mois) suit le zoom.

type VenteLigne = { produit: string; quantite: number; montant: number };
type Vente = { t: number; total: number; lignes: VenteLigne[] };

const PERIODES = [
  { cle: "24h", duree: JOUR_MS },
  { cle: "7j", duree: 7 * JOUR_MS },
  { cle: "30j", duree: 30 * JOUR_MS },
  { cle: "90j", duree: 90 * JOUR_MS },
  { cle: "1an", duree: 365 * JOUR_MS },
  { cle: "tout", duree: null },
] as const;

const COULEURS = ["#22d3ee", "#eab308", "#c084fc", "#2dd4bf", "#f472b6"];
const COULEUR_AUTRES = "#94a3b8";
const PRODUITS_MAX = 5;
// Marges du graphique : servent aussi à situer le curseur dans la zone tracée pour la molette.
const MARGE_GAUCHE = 0;
const LARGEUR_AXE_Y = 56;
const ZOOM_MIN_MS = 2 * HEURE_MS;

type Point = { t: number; total: number; commandes: number } & Record<string, number>;

function variation(actuel: number, precedent: number): number | null {
  if (precedent === 0) return actuel === 0 ? 0 : null;
  return ((actuel - precedent) / precedent) * 100;
}

export default function VentesDashboard() {
  const t = useTranslations("dashboard.ventes");
  const locale = useLocale();
  const intlTag = toIntlTag(isAppLocale(locale) ? locale : "fr");
  const isLight = useIsLightTheme();

  const [ventes, setVentes] = useState<Vente[] | null>(null);
  const [devise, setDevise] = useState("EUR");
  const [erreur, setErreur] = useState(false);
  const [maintenant] = useState(() => Date.now());
  const [domaine, setDomaine] = useState<[number, number]>(() => [Date.now() - 30 * JOUR_MS, Date.now()]);
  const [periode, setPeriode] = useState<string | null>("30j");
  const [selection, setSelection] = useState<{ debut: number; fin: number } | null>(null);
  // Change quand le domaine est modifié hors de la vue d'ensemble : remonte son Brush pour
  // qu'il reprenne la nouvelle plage.
  const [cleBrush, setCleBrush] = useState(0);

  useEffect(() => {
    fetch("/api/dashboard/ventes")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const json = (await r.json()) as { devise: string; ventes: Vente[] };
        setDevise(json.devise);
        setVentes(json.ventes);
      })
      .catch(() => setErreur(true));
  }, []);

  const argent = useMemo(() => {
    const f = new Intl.NumberFormat(intlTag, { style: "currency", currency: devise, maximumFractionDigits: 0 });
    const precis = new Intl.NumberFormat(intlTag, { style: "currency", currency: devise, maximumFractionDigits: 2 });
    const compact = new Intl.NumberFormat(intlTag, { style: "currency", currency: devise, notation: "compact", maximumFractionDigits: 1 });
    return { f, precis, compact };
  }, [intlTag, devise]);
  const entier = useMemo(() => new Intl.NumberFormat(intlTag), [intlTag]);

  const premiere = ventes && ventes.length > 0 ? ventes[0].t : maintenant - 30 * JOUR_MS;

  const changerDomaine = useCallback(
    (debut: number, fin: number, depuisBrush = false) => {
      const min = Math.min(premiere, maintenant - JOUR_MS);
      let d = Math.max(min, Math.min(debut, fin));
      let f = Math.min(maintenant, Math.max(debut, fin));
      if (f - d < ZOOM_MIN_MS) {
        const centre = (d + f) / 2;
        d = Math.max(min, centre - ZOOM_MIN_MS / 2);
        f = Math.min(maintenant, d + ZOOM_MIN_MS);
      }
      setDomaine([d, f]);
      setPeriode(null);
      if (!depuisBrush) setCleBrush((k) => k + 1);
    },
    [premiere, maintenant]
  );

  function choisirPeriode(cle: string, duree: number | null) {
    const debut = duree === null ? Math.min(premiere, maintenant - JOUR_MS) : maintenant - duree;
    setDomaine([debut, maintenant]);
    setPeriode(cle);
    setCleBrush((k) => k + 1);
  }

  const [debut, fin] = domaine;
  const pas: Pas = pasPourPlage(debut, fin);

  const calcul = useMemo(() => {
    const liste = ventes ?? [];
    const dans = liste.filter((v) => v.t >= debut && v.t <= fin);
    const duree = fin - debut;
    const avant = liste.filter((v) => v.t >= debut - duree && v.t < debut);

    const parProduit = new Map<string, { montant: number; quantite: number }>();
    for (const v of dans) {
      for (const l of v.lignes) {
        const p = parProduit.get(l.produit) ?? { montant: 0, quantite: 0 };
        p.montant += l.montant;
        p.quantite += l.quantite;
        parProduit.set(l.produit, p);
      }
    }
    const classement = [...parProduit].sort((a, b) => b[1].montant - a[1].montant);
    const principaux = classement.slice(0, PRODUITS_MAX).map(([nom]) => nom);
    const autres = classement.length > PRODUITS_MAX;
    const series = [
      ...principaux.map((nom, i) => ({ cle: `p${i}`, nom, couleur: COULEURS[i] })),
      ...(autres ? [{ cle: "autres", nom: t("autres"), couleur: COULEUR_AUTRES }] : []),
    ];
    const cleDe = new Map(principaux.map((nom, i) => [nom, `p${i}`]));

    const points: Point[] = tranches(debut, fin, pas).map((tt) => {
      const p = { t: tt, total: 0, commandes: 0 } as Point;
      for (const s of series) p[s.cle] = 0;
      return p;
    });
    const indexDe = new Map(points.map((p, i) => [p.t, i]));
    for (const v of dans) {
      const i = indexDe.get(debutTranche(v.t, pas));
      if (i === undefined) continue;
      points[i].total += v.total;
      points[i].commandes += 1;
      for (const l of v.lignes) {
        const cle = cleDe.get(l.produit) ?? "autres";
        if (cle in points[i]) points[i][cle] += l.montant;
      }
    }

    const somme = (vs: Vente[]) => vs.reduce((s, v) => s + v.total, 0);
    const unites = (vs: Vente[]) => vs.reduce((s, v) => s + v.lignes.reduce((a, l) => a + l.quantite, 0), 0);
    const ca = somme(dans);
    const caAvant = somme(avant);
    const u = unites(dans);
    const uAvant = unites(avant);
    return {
      points,
      series,
      barres: classement.slice(0, PRODUITS_MAX).map(([nom, v], i) => ({ nom, ...v, couleur: COULEURS[i] })),
      kpi: {
        ca,
        caVar: variation(ca, caAvant),
        unites: u,
        unitesVar: variation(u, uAvant),
        commandes: dans.length,
        commandesVar: variation(dans.length, avant.length),
        panier: dans.length > 0 ? ca / dans.length : 0,
      },
    };
  }, [ventes, debut, fin, pas, t]);

  // Vue d'ensemble : tout l'historique au pas journalier, pour se déplacer avec le Brush.
  const ensemble = useMemo(() => {
    const debutEnsemble = Math.min(premiere, maintenant - 30 * JOUR_MS);
    const pts = tranches(debutEnsemble, maintenant, "jour").map((tt) => ({ t: tt, total: 0 }));
    const idx = new Map(pts.map((p, i) => [p.t, i]));
    for (const v of ventes ?? []) {
      const i = idx.get(debutTranche(v.t, "jour"));
      if (i !== undefined) pts[i].total += v.total;
    }
    return pts;
  }, [ventes, premiere, maintenant]);

  const brushDebut = Math.max(0, ensemble.findIndex((p) => p.t >= debutTranche(debut, "jour")));
  const indexFin = ensemble.findIndex((p) => p.t > fin);
  const brushFin = indexFin === -1 ? ensemble.length - 1 : Math.max(brushDebut, indexFin - 1);

  // Molette : zoom centré sur la position du curseur dans la zone tracée. Écouteur natif non
  // passif, pour empêcher la page de défiler pendant le zoom.
  const zoneTotal = useRef<HTMLDivElement>(null);
  const zoneProduits = useRef<HTMLDivElement>(null);
  const domaineRef = useRef(domaine);
  useEffect(() => {
    domaineRef.current = domaine;
  }, [domaine]);
  useEffect(() => {
    const zones = [zoneTotal.current, zoneProduits.current].filter((z): z is HTMLDivElement => Boolean(z));
    const surMolette = (e: WheelEvent) => {
      const zone = e.currentTarget as HTMLDivElement;
      const rect = zone.getBoundingClientRect();
      const largeur = rect.width - MARGE_GAUCHE - LARGEUR_AXE_Y - 8;
      if (largeur <= 0) return;
      e.preventDefault();
      const fraction = Math.min(1, Math.max(0, (e.clientX - rect.left - MARGE_GAUCHE - LARGEUR_AXE_Y) / largeur));
      const [d, f] = domaineRef.current;
      const curseur = d + (f - d) * fraction;
      const facteur = e.deltaY > 0 ? 1.25 : 0.8;
      const nouvelleDuree = (f - d) * facteur;
      changerDomaine(curseur - nouvelleDuree * fraction, curseur + nouvelleDuree * (1 - fraction));
    };
    zones.forEach((z) => z.addEventListener("wheel", surMolette, { passive: false }));
    return () => zones.forEach((z) => z.removeEventListener("wheel", surMolette));
  }, [changerDomaine, ventes]);

  // Glisser sur une courbe : sélection d'une plage, zoomée au relâchement.
  type EtatSouris = { activeTooltipIndex?: number | string | null } | null | undefined;
  const tDe = (etat: EtatSouris) => {
    const i = etat?.activeTooltipIndex;
    const n = typeof i === "number" ? i : typeof i === "string" ? Number(i) : NaN;
    return Number.isFinite(n) ? calcul.points[n]?.t : undefined;
  };
  const evenementsZoom = {
    onMouseDown: (etat: EtatSouris) => {
      const tt = tDe(etat);
      if (tt !== undefined) setSelection({ debut: tt, fin: tt });
    },
    onMouseMove: (etat: EtatSouris) => {
      const tt = tDe(etat);
      if (selection && tt !== undefined) setSelection({ ...selection, fin: tt });
    },
    onMouseUp: () => {
      if (selection && selection.debut !== selection.fin) {
        const a = Math.min(selection.debut, selection.fin);
        const b = Math.max(selection.debut, selection.fin);
        changerDomaine(a, trancheSuivante(b, pas));
      }
      setSelection(null);
    },
    onMouseLeave: () => setSelection(null),
  };

  const grille = isLight ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.06)";
  const axe = isLight ? "#71717a" : "#71717a";
  const fondTooltip = "var(--surface)";
  const libelleAxe = (v: number) => libelleTranche(v, pas, intlTag);

  const enTete = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-[var(--text-primary)]">{t("titre")}</p>
        <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("aide")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIODES.map((p) => (
          <button
            key={p.cle}
            type="button"
            onClick={() => choisirPeriode(p.cle, p.duree)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              periode === p.cle
                ? "bg-violet-600 text-white"
                : "border border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {t(`periodes.${p.cle}`)}
          </button>
        ))}
      </div>
    </div>
  );

  if (erreur) return null;

  if (ventes === null) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 h-[220px] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (ventes.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t("titre")}</p>
          <p className="text-[12px] text-[var(--text-faint)] mt-1">{t("vide")}</p>
        </div>
        <Link href="/dashboard/shopify" className="self-start rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500">
          {t("connecter")}
        </Link>
      </div>
    );
  }

  const { kpi, barres, series, points } = calcul;
  const maxBarreCa = Math.max(1, ...barres.map((b) => b.montant));
  const maxBarreUnites = Math.max(1, ...barres.map((b) => b.quantite));

  const tooltip = (afficherProduits: boolean) => (
    <Tooltip
      cursor={{ stroke: isLight ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.15)" }}
      content={({ active, payload }) => {
        if (!active || !payload?.length) return null;
        const p = payload[0].payload as Point;
        return (
          <div className="rounded-xl border border-[var(--border)] px-3 py-2.5 shadow-xl text-xs min-w-[180px]" style={{ background: fondTooltip }}>
            <p className="text-[10px] text-[var(--text-faint)] mb-1.5">
              {pas === "semaine" ? t("semaineDu", { date: libelleTranche(p.t, pas, intlTag, true) }) : libelleTranche(p.t, pas, intlTag, true)}
            </p>
            <p className="flex justify-between gap-4 font-semibold text-[var(--text-primary)]">
              <span>{t("total")}</span>
              <span>{argent.precis.format(p.total)}</span>
            </p>
            <p className="flex justify-between gap-4 text-[var(--text-muted)]">
              <span>{t("commandes")}</span>
              <span>{entier.format(p.commandes)}</span>
            </p>
            {afficherProduits
              ? series.map((s) => (
                  <p key={s.cle} className="flex justify-between gap-4 mt-0.5" style={{ color: s.couleur }}>
                    <span className="truncate max-w-[160px]">{s.nom}</span>
                    <span>{argent.precis.format(p[s.cle] ?? 0)}</span>
                  </p>
                ))
              : null}
          </div>
        );
      }}
    />
  );

  const xAxe = (
    <XAxis
      dataKey="t"
      type="number"
      scale="time"
      domain={[debutTranche(debut, pas), debutTranche(fin, pas)]}
      tickFormatter={libelleAxe}
      tick={{ fill: axe, fontSize: 10 }}
      axisLine={false}
      tickLine={false}
      minTickGap={28}
    />
  );
  const yAxe = (
    <YAxis
      tickFormatter={(v: number) => argent.compact.format(v)}
      tick={{ fill: axe, fontSize: 10 }}
      axisLine={false}
      tickLine={false}
      width={LARGEUR_AXE_Y}
    />
  );
  const zoneSelection = selection ? (
    <ReferenceArea x1={selection.debut} x2={selection.fin} fill="#7c3aed" fillOpacity={0.15} strokeOpacity={0} />
  ) : null;

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 flex flex-col gap-5">
      {enTete}

      {/* ── Chiffres clés et ventes par produit ─────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("ca")}</p>
          <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">{argent.f.format(kpi.ca)}</p>
          <Variation valeur={kpi.caVar} nouveau={t("nouveau")} vsAvant={t("vsAvant")} intlTag={intlTag} />
          <p className="text-[11px] text-[var(--text-faint)]">
            {t("panier", { montant: argent.precis.format(kpi.panier) })} · {t("nbCommandes", { count: kpi.commandes })}
          </p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)] mb-3">{t("caParProduit")}</p>
          <BarresProduits lignes={barres.map((b) => ({ nom: b.nom, valeur: b.montant, couleur: b.couleur, texte: argent.compact.format(b.montant) }))} max={maxBarreCa} vide={t("aucuneVente")} />
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col gap-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{t("unites")}</p>
          <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]">{entier.format(kpi.unites)}</p>
          <Variation valeur={kpi.unitesVar} nouveau={t("nouveau")} vsAvant={t("vsAvant")} intlTag={intlTag} />
          <p className="text-[11px] text-[var(--text-faint)]">{t("unitesAide")}</p>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)] mb-3">{t("unitesParProduit")}</p>
          <BarresProduits lignes={barres.map((b) => ({ nom: b.nom, valeur: b.quantite, couleur: b.couleur, texte: entier.format(b.quantite) }))} max={maxBarreUnites} vide={t("aucuneVente")} />
        </div>
      </div>

      {/* ── Chiffre d'affaires dans le temps ─────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-[var(--text-primary)]">{t("caDansLeTemps")}</p>
          <p className="text-[11px] text-[var(--text-faint)]">
            {t("plage", { debut: libelleTranche(debut, "jour", intlTag, true), fin: libelleTranche(fin, "jour", intlTag, true) })} · {t(`pas.${pas}`)}
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-2">{t("total")}</p>
            <div ref={zoneTotal} className="select-none cursor-crosshair [&_.recharts-wrapper:focus:not(:focus-visible)]:outline-none [&_.recharts-surface:focus:not(:focus-visible)]:outline-none" style={{ touchAction: "pan-y" }}>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={points} margin={{ top: 6, right: 8, left: MARGE_GAUCHE, bottom: 0 }} {...evenementsZoom}>
                  <defs>
                    <linearGradient id="dv-ventes-total" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={grille} vertical={false} />
                  {xAxe}
                  {yAxe}
                  {tooltip(false)}
                  <Area type="monotone" dataKey="total" stroke="#22d3ee" strokeWidth={2} fill="url(#dv-ventes-total)" isAnimationActive={false} activeDot={{ r: 3 }} />
                  {zoneSelection}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs text-[var(--text-muted)]">{t("parProduit")}</p>
              {series.map((s) => (
                <span key={s.cle} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.couleur }} />
                  <span className="max-w-[120px] truncate">{s.nom}</span>
                </span>
              ))}
            </div>
            <div ref={zoneProduits} className="select-none cursor-crosshair [&_.recharts-wrapper:focus:not(:focus-visible)]:outline-none [&_.recharts-surface:focus:not(:focus-visible)]:outline-none" style={{ touchAction: "pan-y" }}>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={points} margin={{ top: 6, right: 8, left: MARGE_GAUCHE, bottom: 0 }} {...evenementsZoom}>
                  <CartesianGrid stroke={grille} vertical={false} />
                  {xAxe}
                  {yAxe}
                  {tooltip(true)}
                  {series.map((s) => (
                    <Line key={s.cle} type="monotone" dataKey={s.cle} name={s.nom} stroke={s.couleur} strokeWidth={2} dot={false} isAnimationActive={false} activeDot={{ r: 3 }} />
                  ))}
                  {zoneSelection}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Vue d'ensemble : tout l'historique, la plage affichée se déplace et se redimensionne. */}
        <div>
          <p className="text-[10px] text-[var(--text-faint)] mb-1">{t("ensemble")}</p>
          {/* Le Brush filtre le graphique qui le porte : l'historique complet est dessiné dans
              son panorama (graphique enfant), seul ce qui reste visible au-dessus est vide. */}
          <ResponsiveContainer width="100%" height={64}>
            <AreaChart data={ensemble} margin={{ top: 0, right: 8, left: LARGEUR_AXE_Y, bottom: 0 }}>
              <Brush
                key={cleBrush}
                dataKey="t"
                height={60}
                startIndex={brushDebut}
                endIndex={brushFin}
                stroke="#7c3aed"
                fill={isLight ? "#ffffff" : "#13131f"}
                travellerWidth={8}
                tickFormatter={(v: number) => libelleTranche(v, "jour", intlTag)}
                onChange={(r: { startIndex?: number; endIndex?: number }) => {
                  if (r.startIndex === undefined || r.endIndex === undefined) return;
                  const a = ensemble[r.startIndex]?.t;
                  const b = ensemble[r.endIndex]?.t;
                  if (a !== undefined && b !== undefined) changerDomaine(a, Math.min(maintenant, b + JOUR_MS), true);
                }}
              >
                <AreaChart data={ensemble}>
                  <Area type="monotone" dataKey="total" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.15} isAnimationActive={false} />
                </AreaChart>
              </Brush>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Variation({ valeur, nouveau, vsAvant, intlTag }: { valeur: number | null; nouveau: string; vsAvant: string; intlTag: string }) {
  if (valeur === null) return <span className="text-[11px] text-[var(--text-faint)]">{nouveau}</span>;
  return (
    <span className={`text-[11px] font-semibold ${valeur >= 0 ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>
      {valeur >= 0 ? "▲" : "▼"} {(Math.abs(valeur) / 100).toLocaleString(intlTag, { style: "percent", maximumFractionDigits: 1 })}
      <span className="ml-1 font-normal text-[var(--text-faint)]">{vsAvant}</span>
    </span>
  );
}

function BarresProduits({
  lignes,
  max,
  vide,
}: {
  lignes: { nom: string; valeur: number; couleur: string; texte: string }[];
  max: number;
  vide: string;
}) {
  if (lignes.length === 0) return <p className="text-[11px] text-[var(--text-faint)]">{vide}</p>;
  return (
    <div className="flex flex-col gap-2.5">
      {lignes.map((l) => (
        <div key={l.nom} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-[11px]">
            <span className="truncate text-[var(--text-muted)]" title={l.nom}>{l.nom}</span>
            <span className="tabular-nums text-[var(--text-primary)] shrink-0">{l.texte}</span>
          </div>
          <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(l.valeur / max) * 100}%`, background: l.couleur }} />
          </div>
        </div>
      ))}
    </div>
  );
}
