"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";
import {
  SEUIL_TVA,
  SEUIL_TVA_MAJORE,
  TAXE_UE_FLAT,
  VAT_RATE_UK,
  STRIPE_FIXED_UK,
  STRIPE_RATE_UK_DEFAULT,
  DOUANE_SEUIL_UK,
  tauxMarginalUK,
  STRIPE_FIXED_US,
  STRIPE_RATE_US_DEFAULT,
  US_STATE_SALES_TAX,
  getUsStateTax,
  STRIPE_FIXED_BE,
  STRIPE_RATE_BE_DEFAULT,
  TVA_RATE_BE,
  SEUIL_FRANCHISE_BE,
  COTISATIONS_RATE_BE,
  STRIPE_FIXED_CH,
  STRIPE_RATE_CH_DEFAULT,
  TVA_RATE_CH,
  SEUIL_IMMAT_CH,
  COTISATIONS_SEUIL_CH,
  STRIPE_FIXED_CA,
  STRIPE_RATE_CA_DEFAULT,
  TPS_TVQ_RATE_CA,
  SEUIL_PETIT_FOURNISSEUR_CA,
  STRIPE_FIXED_LU,
  STRIPE_RATE_LU_DEFAULT,
  TVA_RATE_LU,
  SEUIL_FRANCHISE_LU,
  STRIPE_FIXED_IT,
  STRIPE_RATE_IT_DEFAULT,
  SEUIL_FORFETTARIO_IT,
  COEFFICIENTE_REDDITIVITA_IT,
  IMPOSTA_RATE_NUOVA_IT,
  IMPOSTA_RATE_ORDINARIA_IT,
  STRIPE_FIXED_ES,
  STRIPE_RATE_ES_DEFAULT,
  TVA_RATE_ES,
  getDevise,
  getCharges,
  calcPrixVenteMin,
  getMargeColor,
  getMargeLabel,
  type Mode,
  type RegimeImpostaIT,
} from "@/lib/calcul-marge";

type SimulationInputs = {
  mode: Mode;
  prixFournisseur: string;
  fraisLivraison: string;
  prixVente: string;
  budgetPub: string;
  extraUE: boolean;
  caAnnuelCumule: string;
  stripeRateUK: string;
  tauxRetourUK: string;
  profitAnnuelUK: string;
  usState: string;
  stripeRateUS: string;
  tauxRetourUS: string;
  salesTaxNexusUS: boolean;
  droitDouaneUS: string;
  stripeRateBE: string;
  tauxRetourBE: string;
  caAnnuelCumuleBE: string;
  stripeRateCH: string;
  tauxRetourCH: string;
  caAnnuelCumuleCH: string;
  stripeRateCA: string;
  tauxRetourCA: string;
  caAnnuelCumuleCA: string;
  droitDouaneCA: string;
  stripeRateLU: string;
  tauxRetourLU: string;
  caAnnuelCumuleLU: string;
  stripeRateIT: string;
  tauxRetourIT: string;
  caAnnuelCumuleIT: string;
  regimeImpostaIT: RegimeImpostaIT;
  stripeRateES: string;
  tauxRetourES: string;
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

// 8 modes : un <select> reste lisible quel que soit le nombre d'entrées, contrairement à une
// rangée de boutons (illisible/scrollable dès qu'on dépasse 4-5 items) — voir la demande
// d'origine qui a explicitement soulevé ce risque en ajoutant 4 modes d'un coup.
const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "france", label: "🇫🇷 France auto" },
  { value: "uk", label: "🇬🇧 UK auto" },
  { value: "us", label: "🇺🇸 US auto" },
  { value: "be", label: "🇧🇪 Belgique auto" },
  { value: "ch", label: "🇨🇭 Suisse auto" },
  { value: "ca", label: "🇨🇦 Canada (Québec) auto" },
  { value: "lu", label: "🇱🇺 Luxembourg auto" },
  { value: "it", label: "🇮🇹 Italie auto" },
  { value: "es", label: "🇪🇸 Espagne auto" },
  { value: "manuel", label: "🌍 International manuel" },
];

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

// recharts (~390 KB) ne doit jamais faire partie du bundle initial de cette page — chargé
// à la demande. ssr: false : recharts mesure le DOM au montage (ResponsiveContainer), un
// rendu serveur n'apporterait rien et créerait un mismatch d'hydratation.
const MargeBarChart = dynamic(() => import("@/components/tools/MargeBarChart"), {
  ssr: false,
  loading: () => (
    <div className="h-[240px] flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
    </div>
  ),
});

