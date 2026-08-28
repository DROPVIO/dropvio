"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";
import {
  SEUIL_TVA,
  SEUIL_TVA_MAJORE,
  TAXE_UE_FLAT,
  getCharges,
  calcPrixVenteMin,
  getMargeColor,
  getMargeLabel,
  type Mode,
} from "@/lib/calcul-marge";

type SimulationInputs = {
  mode: Mode;
  prixFournisseur: string;
  fraisLivraison: string;
  prixVente: string;
  budgetPub: string;
  extraUE: boolean;
  caAnnuelCumule: string;
  tauxCharge: string;
  tauxTaxe: string;
  margeCible: string;
};

type SimulationMarge = {
  id: string;
  nom: string;
  inputs: SimulationInputs;
  resultats: Record<string, unknown>;
  created_at: string;
};

const PALIERS = [10, 50, 200];

// Tuple utilisé pour les couleurs qui ont besoin d'une variante avec alpha (bordures) —
// getMargeColor() renvoie une chaîne var(--token) valide pour `color`/`background`, mais on
// ne peut pas lui concaténer un suffixe d'alpha hex ("var(--success)33" n'est pas du CSS
// valide). Pour les bordures translucides, on déduit le palier directement et on choisit la
// classe Tailwind correspondante plutôt que de manipuler la chaîne retournée par getMargeColor.
function margeTier(pct: number): "success" | "warning" | "danger" {
  if (pct >= 40) return "success";
  if (pct >= 20) return "warning";
  return "danger";
}
const MARGE_BORDER: Record<ReturnType<typeof margeTier>, string> = {
  success: "border-emerald-500/20",
  warning: "border-amber-500/20",
  danger: "border-red-500/20",
};

// Couleurs recharts non-Tailwind (props SVG littérales — pas de résolution de var() CSS
// possible, cf. DashboardActiviteChart.tsx) — recalculées selon le thème.
function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const read = () => setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return isLight;
}

export default function CalculateurMarge() {
  return (
    <Suspense fallback={null}>
      <CalculateurMargeInner />
    </Suspense>
  );
}

