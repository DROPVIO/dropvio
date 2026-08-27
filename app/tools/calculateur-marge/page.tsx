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

export default function CalculateurMarge() {
  return (
    <Suspense fallback={null}>
      <CalculateurMargeInner />
    </Suspense>
  );
}

function CalculateurMargeInner() {
  const searchParams = useSearchParams();

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
  const tvaColor = caCumule > SEUIL_TVA_MAJORE ? "#ef4444" : caCumule > SEUIL_TVA ? "#f59e0b" : "#22c55e";

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f0f",
      color: "#f1f1f1",
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.2,
            color: "#ffffff",
          }}>
            Calculateur de marge
          </h1>
          <p style={{ color: "#888", marginTop: 10, fontSize: 15 }}>
            Calcule ta rentabilité avant de lancer un produit.
          </p>
        </div>

        {/* Toggle mode */}
        <div style={{
          display: "flex",
          gap: 6,
          background: "#161616",
          border: "1px solid #2a2a2a",
          borderRadius: 12,
          padding: 5,
          marginBottom: 20,
        }}>
          {(["france", "manuel"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: "11px 14px",
                borderRadius: 8,
                border: "none",
                background: mode === m ? "#6366f1" : "transparent",
                color: mode === m ? "#fff" : "#888",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {m === "france" ? "🇫🇷 France auto" : "🌍 International manuel"}
            </button>
          ))}
        </div>

        {/* Formulaire */}
        <div style={{
          background: "#1a1a1a",
          borderRadius: 16,
          padding: 32,
          border: "1px solid #2a2a2a",
          marginBottom: 24,
        }}>
          <div style={{ display: "grid", gap: 20 }}>

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
              <div style={{
                background: "#111",
                borderRadius: 12,
                padding: 20,
                border: "1px solid #222",
                display: "grid",
                gap: 16,
              }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "#ccc", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={extraUE}
                    onChange={(e) => setExtraUE(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: "#6366f1" }}
                  />
                  Vente / envoi hors UE (colis &lt; 150€)
                </label>

                <div style={{ fontSize: 12, color: "#666", lineHeight: 1.6 }}>
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
                  <div style={{ marginTop: 12 }}>
                    <div style={{
                      display: "flex", justifyContent: "space-between",
                      fontSize: 11, color: "#666", marginBottom: 6,
                    }}>
                      <span>Progression vers le seuil de TVA</span>
                      <span style={{ color: tvaColor, fontWeight: 600 }}>{caCumule.toLocaleString("fr-FR")}€ / {SEUIL_TVA.toLocaleString("fr-FR")}€</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 99, background: "#222", overflow: "hidden", position: "relative" }}>
                      <div style={{
                        position: "absolute", left: `${(SEUIL_TVA / SEUIL_TVA_MAJORE) * 100}%`,
                        top: 0, bottom: 0, width: 1, background: "#555", zIndex: 2,
                      }} />
                      <div style={{
                        height: "100%", borderRadius: 99, width: `${tvaPct}%`,
                        background: tvaColor, transition: "width 0.3s",
                      }} />
                    </div>
                    <div style={{ fontSize: 10.5, color: "#555", marginTop: 6 }}>
                      Franchise en base jusqu’à {SEUIL_TVA.toLocaleString("fr-FR")}€ (limite majorée {SEUIL_TVA_MAJORE.toLocaleString("fr-FR")}€)
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                background: "#111",
                borderRadius: 12,
                padding: 20,
                border: "1px solid #222",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}>
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
        <div style={{
          background: "#1a1a1a",
          borderRadius: 16,
          padding: 28,
          border: "1px solid #2a2a2a",
          marginBottom: 24,
        }}>
          <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            Calcul inversé
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "end" }}>
            <InputField
              label="Marge nette cible (%)"
              placeholder="ex: 30"
              value={margeCible}
              onChange={setMargeCible}
            />
            <div style={{
              background: "#111",
              borderRadius: 10,
              padding: "12px 16px",
              border: "1px solid #222",
              height: 46,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span style={{ fontSize: 12, color: "#666" }}>Prix de vente minimum</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: prixVenteMin !== null ? "#a5b4fc" : "#555" }}>
                {margeCible
                  ? prixVenteMin !== null
                    ? `${prixVenteMin.toFixed(2)} €`
                    : "impossible"
                  : "—"}
              </span>
            </div>
          </div>
          {margeCible && prixVenteMin === null && (
            <div style={{ marginTop: 12, fontSize: 12.5, color: "#fca5a5" }}>
              ⚠️ Objectif inatteignable : les charges + la marge visée dépassent 100% du prix de vente. Réduis la marge cible ou les coûts fixes.
            </div>
          )}
        </div>

        {/* Résultats */}
        {resultats ? (
          <div style={{
            background: "#1a1a1a",
            borderRadius: 16,
            padding: 32,
            border: "1px solid #2a2a2a",
          }}>
            <h2 style={{ margin: "0 0 24px", fontSize: 16, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Résultats
            </h2>

            {/* Marge principale */}
            <div style={{
              background: "#111",
              borderRadius: 12,
              padding: "24px 28px",
              marginBottom: 20,
              border: `1px solid ${getMargeColor(resultats.margePct)}33`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Marge nette par vente</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: getMargeColor(resultats.margePct) }}>
                  {resultats.margeNette >= 0 ? "+" : ""}{resultats.margeNette.toFixed(2)} €
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: getMargeColor(resultats.margePct),
                }}>
                  {resultats.margePct.toFixed(1)}%
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: getMargeColor(resultats.margePct),
                  marginTop: 4,
                }}>
                  {getMargeLabel(resultats.margePct)}
                </div>
              </div>
            </div>

            {/* Stats secondaires */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
              <StatCard label="Coût total" value={`${resultats.coutTotal.toFixed(2)} €`} />
              <StatCard label="Charges" value={`${resultats.chargesTotal.toFixed(2)} €`} />
              <StatCard label="ROI" value={`${resultats.roi.toFixed(0)}%`} />
              <StatCard label="Break-even" value={`${resultats.breakEven.toFixed(2)} €`} />
            </div>

            {/* Détail des charges */}
            <div style={{ marginTop: 20, display: "grid", gap: 8 }}>
              {charges.breakdown.map((c) => (
                <div key={c.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#777" }}>
                  <span>{c.label}</span>
                  <span style={{ color: "#aaa" }}>{c.detail}</span>
                </div>
              ))}
            </div>

            {/* Sauvegarde de la simulation */}
            {user ? (
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <input
                  type="text"
                  placeholder="Nom de la simulation (ex: Lampe LED - fitness)"
                  value={nomSimulation}
                  onChange={(e) => setNomSimulation(e.target.value)}
                  style={{
                    flex: 1,
                    background: "#111",
                    border: "1px solid #2e2e2e",
                    borderRadius: 8,
                    padding: "10px 14px",
                    color: "#f1f1f1",
                    fontSize: 13.5,
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSauvegarder}
                  disabled={saving}
                  style={{
                    background: "#6366f1",
                    color: "#fff",
                    border: "none",
                    padding: "10px 18px",
                    borderRadius: 8,
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: saving ? "default" : "pointer",
                    opacity: saving ? 0.6 : 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  {saving ? "Sauvegarde…" : "💾 Sauvegarder"}
                </button>
              </div>
            ) : null}
            {saveError && (
              <div style={{
                marginTop: 12, padding: "10px 14px", background: "#1f1010",
                border: "1px solid #ef444433", borderRadius: 8, fontSize: 12.5, color: "#fca5a5",
              }}>
                {saveError}
              </div>
            )}
            {!user && (
              <div style={{ marginTop: 20, fontSize: 12.5, color: "#666" }}>
                Connecte-toi pour sauvegarder cette simulation.
              </div>
            )}

            {/* Conseil */}
            {resultats.margePct < 20 && (
              <div style={{
                marginTop: 20,
                padding: "14px 18px",
                background: "#1f1010",
                borderRadius: 10,
                border: "1px solid #ef444433",
                fontSize: 13,
                color: "#fca5a5",
                lineHeight: 1.5,
              }}>
                ⚠️ Marge trop faible pour absorber les imprévus. Essaie de négocier le prix fournisseur ou d’augmenter le prix de vente.
              </div>
            )}
            {resultats.margePct >= 40 && (
              <div style={{
                marginTop: 20,
                padding: "14px 18px",
                background: "#0f1f10",
                borderRadius: 10,
                border: "1px solid #22c55e33",
                fontSize: 13,
                color: "#86efac",
                lineHeight: 1.5,
              }}>
                ✅ Bonne marge ! Ce produit peut absorber les coûts pubs et les retours.
              </div>
            )}

            {/* Simulation à l'échelle */}
            <div style={{ marginTop: 32 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Simulation à l’échelle
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {scaleData.map((s) => (
                  <div key={s.n} style={{ background: "#111", borderRadius: 12, padding: "18px 16px", border: "1px solid #222" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", marginBottom: 12 }}>
                      {s.n} commandes/mois
                    </div>
                    <div style={{ display: "grid", gap: 8 }}>
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
            <div style={{ marginTop: 28 }}>
              <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                Marge brute vs marge nette
              </h2>
              <div style={{ background: "#111", borderRadius: 12, border: "1px solid #222", padding: "16px 8px 8px" }}>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} width={46} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, fontSize: 12 }}
                      labelStyle={{ color: "#888" }}
                      formatter={(value) => `${Number(value).toFixed(2)} €`}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#888" }} />
                    <Bar dataKey="margeBrute" name="Marge brute" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="margeNette" name="Marge nette" fill="#22c55e" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div style={{
            background: "#1a1a1a",
            borderRadius: 16,
            padding: 40,
            border: "1px solid #2a2a2a",
            textAlign: "center",
            color: "#444",
            fontSize: 14,
          }}>
            Remplis le prix fournisseur et le prix de vente pour voir les résultats.
          </div>
        )}

        {/* Simulations sauvegardées */}
        {user && (
          <div style={{
            background: "#1a1a1a",
            borderRadius: 16,
            padding: 28,
            border: "1px solid #2a2a2a",
            marginTop: 24,
          }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Mes simulations
            </h2>

            {loadingSims ? (
              <div style={{ fontSize: 13, color: "#555" }}>Chargement…</div>
            ) : simulations.length === 0 ? (
              <div style={{ fontSize: 13, color: "#555" }}>
                Aucune simulation sauvegardée pour l’instant.
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {simulations.map((sim) => {
                  const margePct = typeof sim.resultats?.margePct === "number" ? sim.resultats.margePct as number : null;
                  return (
                    <div
                      key={sim.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#111",
                        border: "1px solid #222",
                        borderRadius: 10,
                        padding: "12px 16px",
                        gap: 12,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: "#e5e5e5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {sim.nom}
                        </div>
                        <div style={{ fontSize: 11.5, color: "#666", marginTop: 2 }}>
                          {new Date(sim.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          {margePct !== null && (
                            <span style={{ color: getMargeColor(margePct), fontWeight: 600 }}> · {margePct.toFixed(1)}% net</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                        <button
                          onClick={() => handleCharger(sim)}
                          style={{
                            background: "#1a1a2e",
                            border: "1px solid #6366f144",
                            color: "#a5b4fc",
                            padding: "7px 12px",
                            borderRadius: 7,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          Charger
                        </button>
                        <button
                          onClick={() => handleSupprimer(sim.id)}
                          style={{
                            background: "transparent",
                            border: "1px solid #ef444433",
                            color: "#fca5a5",
                            padding: "7px 12px",
                            borderRadius: 7,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
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
      <label style={{
        display: "block",
        fontSize: 13,
        fontWeight: 500,
        color: "#aaa",
        marginBottom: 8,
      }}>
        {label} {required && <span style={{ color: "#6366f1" }}>*</span>}
      </label>
      <input
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "#111",
          border: "1px solid #2e2e2e",
          borderRadius: 8,
          padding: "12px 14px",
          color: "#f1f1f1",
          fontSize: 15,
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#6366f1")}
        onBlur={(e) => (e.target.style.borderColor = "#2e2e2e")}
      />
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "#666" }}>{label}</span>
      <span style={{ color: color || "#ccc", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#111",
      borderRadius: 10,
      padding: "16px 18px",
      border: "1px solid #222",
    }}>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#e5e5e5" }}>
        {value}
      </div>
    </div>
  );
}