export default function CalculateurMarge() {
  return (
    <Suspense fallback={null}>
      <CalculateurMargeInner />
    </Suspense>
  );
}

function CalculateurMargeInner() {
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>("manuel");

  // Champs communs
  const [prixFournisseur, setPrixFournisseur] = useState(() => searchParams.get("cout") || "");
  const [fraisLivraison, setFraisLivraison] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [budgetPub, setBudgetPub] = useState("");

  // Mode France auto
  const [extraUE, setExtraUE] = useState(false);
  const [caAnnuelCumule, setCaAnnuelCumule] = useState("");

  // Mode UK auto
  const [stripeRateUK, setStripeRateUK] = useState(STRIPE_RATE_UK_DEFAULT);
  const [tauxRetourUK, setTauxRetourUK] = useState("");
  // Curseur "profit annuel estimé" — indicatif, séparé du calcul de marge par vente
  // (Income Tax + Class 4 NIC se calculent sur le profit annuel cumulé, jamais par transaction).
  const [profitAnnuelUK, setProfitAnnuelUK] = useState("30000");

  // Mode US auto
  const [usState, setUsState] = useState("");
  const [stripeRateUS, setStripeRateUS] = useState(STRIPE_RATE_US_DEFAULT);
  const [tauxRetourUS, setTauxRetourUS] = useState("");
  // Sans confirmation explicite du nexus, aucune sales tax n'est déduite (voir getCharges).
  const [salesTaxNexusUS, setSalesTaxNexusUS] = useState(false);
  // Champ purement informatif — jamais inclus dans le calcul de marge (voir avertissement
  // fixe affiché sous le résultat), juste capturé pour mémo dans la simulation sauvegardée.
  const [droitDouaneUS, setDroitDouaneUS] = useState("");

  // Mode Belgique auto
  const [stripeRateBE, setStripeRateBE] = useState(STRIPE_RATE_BE_DEFAULT);
  const [tauxRetourBE, setTauxRetourBE] = useState("");
  const [caAnnuelCumuleBE, setCaAnnuelCumuleBE] = useState("");

  // Mode Suisse auto
  const [stripeRateCH, setStripeRateCH] = useState(STRIPE_RATE_CH_DEFAULT);
  const [tauxRetourCH, setTauxRetourCH] = useState("");
  const [caAnnuelCumuleCH, setCaAnnuelCumuleCH] = useState("");

  // Mode Canada (Québec) auto
  const [stripeRateCA, setStripeRateCA] = useState(STRIPE_RATE_CA_DEFAULT);
  const [tauxRetourCA, setTauxRetourCA] = useState("");
  const [caAnnuelCumuleCA, setCaAnnuelCumuleCA] = useState("");
  // Purement informatif, jamais inclus dans le calcul — même traitement que droitDouaneUS.
  const [droitDouaneCA, setDroitDouaneCA] = useState("");

  // Mode Luxembourg auto
  const [stripeRateLU, setStripeRateLU] = useState(STRIPE_RATE_LU_DEFAULT);
  const [tauxRetourLU, setTauxRetourLU] = useState("");
  const [caAnnuelCumuleLU, setCaAnnuelCumuleLU] = useState("");

  // Mode Italie auto
  const [stripeRateIT, setStripeRateIT] = useState(STRIPE_RATE_IT_DEFAULT);
  const [tauxRetourIT, setTauxRetourIT] = useState("");
  const [caAnnuelCumuleIT, setCaAnnuelCumuleIT] = useState("");
  // Ordinaria (15%) par défaut plutôt que nuova (5%) — estimation plus conservatrice (marge
  // plus basse) tant que le marchand n'a pas confirmé son éligibilité au taux réduit.
  const [regimeImpostaIT, setRegimeImpostaIT] = useState<RegimeImpostaIT>("ordinaria");

  // Mode Espagne auto
  const [stripeRateES, setStripeRateES] = useState(STRIPE_RATE_ES_DEFAULT);
  const [tauxRetourES, setTauxRetourES] = useState("");

  // Mode International manuel
  const [tauxCharge, setTauxCharge] = useState("");
  const [tauxTaxe, setTauxTaxe] = useState("");

  // Calcul inversé
  const [margeCible, setMargeCible] = useState("");

  const charges = getCharges(mode, {
    extraUE, tauxCharge, tauxTaxe, stripeRateUK, tauxRetourUK,
    stripeRateUS, tauxRetourUS, usState, salesTaxNexusUS,
    stripeRateBE, tauxRetourBE, stripeRateCH, tauxRetourCH,
    stripeRateCA, tauxRetourCA, stripeRateLU, tauxRetourLU,
    stripeRateIT, tauxRetourIT, regimeImpostaIT,
    stripeRateES, tauxRetourES,
  });
  const devise = getDevise(mode);
  const tauxMarginal = tauxMarginalUK(parseFloat(profitAnnuelUK) || 0);

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

    // Charges proportionnelles au CA (Stripe/TVA-VAT-sales tax/retour) + fixe — mêmes
    // qu'avant l'ajout des cotisations post-marge.
    const chargesProportionnelles = charges.rate * vente + charges.fixed;
    const margeBrute = vente - fournisseur - livraison;
    // Belgique/Suisse/Canada : cotisations sociales appliquées sur la marge nette
    // pré-cotisations (après Stripe/CAC/retour/TVA), jamais sur le CA — mécanique
    // volontairement distincte de l'URSSAF française. Voir postCotisationsRate dans
    // lib/calcul-marge.ts ; undefined pour tous les autres modes, donc 0 ici (comportement
    // strictement inchangé pour France/UK/US/Luxembourg/manuel).
    const margeNettePreCotisations = vente - fournisseur - livraison - pub - chargesProportionnelles;
    const cotisationsAmount = margeNettePreCotisations * (charges.postCotisationsRate ?? 0);
    const margeNette = margeNettePreCotisations - cotisationsAmount;
    // chargesTotal/coutTotal replient les cotisations dedans pour garder l'invariant
    // coutTotal = vente - margeNette (utilisé par le ROI, le break-even et les StatCards).
    const chargesTotal = chargesProportionnelles + cotisationsAmount;
    const coutTotal = fournisseur + livraison + pub + chargesTotal;
    const margePct = (margeNette / vente) * 100;
    const roi = coutTotal > 0 ? (margeNette / coutTotal) * 100 : 0;
    const breakEven = coutTotal;

    return { margeBrute, margeNette, margePct, roi, breakEven, coutTotal, chargesTotal };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    prixFournisseur, fraisLivraison, prixVente, budgetPub, mode, extraUE, tauxCharge, tauxTaxe,
    stripeRateUK, tauxRetourUK, stripeRateUS, tauxRetourUS, usState, salesTaxNexusUS,
    stripeRateBE, tauxRetourBE, stripeRateCH, tauxRetourCH, stripeRateCA, tauxRetourCA, stripeRateLU, tauxRetourLU,
    stripeRateIT, tauxRetourIT, regimeImpostaIT, stripeRateES, tauxRetourES,
  ]);

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
  const [deletingSimId, setDeletingSimId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      extraUE, caAnnuelCumule, stripeRateUK, tauxRetourUK, profitAnnuelUK,
      usState, stripeRateUS, tauxRetourUS, salesTaxNexusUS, droitDouaneUS,
      stripeRateBE, tauxRetourBE, caAnnuelCumuleBE,
      stripeRateCH, tauxRetourCH, caAnnuelCumuleCH,
      stripeRateCA, tauxRetourCA, caAnnuelCumuleCA, droitDouaneCA,
      stripeRateLU, tauxRetourLU, caAnnuelCumuleLU,
      stripeRateIT, tauxRetourIT, caAnnuelCumuleIT, regimeImpostaIT,
      stripeRateES, tauxRetourES,
      tauxCharge, tauxTaxe, margeCible,
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
    if (i.stripeRateUK !== undefined) setStripeRateUK(i.stripeRateUK);
    if (i.tauxRetourUK !== undefined) setTauxRetourUK(i.tauxRetourUK);
    if (i.profitAnnuelUK !== undefined) setProfitAnnuelUK(i.profitAnnuelUK);
    if (i.usState !== undefined) setUsState(i.usState);
    if (i.stripeRateUS !== undefined) setStripeRateUS(i.stripeRateUS);
    if (i.tauxRetourUS !== undefined) setTauxRetourUS(i.tauxRetourUS);
    if (i.salesTaxNexusUS !== undefined) setSalesTaxNexusUS(i.salesTaxNexusUS);
    if (i.droitDouaneUS !== undefined) setDroitDouaneUS(i.droitDouaneUS);
    if (i.stripeRateBE !== undefined) setStripeRateBE(i.stripeRateBE);
    if (i.tauxRetourBE !== undefined) setTauxRetourBE(i.tauxRetourBE);
    if (i.caAnnuelCumuleBE !== undefined) setCaAnnuelCumuleBE(i.caAnnuelCumuleBE);
    if (i.stripeRateCH !== undefined) setStripeRateCH(i.stripeRateCH);
    if (i.tauxRetourCH !== undefined) setTauxRetourCH(i.tauxRetourCH);
    if (i.caAnnuelCumuleCH !== undefined) setCaAnnuelCumuleCH(i.caAnnuelCumuleCH);
    if (i.stripeRateCA !== undefined) setStripeRateCA(i.stripeRateCA);
    if (i.tauxRetourCA !== undefined) setTauxRetourCA(i.tauxRetourCA);
    if (i.caAnnuelCumuleCA !== undefined) setCaAnnuelCumuleCA(i.caAnnuelCumuleCA);
    if (i.droitDouaneCA !== undefined) setDroitDouaneCA(i.droitDouaneCA);
    if (i.stripeRateLU !== undefined) setStripeRateLU(i.stripeRateLU);
    if (i.tauxRetourLU !== undefined) setTauxRetourLU(i.tauxRetourLU);
    if (i.caAnnuelCumuleLU !== undefined) setCaAnnuelCumuleLU(i.caAnnuelCumuleLU);
    if (i.stripeRateIT !== undefined) setStripeRateIT(i.stripeRateIT);
    if (i.tauxRetourIT !== undefined) setTauxRetourIT(i.tauxRetourIT);
    if (i.caAnnuelCumuleIT !== undefined) setCaAnnuelCumuleIT(i.caAnnuelCumuleIT);
    if (i.regimeImpostaIT !== undefined) setRegimeImpostaIT(i.regimeImpostaIT);
    if (i.stripeRateES !== undefined) setStripeRateES(i.stripeRateES);
    if (i.tauxRetourES !== undefined) setTauxRetourES(i.tauxRetourES);
    if (i.tauxCharge !== undefined) setTauxCharge(i.tauxCharge);
    if (i.tauxTaxe !== undefined) setTauxTaxe(i.tauxTaxe);
    if (i.margeCible !== undefined) setMargeCible(i.margeCible);
  }

  async function handleSupprimer(id: string) {
    if (deletingSimId) return;
    if (!confirm("Supprimer cette simulation ? Cette action est irréversible.")) return;
    setDeletingSimId(id);
    setDeleteError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("simulations_marge").delete().eq("id", id);
      if (error) {
        setDeleteError("Impossible de supprimer cette simulation.");
        return;
      }
      setSimulations((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setDeletingSimId(null);
    }
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

        {/* Sélection du mode — <select> plutôt qu'une rangée de boutons, illisible à 8 modes */}
        <div className="mb-5">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="w-full box-border bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl px-4 py-3.5 text-[14.5px] font-semibold text-[var(--text-primary)] outline-none cursor-pointer focus:border-violet-500"
          >
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Formulaire */}
        <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border-strong)] mb-6">
          <div className="grid gap-5">

            <InputField
              label={`Prix fournisseur (${devise})`}
              placeholder="ex: 8.50"
              value={prixFournisseur}
              onChange={setPrixFournisseur}
              required
            />
            <InputField
              label={`Frais de livraison (${devise})`}
              placeholder="ex: 2.00"
              value={fraisLivraison}
              onChange={setFraisLivraison}
            />
            <InputField
              label={`Prix de vente (${devise})`}
              placeholder="ex: 29.99"
              value={prixVente}
              onChange={setPrixVente}
              required
            />
            <InputField
              label={`Budget pub par vente / CAC (${devise})`}
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
            ) : mode === "uk" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    label="Frais Stripe UK (%)"
                    placeholder="1.5"
                    value={stripeRateUK}
                    onChange={setStripeRateUK}
                  />
                  <InputField
                    label="Taux de retour hypothétique (%)"
                    placeholder="ex: 8"
                    value={tauxRetourUK}
                    onChange={setTauxRetourUK}
                  />
                </div>

                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : VAT {(VAT_RATE_UK * 100).toFixed(0)}% du prix de vente (taux standard) · Frais Stripe {stripeRateUK || "0"}% + £{STRIPE_FIXED_UK.toFixed(2)} (carte domestique).
                </div>

                {(parseFloat(prixVente) || 0) >= DOUANE_SEUIL_UK && (
                  <div className="text-xs text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg px-3.5 py-2.5 leading-relaxed">
                    ⚠️ Droit de douane applicable au-delà de {DOUANE_SEUIL_UK}£ — variable par catégorie, non calculé automatiquement. Vérifie sur gov.uk.
                  </div>
                )}

                {/* Curseur profit annuel — indicatif, séparé du calcul de marge par vente */}
                <div className="pt-3 border-t border-[var(--border)]">
                  <div className="flex justify-between text-[13px] text-[var(--text-muted)] mb-2">
                    <span>Profit annuel estimé (indicatif)</span>
                    <span className="font-semibold text-[var(--text-primary)]">£{(parseFloat(profitAnnuelUK) || 0).toLocaleString("fr-FR")}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={150000}
                    step={1000}
                    value={parseFloat(profitAnnuelUK) || 0}
                    onChange={(e) => setProfitAnnuelUK(e.target.value)}
                    className="w-full accent-violet-600"
                  />
                  <div className="mt-2.5 text-[12px] text-[var(--text-faint)] leading-relaxed">
                    Taux marginal approximatif : <span className="font-semibold text-[var(--text-muted)]">{tauxMarginal.label}</span>.
                    Income Tax + Class 4 National Insurance sur le profit annuel — n&apos;entre pas dans le calcul de marge par vente ci-dessus, à titre indicatif. Seuils à vérifier sur gov.uk.
                  </div>
                </div>
              </div>
            ) : mode === "us" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text-muted)] mb-2">
                    État du client <span className="text-[var(--accent)]">*</span>
                  </label>
                  <select
                    value={usState}
                    onChange={(e) => setUsState(e.target.value)}
                    className="w-full box-border bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg px-3.5 py-3 text-[15px] text-[var(--text-primary)] outline-none transition-colors focus:border-violet-500"
                  >
                    <option value="">Sélectionne l&apos;état du client…</option>
                    {US_STATE_SALES_TAX.map((s) => (
                      <option key={s.code} value={s.code}>{s.nom} ({s.code})</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-[var(--text-faint)] mt-1.5 leading-relaxed">
                    {usState
                      ? `Sales tax de base indicative : ${(getUsStateTax(usState) * 100).toFixed(3)}% — taux d'État uniquement, hors surtaxes locales comté/ville qui peuvent s'ajouter selon la localité exacte du client.`
                      : "Sales tax de base indicative : sélectionne un état — taux d'État uniquement, hors surtaxes locales comté/ville."}
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-[13.5px] text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={salesTaxNexusUS}
                    onChange={(e) => setSalesTaxNexusUS(e.target.checked)}
                    className="w-4 h-4 accent-violet-600"
                  />
                  J&apos;ai un nexus économique dans cet État
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    label="Frais Stripe US (%)"
                    placeholder="2.9"
                    value={stripeRateUS}
                    onChange={setStripeRateUS}
                  />
                  <InputField
                    label="Taux de retour hypothétique (%)"
                    placeholder="ex: 8"
                    value={tauxRetourUS}
                    onChange={setTauxRetourUS}
                  />
                </div>

                <InputField
                  label="Droit de douane estimé (%) — informatif, non inclus dans le calcul"
                  placeholder="ex: 0"
                  value={droitDouaneUS}
                  onChange={setDroitDouaneUS}
                />

                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : Frais Stripe {stripeRateUS || "0"}% + ${STRIPE_FIXED_US.toFixed(2)} (carte domestique)
                  {salesTaxNexusUS && usState ? ` · Sales tax ${(getUsStateTax(usState) * 100).toFixed(3)}% (${usState})` : " · Sales tax 0% (nexus non confirmé)"}.
                </div>
              </div>
            ) : mode === "be" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Frais Stripe (%)" placeholder="1.5" value={stripeRateBE} onChange={setStripeRateBE} />
                  <InputField label="Taux de retour hypothétique (%)" placeholder="ex: 8" value={tauxRetourBE} onChange={setTauxRetourBE} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : TVA {(TVA_RATE_BE * 100).toFixed(0)}% du prix de vente · Frais Stripe {stripeRateBE || "0"}% + {STRIPE_FIXED_BE.toFixed(2)}€ · Cotisations sociales indépendant {(COTISATIONS_RATE_BE * 100).toFixed(1)}% sur la marge nette (pas sur le CA — voir note sous le résultat).
                </div>
                <SeuilTracker
                  label="CA cumulé cette année"
                  devise="€"
                  value={caAnnuelCumuleBE}
                  onChange={setCaAnnuelCumuleBE}
                  seuil={SEUIL_FRANCHISE_BE}
                  caption={`Franchise de TVA jusqu'à ${SEUIL_FRANCHISE_BE.toLocaleString("fr-FR")}€`}
                />
              </div>
            ) : mode === "ch" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Frais Stripe (%)" placeholder="2.9" value={stripeRateCH} onChange={setStripeRateCH} />
                  <InputField label="Taux de retour hypothétique (%)" placeholder="ex: 8" value={tauxRetourCH} onChange={setTauxRetourCH} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : TVA {(TVA_RATE_CH * 100).toFixed(1)}% du prix de vente · Frais Stripe {stripeRateCH || "0"}% + CHF {STRIPE_FIXED_CH.toFixed(2)} · AVS/AI/APG indépendant sur la marge nette (voir note sous le résultat).
                </div>
                <SeuilTracker
                  label="CA cumulé cette année"
                  devise=" CHF"
                  value={caAnnuelCumuleCH}
                  onChange={setCaAnnuelCumuleCH}
                  seuil={SEUIL_IMMAT_CH}
                  caption={`Immatriculation TVA obligatoire à partir de CHF ${SEUIL_IMMAT_CH.toLocaleString("fr-CH")}`}
                />
              </div>
            ) : mode === "ca" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Frais Stripe (%)" placeholder="2.9" value={stripeRateCA} onChange={setStripeRateCA} />
                  <InputField label="Taux de retour hypothétique (%)" placeholder="ex: 8" value={tauxRetourCA} onChange={setTauxRetourCA} />
                </div>
                <InputField
                  label="Droit de douane estimé (%) — informatif, non inclus dans le calcul"
                  placeholder="ex: 0"
                  value={droitDouaneCA}
                  onChange={setDroitDouaneCA}
                />
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : TPS + TVQ {(TPS_TVQ_RATE_CA * 100).toFixed(3)}% du prix de vente · Frais Stripe {stripeRateCA || "0"}% + C${STRIPE_FIXED_CA.toFixed(2)} · RRQ + RQAP sur la marge nette (voir note sous le résultat).
                </div>
                <SeuilTracker
                  label="CA cumulé cette année"
                  devise=" CAD"
                  value={caAnnuelCumuleCA}
                  onChange={setCaAnnuelCumuleCA}
                  seuil={SEUIL_PETIT_FOURNISSEUR_CA}
                  caption={`Seuil de petit fournisseur courant à ${SEUIL_PETIT_FOURNISSEUR_CA.toLocaleString("fr-FR")} CAD — à reconfirmer sur revenuquebec.ca avant toute décision.`}
                />
              </div>
            ) : mode === "lu" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Frais Stripe (%)" placeholder="1.5" value={stripeRateLU} onChange={setStripeRateLU} />
                  <InputField label="Taux de retour hypothétique (%)" placeholder="ex: 8" value={tauxRetourLU} onChange={setTauxRetourLU} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : TVA {(TVA_RATE_LU * 100).toFixed(0)}% du prix de vente · Frais Stripe {stripeRateLU || "0"}% + {STRIPE_FIXED_LU.toFixed(2)}€. Pas de cotisations sociales déduites ici (voir note sous le résultat).
                </div>
                <SeuilTracker
                  label="CA cumulé cette année"
                  devise="€"
                  value={caAnnuelCumuleLU}
                  onChange={setCaAnnuelCumuleLU}
                  seuil={SEUIL_FRANCHISE_LU}
                  caption={`Franchise de TVA jusqu'à ${SEUIL_FRANCHISE_LU.toLocaleString("fr-FR")}€`}
                />
              </div>
            ) : mode === "it" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Frais Stripe (%)" placeholder="1.5" value={stripeRateIT} onChange={setStripeRateIT} />
                  <InputField label="Taux de retour hypothétique (%)" placeholder="ex: 8" value={tauxRetourIT} onChange={setTauxRetourIT} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text-muted)] mb-2">
                    Régime imposta sostitutiva
                  </label>
                  <select
                    value={regimeImpostaIT}
                    onChange={(e) => setRegimeImpostaIT(e.target.value as RegimeImpostaIT)}
                    className="w-full box-border bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg px-3.5 py-3 text-[15px] text-[var(--text-primary)] outline-none transition-colors focus:border-violet-500"
                  >
                    <option value="nuova">Nouvelle activité (5% — premières 5 années)</option>
                    <option value="ordinaria">Activité établie (15%)</option>
                  </select>
                  <div className="text-[11px] text-[var(--text-faint)] mt-1.5 leading-relaxed">
                    Coefficiente di redditività fixé à {(COEFFICIENTE_REDDITIVITA_IT * 100).toFixed(0)}% (commerce de détail non alimentaire, le plus proche du dropshipping) — vérifie ton code ATECO réel, ce coefficient varie selon l&apos;activité déclarée.
                  </div>
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : Frais Stripe {stripeRateIT || "0"}% + {STRIPE_FIXED_IT.toFixed(2)}€ · TVA 0% (régime forfettario) · Imposta sostitutiva {(COEFFICIENTE_REDDITIVITA_IT * (regimeImpostaIT === "ordinaria" ? IMPOSTA_RATE_ORDINARIA_IT : IMPOSTA_RATE_NUOVA_IT) * 100).toFixed(2)}% du prix de vente.
                </div>
                <SeuilTracker
                  label="CA cumulé cette année"
                  devise="€"
                  value={caAnnuelCumuleIT}
                  onChange={setCaAnnuelCumuleIT}
                  seuil={SEUIL_FORFETTARIO_IT}
                  caption={`Effet de seuil brutal à ${SEUIL_FORFETTARIO_IT.toLocaleString("fr-FR")}€ — pas une transition progressive : au premier euro au-dessus, TVA 22% standard obligatoire ET perte définitive du régime forfettario (ce calcul suppose que tu restes sous le seuil).`}
                />
              </div>
            ) : mode === "es" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label="Frais Stripe (%)" placeholder="1.5" value={stripeRateES} onChange={setStripeRateES} />
                  <InputField label="Taux de retour hypothétique (%)" placeholder="ex: 8" value={tauxRetourES} onChange={setTauxRetourES} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  Charges appliquées automatiquement : IVA {(TVA_RATE_ES * 100).toFixed(0)}% du prix de vente, dû dès le premier euro (pas de seuil de franchise en Espagne) · Frais Stripe {stripeRateES || "0"}% + {STRIPE_FIXED_ES.toFixed(2)}€.
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
                    ? `${prixVenteMin.toFixed(2)} ${devise}`
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
                  {resultats.margeNette >= 0 ? "+" : ""}{resultats.margeNette.toFixed(2)} {devise}
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

            {/* Avertissements fixes mode US — affichés en permanence sous le résultat, pas
                en tooltip, pour rester visibles même si l'utilisateur ne survole rien. */}
            {mode === "us" && (
              <div className="mb-5 grid gap-2.5">
                <div className="text-[12.5px] text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg px-4 py-3 leading-relaxed">
                  Ce calcul n&apos;inclut pas les droits de douane spécifiques à la catégorie de ton produit — l&apos;exemption de minimis a été supprimée en 2025 et les taux varient par classification douanière (HTS) et par pays d&apos;origine. Vérifie le taux réel sur cbp.gov avant de fixer ton prix. Le taux de sales tax affiché est indicatif : ton obligation réelle de le collecter dépend du seuil de nexus économique de l&apos;État concerné, pas uniquement de la vente elle-même.
                </div>
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  Prévois de mettre de côté une réserve pour l&apos;impôt fédéral et l&apos;impôt d&apos;État sur ton profit annuel — calculé une fois par an, pas par vente. Consulte un comptable US pour ton taux réel selon ta structure (LLC, sole proprietor, etc.).
                </div>
              </div>
            )}

            {/* Note fixe mode Belgique */}
            {mode === "be" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                Cotisations calculées sur base provisoire, régularisées 2-3 ans plus tard selon ton revenu annuel réel déclaré (INASTI) — ce calcul est une estimation à date.
              </div>
            )}

            {/* Notes fixes mode Suisse */}
            {mode === "ch" && (
              <div className="mb-5 grid gap-2.5">
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  Taux de 10,0% applicable au-dessus de CHF {COTISATIONS_SEUIL_CH.toLocaleString("fr-CH")} de revenu annuel net ; barème dégressif en dessous, non modélisé ici — vérifie ta caisse de compensation AVS si ton revenu annuel est plus bas.
                </div>
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  L&apos;impôt sur le revenu (fédéral + cantonal + communal) varie fortement selon ton canton de résidence — calculé une fois par an, pas par vente. Consulte un fiduciaire pour ton taux réel.
                </div>
              </div>
            )}

            {/* Avertissements fixes mode Canada — affichés en permanence sous le résultat */}
            {mode === "ca" && (
              <div className="mb-5 grid gap-2.5">
                <div className="text-[12.5px] text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg px-4 py-3 leading-relaxed">
                  Ce calcul n&apos;inclut pas les droits de douane et taxes à l&apos;importation applicables à ta catégorie de produit — vérifie le seuil et le taux réels sur cbsa-asfc.gc.ca avant de fixer ton prix.
                </div>
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  Cotisations RRQ + RQAP plafonnées au-delà de 74 600$ de revenu net annuel — non modélisé ici pour un revenu élevé.
                </div>
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  Prévois de mettre de côté une réserve pour l&apos;impôt fédéral et provincial sur ton profit annuel — calculé une fois par an, pas par vente. Consulte un comptable pour ton taux réel selon ta structure.
                </div>
              </div>
            )}

            {/* Note fixe mode Luxembourg */}
            {mode === "lu" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                Cotisations sociales indépendant (CCSS) calculées sur ton revenu net annuel, taux variable selon statut — vérifie sur mss.public.lu ou avec un fiduciaire avant de fixer ta réserve.
              </div>
            )}

            {/* Note fixe mode Italie */}
            {mode === "it" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                Cotisations INPS non incluses — caisse Commercianti (activité de commerce) : environ 4 200€/an fixe minimum + 24,48% au-delà de 17 504€ de revenu imposable annuel. Vérifie avec un commercialista.
              </div>
            )}

            {/* Note fixe mode Espagne */}
            {mode === "es" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                Cuota d&apos;autónomo (RETA) et IRPF non inclus — le système espagnol fonctionne par tranches de revenu net mensuel avec une base de cotisation ajustable, pas par pourcentage fixe. Utilise le simulateur officiel sur seg-social.es pour estimer ta cuota réelle, et consulte un gestor pour l&apos;IRPF (barème progressif 19%-47%).
              </div>
            )}

            {/* Stats secondaires */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Coût total" value={`${resultats.coutTotal.toFixed(2)} ${devise}`} />
              <StatCard label="Charges" value={`${resultats.chargesTotal.toFixed(2)} ${devise}`} />
              <StatCard label="ROI" value={`${resultats.roi.toFixed(0)}%`} />
              <StatCard label="Break-even" value={`${resultats.breakEven.toFixed(2)} ${devise}`} />
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
                      <MiniStat label="CA" value={`${s.ca.toFixed(0)} ${devise}`} />
                      <MiniStat label="Marge brute" value={`${s.margeBrute.toFixed(0)} ${devise}`} />
                      <MiniStat label="Marge nette" value={`${s.margeNette.toFixed(0)} ${devise}`} color={getMargeColor(resultats.margePct)} />
                      <MiniStat label="Charges totales" value={`${s.charges.toFixed(0)} ${devise}`} />
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
                <MargeBarChart chartData={chartData} devise={devise} />
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

            {deleteError && (
              <div className="mb-3 text-[13px] text-[var(--danger)]">{deleteError}</div>
            )}

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
                          disabled={deletingSimId === sim.id}
                          className="bg-transparent border border-[var(--danger)]/20 text-[var(--danger)] px-3 py-[7px] rounded-[7px] text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingSimId === sim.id ? "…" : "Supprimer"}
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

// Tracker de seuil à un seul palier (Belgique/Suisse/Canada/Luxembourg) — même mécanique
// visuelle que le tracker TVA du mode France (qui a deux paliers, base + majoré, donc reste
// géré inline dans son propre bloc plutôt que via ce composant).
function SeuilTracker({
  label,
  devise,
  value,
  onChange,
  seuil,
  caption,
}: {
  label: string;
  devise: string;
  value: string;
  onChange: (v: string) => void;
  seuil: number;
  caption: string;
}) {
  const cumule = parseFloat(value) || 0;
  const pct = Math.min((cumule / seuil) * 100, 100);
  const color = cumule > seuil ? "var(--danger)" : cumule > seuil * 0.85 ? "var(--warning)" : "var(--success)";
  return (
    <div>
      <InputField label={`${label} (${devise})`} placeholder={`ex: ${Math.round(seuil * 0.4)}`} value={value} onChange={onChange} />
      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-[var(--text-faint)] mb-1.5">
          <span>Progression vers le seuil</span>
          <span className="font-semibold" style={{ color }}>{cumule.toLocaleString("fr-FR")}{devise} / {seuil.toLocaleString("fr-FR")}{devise}</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
        </div>
        <div className="text-[10.5px] text-[var(--text-faint)] mt-1.5">{caption}</div>
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