function CalculateurMargeInner() {
  const searchParams = useSearchParams();
  const isLight = useIsLightTheme();

  const [mode, setMode] = useState<Mode>("france");

  // Champs communs
  const [prixFournisseur, setPrixFournisseur] = useState(() => searchParams.get("cout") || "");
  const [fraisLivraison, setFraisLivraison] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [budgetPub, setBudgetPub] = useState("");

  // Mode France auto
  const [extraUE, setExtraUE] = useState(false);
  const [caAnnuelCumule, setCaAnnuelCumule] = useState("");

  // Mode International manuel
  const [tauxCharge, setTauxCharge] = useState("");
  const [tauxTaxe, setTauxTaxe] = useState("");

  // Calcul inversé
  const [margeCible, setMargeCible] = useState("");

  const charges = getCharges(mode, { extraUE, tauxCharge, tauxTaxe });

  // Dérivation pure des inputs — pas d'effet de bord externe, donc useMemo plutôt
  // qu'un useEffect + setState (qui déclenchait un rendu en cascade évitable).
  const resultats = useMemo(() => {
    const vente = parseFloat(prixVente);
    const fournisseur = parseFloat(prixFournisseur);
    const livraison = parseFloat(fraisLivraison) || 0;
    const pub = parseFloat(budgetPub) || 0;

    if (!vente || !fournisseur) {
      return null;
    }

    const chargesTotal = charges.rate * vente + charges.fixed;
    const coutTotal = fournisseur + livraison + pub + chargesTotal;
    const margeBrute = vente - fournisseur - livraison;
    const margeNette = vente - coutTotal;
    const margePct = (margeNette / vente) * 100;
    const roi = coutTotal > 0 ? (margeNette / coutTotal) * 100 : 0;
    const breakEven = coutTotal;

    return { margeBrute, margeNette, margePct, roi, breakEven, coutTotal, chargesTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prixFournisseur, fraisLivraison, prixVente, budgetPub, mode, extraUE, tauxCharge, tauxTaxe]);

  // Calcul inversé : prix de vente minimum pour la marge cible
  const prixVenteMin = margeCible
    ? calcPrixVenteMin(
        parseFloat(margeCible) || 0,
        parseFloat(prixFournisseur) || 0,
        parseFloat(fraisLivraison) || 0,
        parseFloat(budgetPub) || 0,
        charges
      )
    : null;

  // Simulation à l'échelle + données du graphique marge brute / marge nette
  const scaleData = resultats
    ? PALIERS.map((n) => ({
        n,
        ca: parseFloat(prixVente) * n,
        margeBrute: resultats.margeBrute * n,
        margeNette: resultats.margeNette * n,
        charges: resultats.chargesTotal * n,
      }))
    : [];

  const chartData = resultats
    ? [
        { name: "Par vente", margeBrute: resultats.margeBrute, margeNette: resultats.margeNette },
        ...scaleData.map((s) => ({ name: `${s.n} cmd/mois`, margeBrute: s.margeBrute, margeNette: s.margeNette })),
      ]
    : [];

  // ─── Sauvegarde des simulations (Supabase) ──────────────────────────────

  const [user, setUser] = useState<User | null>(null);
  const [simulations, setSimulations] = useState<SimulationMarge[]>([]);
  const [loadingSims, setLoadingSims] = useState(true);
  const [nomSimulation, setNomSimulation] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (!data.user) {
        setLoadingSims(false);
        return;
      }
      supabase
        .from("simulations_marge")
        .select("id, nom, inputs, resultats, created_at")
        .eq("user_id", data.user.id)
        .order("created_at", { ascending: false })
        .then(({ data: sims }) => {
          setSimulations((sims as SimulationMarge[]) ?? []);
          setLoadingSims(false);
        });
    });
  }, []);

  async function handleSauvegarder() {
    if (!user || !resultats) return;
    setSaving(true);
    setSaveError(null);

    const inputs: SimulationInputs = {
      mode, prixFournisseur, fraisLivraison, prixVente, budgetPub,
      extraUE, caAnnuelCumule, tauxCharge, tauxTaxe, margeCible,
    };
    const resultatsSnapshot = {
      margeNette: resultats.margeNette,
      margePct: resultats.margePct,
      coutTotal: resultats.coutTotal,
      chargesTotal: resultats.chargesTotal,
      scale: scaleData,
    };

    try {
      const res = await fetch("/api/simulations-marge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: nomSimulation.trim() || `Simulation du ${new Date().toLocaleDateString("fr-FR")}`,
          inputs,
          resultats: resultatsSnapshot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Erreur lors de la sauvegarde.");
        return;
      }
      setSimulations((prev) => [data as SimulationMarge, ...prev]);
      setNomSimulation("");
    } catch {
      setSaveError("Impossible de contacter le serveur.");
    } finally {
      setSaving(false);
    }
  }

  function handleCharger(sim: SimulationMarge) {
    const i = sim.inputs;
    if (i.mode) setMode(i.mode);
    if (i.prixFournisseur !== undefined) setPrixFournisseur(i.prixFournisseur);
    if (i.fraisLivraison !== undefined) setFraisLivraison(i.fraisLivraison);
    if (i.prixVente !== undefined) setPrixVente(i.prixVente);
    if (i.budgetPub !== undefined) setBudgetPub(i.budgetPub);
    if (i.extraUE !== undefined) setExtraUE(i.extraUE);
    if (i.caAnnuelCumule !== undefined) setCaAnnuelCumule(i.caAnnuelCumule);
    if (i.tauxCharge !== undefined) setTauxCharge(i.tauxCharge);
    if (i.tauxTaxe !== undefined) setTauxTaxe(i.tauxTaxe);
    if (i.margeCible !== undefined) setMargeCible(i.margeCible);
  }

  async function handleSupprimer(id: string) {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("simulations_marge").delete().eq("id", id);
    setSimulations((prev) => prev.filter((s) => s.id !== id));
  }

  const caCumule = parseFloat(caAnnuelCumule) || 0;
  const tvaPct = Math.min((caCumule / SEUIL_TVA_MAJORE) * 100, 100);
  const tvaColor = caCumule > SEUIL_TVA_MAJORE ? "var(--danger)" : caCumule > SEUIL_TVA ? "var(--warning)" : "var(--success)";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-['Inter',-apple-system,sans-serif] px-5 py-10">
      <div className="max-w-[680px] mx-auto">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-[32px] font-bold m-0 leading-tight text-[var(--text-primary)]">
            Calculateur de marge
          </h1>
          <p className="text-[var(--text-faint)] mt-2.5 text-[15px]">
            Calcule ta rentabilité avant de lancer un produit.
          </p>
        </div>

        {/* Toggle mode */}
        <div className="flex gap-1.5 bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl p-1.5 mb-5">
          {(["france", "manuel"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 px-3.5 py-2.5 rounded-lg border-none text-[13.5px] font-semibold cursor-pointer transition-all ${
                mode === m ? "bg-violet-600 text-white" : "bg-transparent text-[var(--text-faint)]"
              }`}
            >
              {m === "france" ? "🇫🇷 France auto" : "🌍 International manuel"}
            </button>
          ))}
        </div>

        {/* Formulaire */}
        <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border-strong)] mb-6">
          <div className="grid gap-5">

            <InputField
              label="Prix fournisseur (€)"
              placeholder="ex: 8.50"
              value={prixFournisseur}
              onChange={setPrixFournisseur}
              required
            />
            <InputField
              label="Frais de livraison (€)"
              placeholder="ex: 2.00"
              value={fraisLivraison}
              onChange={setFraisLivraison}
            />
            <InputField
              label="Prix de vente (€)"
              placeholder="ex: 29.99"
              value={prixVente}
              onChange={setPrixVente}
              required
            />
            <InputField
              label="Budget pub par vente (€)"
              placeholder="ex: 5.00"
              value={budgetPub}
              onChange={setBudgetPub}
            />

            {/* Bloc spécifique au mode */}
            {mode === "france" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <label className="flex items-center gap-2.5 text-[13.5px] text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extraUE}
                    onChange={(e) => setExtraUE(e.target.checked)}
                    className="w-4 h-4 accent-violet-600"
                  />
                  Vente / envoi hors UE (colis &lt; 150€)
                </label>

                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : URSSAF 12,3% du CA · Frais Stripe {extraUE ? "2,5%" : "1,5%"} + 0,25€{extraUE ? " (hors UE)" : " (UE)"}
                  {extraUE && ` · Taxe UE ${TAXE_UE_FLAT.toFixed(2)}€ flat`}.
                </div>

                <div>
                  <InputField
                    label="CA cumulé cette année (€)"
                    placeholder="ex: 32000"
                    value={caAnnuelCumule}
                    onChange={setCaAnnuelCumule}
                  />
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-[var(--text-faint)] mb-1.5">
                      <span>Progression vers le seuil de TVA</span>
                      <span className="font-semibold" style={{ color: tvaColor }}>{caCumule.toLocaleString("fr-FR")}€ / {SEUIL_TVA.toLocaleString("fr-FR")}€</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden relative">
                      <div
                        className="absolute top-0 bottom-0 w-px bg-[var(--border-strong)] z-[2]"
                        style={{ left: `${(SEUIL_TVA / SEUIL_TVA_MAJORE) * 100}%` }}
                      />
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${tvaPct}%`, background: tvaColor }}
                      />
                    </div>
                    <div className="text-[10.5px] text-[var(--text-faint)] mt-1.5">
                      Franchise en base jusqu’à {SEUIL_TVA.toLocaleString("fr-FR")}€ (limite majorée {SEUIL_TVA_MAJORE.toLocaleString("fr-FR")}€)
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid grid-cols-2 gap-4">
                <InputField
                  label="Taux de charge (%)"
                  placeholder="ex: 15"
                  value={tauxCharge}
                  onChange={setTauxCharge}
                />
                <InputField
                  label="Taux de taxe (%)"
                  placeholder="ex: 5"
                  value={tauxTaxe}
                  onChange={setTauxTaxe}
                />
              </div>
            )}
          </div>
        </div>

        {/* Calcul inversé : marge cible -> prix de vente minimum */}
        <div className="bg-[var(--surface)] rounded-2xl p-7 border border-[var(--border-strong)] mb-6">
          <h2 className="mt-0 mb-4 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
            Calcul inversé
          </h2>
          <div className="grid grid-cols-2 gap-4 items-end">
            <InputField
              label="Marge nette cible (%)"
              placeholder="ex: 30"
              value={margeCible}
              onChange={setMargeCible}
            />
            <div className="bg-[var(--bg-sunken)] rounded-[10px] px-4 py-3 border border-[var(--border)] h-[46px] flex items-center justify-between">
              <span className="text-xs text-[var(--text-faint)]">Prix de vente minimum</span>
              <span className={`text-base font-bold ${prixVenteMin !== null ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}`}>
                {margeCible
                  ? prixVenteMin !== null
                    ? `${prixVenteMin.toFixed(2)} €`
                    : "impossible"
                  : "—"}
              </span>
            </div>
          </div>
          {margeCible && prixVenteMin === null && (
            <div className="mt-3 text-[12.5px] text-[var(--danger)]">
              ⚠️ Objectif inatteignable : les charges + la marge visée dépassent 100% du prix de vente. Réduis la marge cible ou les coûts fixes.
            </div>
          )}
        </div>

        {/* Résultats */}
        {resultats ? (
          <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border-strong)]">
            <h2 className="mt-0 mb-6 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
              Résultats
            </h2>

            {/* Marge principale */}
            <div className={`bg-[var(--bg-sunken)] rounded-xl px-7 py-6 mb-5 border flex justify-between items-center ${MARGE_BORDER[margeTier(resultats.margePct)]}`}>
              <div>
                <div className="text-[13px] text-[var(--text-faint)] mb-1">Marge nette par vente</div>
                <div className="text-4xl font-bold" style={{ color: getMargeColor(resultats.margePct) }}>
                  {resultats.margeNette >= 0 ? "+" : ""}{resultats.margeNette.toFixed(2)} €
                </div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-bold" style={{ color: getMargeColor(resultats.margePct) }}>
                  {resultats.margePct.toFixed(1)}%
                </div>
                <div className="text-xs font-semibold mt-1" style={{ color: getMargeColor(resultats.margePct) }}>
                  {getMargeLabel(resultats.margePct)}
                </div>
              </div>
            </div>

            {/* Stats secondaires */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Coût total" value={`${resultats.coutTotal.toFixed(2)} €`} />
              <StatCard label="Charges" value={`${resultats.chargesTotal.toFixed(2)} €`} />
              <StatCard label="ROI" value={`${resultats.roi.toFixed(0)}%`} />
              <StatCard label="Break-even" value={`${resultats.breakEven.toFixed(2)} €`} />
            </div>

            {/* Détail des charges */}
            <div className="mt-5 grid gap-2">
              {charges.breakdown.map((c) => (
                <div key={c.label} className="flex justify-between text-[12.5px] text-[var(--text-faint)]">
                  <span>{c.label}</span>
                  <span className="text-[var(--text-muted)]">{c.detail}</span>
                </div>
              ))}
            </div>

            {/* Sauvegarde de la simulation */}
            {user ? (
              <div className="mt-5 flex gap-2.5">
                <input
                  type="text"
                  placeholder="Nom de la simulation (ex: Lampe LED - fitness)"
                  value={nomSimulation}
                  onChange={(e) => setNomSimulation(e.target.value)}
                  className="flex-1 bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[var(--text-primary)] outline-none focus:border-violet-500"
                />
                <button
                  onClick={handleSauvegarder}
                  disabled={saving}
                  className={`bg-violet-600 text-white border-none px-4.5 py-2.5 rounded-lg text-[13.5px] font-semibold whitespace-nowrap ${saving ? "cursor-default opacity-60" : "cursor-pointer"}`}
                >
                  {saving ? "Sauvegarde…" : "💾 Sauvegarder"}
                </button>
              </div>
            ) : null}
            {saveError && (
              <div className="mt-3 px-3.5 py-2.5 bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-lg text-[12.5px] text-[var(--danger)]">
                {saveError}
              </div>
            )}
            {!user && (
              <div className="mt-5 text-[12.5px] text-[var(--text-faint)]">
                Connecte-toi pour sauvegarder cette simulation.
              </div>
            )}

            {/* Conseil */}
            {resultats.margePct < 20 && (
              <div className="mt-5 px-4.5 py-3.5 bg-[var(--danger)]/10 rounded-[10px] border border-[var(--danger)]/20 text-[13px] text-[var(--danger)] leading-relaxed">
                ⚠️ Marge trop faible pour absorber les imprévus. Essaie de négocier le prix fournisseur ou d’augmenter le prix de vente.
              </div>
            )}
            {resultats.margePct >= 40 && (
              <div className="mt-5 px-4.5 py-3.5 bg-[var(--success)]/10 rounded-[10px] border border-[var(--success)]/20 text-[13px] text-[var(--success)] leading-relaxed">
                ✅ Bonne marge ! Ce produit peut absorber les coûts pubs et les retours.
              </div>
            )}

            {/* Simulation à l'échelle */}
            <div className="mt-8">
              <h2 className="mt-0 mb-4 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
                Simulation à l’échelle
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {scaleData.map((s) => (
                  <div key={s.n} className="bg-[var(--bg-sunken)] rounded-xl px-4 py-4.5 border border-[var(--border)]">
                    <div className="text-xs font-bold text-[var(--accent)] mb-3">
                      {s.n} commandes/mois
                    </div>
                    <div className="grid gap-2">
                      <MiniStat label="CA" value={`${s.ca.toFixed(0)} €`} />
                      <MiniStat label="Marge brute" value={`${s.margeBrute.toFixed(0)} €`} />
                      <MiniStat label="Marge nette" value={`${s.margeNette.toFixed(0)} €`} color={getMargeColor(resultats.margePct)} />
                      <MiniStat label="Charges totales" value={`${s.charges.toFixed(0)} €`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Graphique marge brute vs marge nette */}
            <div className="mt-7">
              <h2 className="mt-0 mb-4 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
                Marge brute vs marge nette
              </h2>
              <div className="bg-[var(--bg-sunken)] rounded-xl border border-[var(--border)] pt-4 px-2 pb-2">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: isLight ? "#a1a1aa" : "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: isLight ? "#a1a1aa" : "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 10, fontSize: 12 }}
                      labelStyle={{ color: "var(--text-faint)" }}
                      formatter={(value) => `${Number(value).toFixed(2)} €`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: isLight ? "#52525b" : "#a1a1aa" }} />
                    <Bar dataKey="margeBrute" name="Marge brute" fill="#7c3aed" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="margeNette" name="Marge nette" fill={isLight ? "#059669" : "#10b981"} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[var(--surface)] rounded-2xl p-10 border border-[var(--border-strong)] text-center text-[var(--text-faint)] text-sm">
            Remplis le prix fournisseur et le prix de vente pour voir les résultats.
          </div>
        )}

        {/* Simulations sauvegardées */}
        {user && (
          <div className="bg-[var(--surface)] rounded-2xl p-7 border border-[var(--border-strong)] mt-6">
            <h2 className="mt-0 mb-4 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
              Mes simulations
            </h2>

            {loadingSims ? (
              <div className="text-[13px] text-[var(--text-faint)]">Chargement…</div>
            ) : simulations.length === 0 ? (
              <div className="text-[13px] text-[var(--text-faint)]">
                Aucune simulation sauvegardée pour l’instant.
              </div>
            ) : (
              <div className="grid gap-2.5">
                {simulations.map((sim) => {
                  const margePct = typeof sim.resultats?.margePct === "number" ? sim.resultats.margePct as number : null;
                  return (
                    <div
                      key={sim.id}
                      className="flex items-center justify-between bg-[var(--bg-sunken)] border border-[var(--border)] rounded-[10px] px-4 py-3 gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-[var(--text-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
                          {sim.nom}
                        </div>
                        <div className="text-[11.5px] text-[var(--text-faint)] mt-0.5">
                          {new Date(sim.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          {margePct !== null && (
                            <span className="font-semibold" style={{ color: getMargeColor(margePct) }}> · {margePct.toFixed(1)}% net</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleCharger(sim)}
                          className="bg-violet-500/10 border border-violet-500/30 text-[var(--accent)] px-3 py-[7px] rounded-[7px] text-xs font-semibold cursor-pointer"
                        >
                          Charger
                        </button>
                        <button
                          onClick={() => handleSupprimer(sim.id)}
                          className="bg-transparent border border-[var(--danger)]/20 text-[var(--danger)] px-3 py-[7px] rounded-[7px] text-xs font-semibold cursor-pointer"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({
  label,
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-muted)] mb-2">
        {label} {required && <span className="text-[var(--accent)]">*</span>}
      </label>
      <input
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full box-border bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-lg px-3.5 py-3 text-[15px] text-[var(--text-primary)] outline-none transition-colors focus:border-violet-500"
      />
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[var(--text-faint)]">{label}</span>
      <span className="font-semibold" style={{ color: color || "var(--text-muted)" }}>{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--bg-sunken)] rounded-[10px] px-4.5 py-4 border border-[var(--border)]">
      <div className="text-[11px] text-[var(--text-faint)] mb-1.5 uppercase tracking-[0.08em]">
        {label}
      </div>
      <div className="text-lg font-semibold text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
