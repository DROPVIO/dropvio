"use client";

import { Suspense, useState, useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { toIntlTag, type AppLocale } from "@/lib/locale";
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
  STRIPE_FIXED_DE,
  STRIPE_RATE_DE_DEFAULT,
  TVA_RATE_DE,
  SEUIL_KLEINUNTERNEHMER_PRECEDENT_DE,
  SEUIL_KLEINUNTERNEHMER_PREVISIONNEL_DE,
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
  getMargeLabelKey,
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
  stripeRateDE: string;
  tauxRetourDE: string;
  caAnneePrecedenteDE: string;
  caPrevisionnelDE: string;
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
// labelKey résolu au rendu (dashboard.calculateur.mode*).
const MODE_OPTIONS: { value: Mode; labelKey: string }[] = [
  { value: "france", labelKey: "modeFrance" },
  { value: "uk", labelKey: "modeUk" },
  { value: "us", labelKey: "modeUs" },
  { value: "be", labelKey: "modeBe" },
  { value: "ch", labelKey: "modeCh" },
  { value: "ca", labelKey: "modeCa" },
  { value: "lu", labelKey: "modeLu" },
  { value: "de", labelKey: "modeDe" },
  { value: "it", labelKey: "modeIt" },
  { value: "es", labelKey: "modeEs" },
  { value: "manuel", labelKey: "modeManuel" },
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
  const t = useTranslations("dashboard.calculateur");
  const tCommon = useTranslations("dashboard.common");
  const intlTag = toIntlTag(useLocale() as AppLocale);
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

  // Mode Allemagne auto
  const [stripeRateDE, setStripeRateDE] = useState(STRIPE_RATE_DE_DEFAULT);
  const [tauxRetourDE, setTauxRetourDE] = useState("");
  // Kleinunternehmerregelung : deux CA indépendants, chacun avec son propre seuil (voir
  // SEUIL_KLEINUNTERNEHMER_PRECEDENT_DE / SEUIL_KLEINUNTERNEHMER_PREVISIONNEL_DE).
  const [caAnneePrecedenteDE, setCaAnneePrecedenteDE] = useState("");
  const [caPrevisionnelDE, setCaPrevisionnelDE] = useState("");

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
    stripeRateDE, tauxRetourDE,
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
    stripeRateDE, tauxRetourDE,
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
        { name: t("chartParVente"), margeBrute: resultats.margeBrute, margeNette: resultats.margeNette },
        ...scaleData.map((s) => ({
          name: t("chartCmdParMois", { n: s.n }),
          margeBrute: s.margeBrute,
          margeNette: s.margeNette,
        })),
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
      stripeRateDE, tauxRetourDE, caAnneePrecedenteDE, caPrevisionnelDE,
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
          nom:
            nomSimulation.trim() ||
            t("saveDefaultName", { date: new Date().toLocaleDateString(intlTag) }),
          inputs,
          resultats: resultatsSnapshot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? t("saveError"));
        return;
      }
      setSimulations((prev) => [data as SimulationMarge, ...prev]);
      setNomSimulation("");
    } catch {
      setSaveError(t("saveErrorServer"));
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
    if (i.stripeRateDE !== undefined) setStripeRateDE(i.stripeRateDE);
    if (i.tauxRetourDE !== undefined) setTauxRetourDE(i.tauxRetourDE);
    if (i.caAnneePrecedenteDE !== undefined) setCaAnneePrecedenteDE(i.caAnneePrecedenteDE);
    if (i.caPrevisionnelDE !== undefined) setCaPrevisionnelDE(i.caPrevisionnelDE);
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
    if (!confirm(t("simConfirmDelete"))) return;
    setDeletingSimId(id);
    setDeleteError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.from("simulations_marge").delete().eq("id", id);
      if (error) {
        setDeleteError(t("simDeleteError"));
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
          <h1 className="text-[32px] font-bold m-0 leading-tight text-[var(--text-primary)]">{t("title")}</h1>
          <p className="text-[var(--text-faint)] mt-2.5 text-[15px]">{t("subtitle")}</p>
        </div>

        {/* Sélection du mode — <select> plutôt qu'une rangée de boutons, illisible à 8 modes */}
        <div className="mb-5">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as Mode)}
            className="w-full box-border bg-[var(--surface)] border border-[var(--border-strong)] rounded-xl px-4 py-3.5 text-[14.5px] font-semibold text-[var(--text-primary)] outline-none cursor-pointer focus:border-violet-500"
          >
            {MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </div>

        {/* Formulaire */}
        <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border-strong)] mb-6">
          <div className="grid gap-5">

            <InputField
              label={t("fieldPrixFournisseur", { devise })}
              placeholder="8.50"
              value={prixFournisseur}
              onChange={setPrixFournisseur}
              required
            />
            <InputField
              label={t("fieldFraisLivraison", { devise })}
              placeholder="2.00"
              value={fraisLivraison}
              onChange={setFraisLivraison}
            />
            <InputField
              label={t("fieldPrixVente", { devise })}
              placeholder="29.99"
              value={prixVente}
              onChange={setPrixVente}
              required
            />
            <InputField
              label={t("fieldBudgetPub", { devise })}
              placeholder="5.00"
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
                  {t("franceExtraUE")}
                </label>

                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("franceCharges", {
                    stripe: extraUE ? "2,5%" : "1,5%",
                    zone: extraUE ? t("franceZoneHorsUE") : t("franceZoneUE"),
                  })}
                  {extraUE && t("franceTaxeUE", { montant: TAXE_UE_FLAT.toFixed(2) })}.
                </div>

                <div>
                  <InputField
                    label={t("fieldCaCumuleEuro")}
                    placeholder="32000"
                    value={caAnnuelCumule}
                    onChange={setCaAnnuelCumule}
                  />
                  <div className="mt-3">
                    <div className="flex justify-between text-[11px] text-[var(--text-faint)] mb-1.5">
                      <span>{t("franceProgressionTva")}</span>
                      <span className="font-semibold" style={{ color: tvaColor }}>{caCumule.toLocaleString(intlTag)}€ / {SEUIL_TVA.toLocaleString(intlTag)}€</span>
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
                      {t("franceFranchise", {
                        seuil: SEUIL_TVA.toLocaleString(intlTag),
                        majore: SEUIL_TVA_MAJORE.toLocaleString(intlTag),
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : mode === "uk" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    label={t("fieldStripeUk")}
                    placeholder="1.5"
                    value={stripeRateUK}
                    onChange={setStripeRateUK}
                  />
                  <InputField
                    label={t("fieldTauxRetour")}
                    placeholder="8"
                    value={tauxRetourUK}
                    onChange={setTauxRetourUK}
                  />
                </div>

                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("ukCharges", {
                    vat: (VAT_RATE_UK * 100).toFixed(0),
                    stripe: stripeRateUK || "0",
                    fixe: STRIPE_FIXED_UK.toFixed(2),
                  })}
                </div>

                {(parseFloat(prixVente) || 0) >= DOUANE_SEUIL_UK && (
                  <div className="text-xs text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg px-3.5 py-2.5 leading-relaxed">
                    {t("ukDouane", { seuil: DOUANE_SEUIL_UK })}
                  </div>
                )}

                {/* Curseur profit annuel — indicatif, séparé du calcul de marge par vente */}
                <div className="pt-3 border-t border-[var(--border)]">
                  <div className="flex justify-between text-[13px] text-[var(--text-muted)] mb-2">
                    <span>{t("ukProfitAnnuel")}</span>
                    <span className="font-semibold text-[var(--text-primary)]">£{(parseFloat(profitAnnuelUK) || 0).toLocaleString(intlTag)}</span>
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
                    {t("ukTauxMarginal")}
                    <span className="font-semibold text-[var(--text-muted)]">{t(tauxMarginal.labelKey)}</span>.{" "}
                    {t("ukTauxMarginalNote")}
                  </div>
                </div>
              </div>
            ) : mode === "us" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text-muted)] mb-2">
                    {t("usStateLabel")} <span className="text-[var(--accent)]">*</span>
                  </label>
                  <select
                    value={usState}
                    onChange={(e) => setUsState(e.target.value)}
                    className="w-full box-border bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg px-3.5 py-3 text-[15px] text-[var(--text-primary)] outline-none transition-colors focus:border-violet-500"
                  >
                    <option value="">{t("usStatePlaceholder")}</option>
                    {US_STATE_SALES_TAX.map((s) => (
                      <option key={s.code} value={s.code}>{t(`usStates.${s.code}`)} ({s.code})</option>
                    ))}
                  </select>
                  <div className="text-[11px] text-[var(--text-faint)] mt-1.5 leading-relaxed">
                    {usState
                      ? t("usStateTaxKnown", { taux: (getUsStateTax(usState) * 100).toFixed(3) })
                      : t("usStateTaxUnknown")}
                  </div>
                </div>

                <label className="flex items-center gap-2.5 text-[13.5px] text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={salesTaxNexusUS}
                    onChange={(e) => setSalesTaxNexusUS(e.target.checked)}
                    className="w-4 h-4 accent-violet-600"
                  />
                  {t("usNexus")}
                </label>

                <div className="grid grid-cols-2 gap-4">
                  <InputField
                    label={t("fieldStripeUs")}
                    placeholder="2.9"
                    value={stripeRateUS}
                    onChange={setStripeRateUS}
                  />
                  <InputField
                    label={t("fieldTauxRetour")}
                    placeholder="8"
                    value={tauxRetourUS}
                    onChange={setTauxRetourUS}
                  />
                </div>

                <InputField
                  label={t("fieldDouaneInfo")}
                  placeholder="0"
                  value={droitDouaneUS}
                  onChange={setDroitDouaneUS}
                />

                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("usCharges", {
                    stripe: stripeRateUS || "0",
                    fixe: STRIPE_FIXED_US.toFixed(2),
                    salesTax:
                      salesTaxNexusUS && usState
                        ? t("usChargesSalesTax", {
                            taux: (getUsStateTax(usState) * 100).toFixed(3),
                            etat: usState,
                          })
                        : t("usChargesNoNexus"),
                  })}
                </div>
              </div>
            ) : mode === "be" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label={t("fieldStripe")} placeholder="1.5" value={stripeRateBE} onChange={setStripeRateBE} />
                  <InputField label={t("fieldTauxRetour")} placeholder="8" value={tauxRetourBE} onChange={setTauxRetourBE} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("beCharges", {
                    tva: (TVA_RATE_BE * 100).toFixed(0),
                    stripe: stripeRateBE || "0",
                    fixe: STRIPE_FIXED_BE.toFixed(2),
                    cotisations: (COTISATIONS_RATE_BE * 100).toFixed(1),
                  })}
                </div>
                <SeuilTracker
                  label={t("fieldCaCumule")}
                  devise="€"
                  value={caAnnuelCumuleBE}
                  onChange={setCaAnnuelCumuleBE}
                  seuil={SEUIL_FRANCHISE_BE}
                  progressionLabel={t("seuilProgression")}
                  intlTag={intlTag}
                  caption={t("beFranchise", { seuil: SEUIL_FRANCHISE_BE.toLocaleString(intlTag) })}
                />
              </div>
            ) : mode === "ch" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label={t("fieldStripe")} placeholder="2.9" value={stripeRateCH} onChange={setStripeRateCH} />
                  <InputField label={t("fieldTauxRetour")} placeholder="8" value={tauxRetourCH} onChange={setTauxRetourCH} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("chCharges", {
                    tva: (TVA_RATE_CH * 100).toFixed(1),
                    stripe: stripeRateCH || "0",
                    fixe: STRIPE_FIXED_CH.toFixed(2),
                  })}
                </div>
                <SeuilTracker
                  label={t("fieldCaCumule")}
                  devise=" CHF"
                  value={caAnnuelCumuleCH}
                  onChange={setCaAnnuelCumuleCH}
                  seuil={SEUIL_IMMAT_CH}
                  progressionLabel={t("seuilProgression")}
                  intlTag={intlTag}
                  caption={t("chImmat", { seuil: SEUIL_IMMAT_CH.toLocaleString(intlTag) })}
                />
              </div>
            ) : mode === "ca" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label={t("fieldStripe")} placeholder="2.9" value={stripeRateCA} onChange={setStripeRateCA} />
                  <InputField label={t("fieldTauxRetour")} placeholder="8" value={tauxRetourCA} onChange={setTauxRetourCA} />
                </div>
                <InputField
                  label={t("fieldDouaneInfo")}
                  placeholder="0"
                  value={droitDouaneCA}
                  onChange={setDroitDouaneCA}
                />
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("caCharges", {
                    tps: (TPS_TVQ_RATE_CA * 100).toFixed(3),
                    stripe: stripeRateCA || "0",
                    fixe: STRIPE_FIXED_CA.toFixed(2),
                  })}
                </div>
                <SeuilTracker
                  label={t("fieldCaCumule")}
                  devise=" CAD"
                  value={caAnnuelCumuleCA}
                  onChange={setCaAnnuelCumuleCA}
                  seuil={SEUIL_PETIT_FOURNISSEUR_CA}
                  progressionLabel={t("seuilProgression")}
                  intlTag={intlTag}
                  caption={t("caPetitFournisseur", { seuil: SEUIL_PETIT_FOURNISSEUR_CA.toLocaleString(intlTag) })}
                />
              </div>
            ) : mode === "lu" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label={t("fieldStripe")} placeholder="1.5" value={stripeRateLU} onChange={setStripeRateLU} />
                  <InputField label={t("fieldTauxRetour")} placeholder="8" value={tauxRetourLU} onChange={setTauxRetourLU} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("luCharges", {
                    tva: (TVA_RATE_LU * 100).toFixed(0),
                    stripe: stripeRateLU || "0",
                    fixe: STRIPE_FIXED_LU.toFixed(2),
                  })}
                </div>
                <SeuilTracker
                  label={t("fieldCaCumule")}
                  devise="€"
                  value={caAnnuelCumuleLU}
                  onChange={setCaAnnuelCumuleLU}
                  seuil={SEUIL_FRANCHISE_LU}
                  progressionLabel={t("seuilProgression")}
                  intlTag={intlTag}
                  caption={t("luFranchise", { seuil: SEUIL_FRANCHISE_LU.toLocaleString(intlTag) })}
                />
              </div>
            ) : mode === "de" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label={t("fieldStripe")} placeholder="1.5" value={stripeRateDE} onChange={setStripeRateDE} />
                  <InputField label={t("fieldTauxRetour")} placeholder="8" value={tauxRetourDE} onChange={setTauxRetourDE} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("deCharges", {
                    tva: (TVA_RATE_DE * 100).toFixed(0),
                    stripe: stripeRateDE || "0",
                    fixe: STRIPE_FIXED_DE.toFixed(2),
                  })}
                </div>
                <SeuilTracker
                  label={t("fieldCaAnneePrecedente")}
                  devise="€"
                  value={caAnneePrecedenteDE}
                  onChange={setCaAnneePrecedenteDE}
                  seuil={SEUIL_KLEINUNTERNEHMER_PRECEDENT_DE}
                  progressionLabel={t("seuilProgression")}
                  intlTag={intlTag}
                  caption={t("deCondition1", { seuil: SEUIL_KLEINUNTERNEHMER_PRECEDENT_DE.toLocaleString(intlTag) })}
                />
                <SeuilTracker
                  label={t("fieldCaPrevisionnel")}
                  devise="€"
                  value={caPrevisionnelDE}
                  onChange={setCaPrevisionnelDE}
                  seuil={SEUIL_KLEINUNTERNEHMER_PREVISIONNEL_DE}
                  progressionLabel={t("seuilProgression")}
                  intlTag={intlTag}
                  caption={t("deCondition2", { seuil: SEUIL_KLEINUNTERNEHMER_PREVISIONNEL_DE.toLocaleString(intlTag) })}
                />
                {(parseFloat(caAnneePrecedenteDE) > SEUIL_KLEINUNTERNEHMER_PRECEDENT_DE || parseFloat(caPrevisionnelDE) > SEUIL_KLEINUNTERNEHMER_PREVISIONNEL_DE) && (
                  <div className="text-[12.5px] text-[var(--danger)] bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-lg px-4 py-3 leading-relaxed">
                    {t("deSeuilDepasse")}
                  </div>
                )}
              </div>
            ) : mode === "it" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label={t("fieldStripe")} placeholder="1.5" value={stripeRateIT} onChange={setStripeRateIT} />
                  <InputField label={t("fieldTauxRetour")} placeholder="8" value={tauxRetourIT} onChange={setTauxRetourIT} />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-[var(--text-muted)] mb-2">
                    {t("itRegimeLabel")}
                  </label>
                  <select
                    value={regimeImpostaIT}
                    onChange={(e) => setRegimeImpostaIT(e.target.value as RegimeImpostaIT)}
                    className="w-full box-border bg-[var(--bg)] border border-[var(--border-strong)] rounded-lg px-3.5 py-3 text-[15px] text-[var(--text-primary)] outline-none transition-colors focus:border-violet-500"
                  >
                    <option value="nuova">{t("itRegimeNuova")}</option>
                    <option value="ordinaria">{t("itRegimeOrdinaria")}</option>
                  </select>
                  <div className="text-[11px] text-[var(--text-faint)] mt-1.5 leading-relaxed">
                    {t("itCoefficiente", { coefficiente: (COEFFICIENTE_REDDITIVITA_IT * 100).toFixed(0) })}
                  </div>
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("itCharges", {
                    stripe: stripeRateIT || "0",
                    fixe: STRIPE_FIXED_IT.toFixed(2),
                    imposta: (
                      COEFFICIENTE_REDDITIVITA_IT *
                      (regimeImpostaIT === "ordinaria" ? IMPOSTA_RATE_ORDINARIA_IT : IMPOSTA_RATE_NUOVA_IT) *
                      100
                    ).toFixed(2),
                  })}
                </div>
                <SeuilTracker
                  label={t("fieldCaCumule")}
                  devise="€"
                  value={caAnnuelCumuleIT}
                  onChange={setCaAnnuelCumuleIT}
                  seuil={SEUIL_FORFETTARIO_IT}
                  progressionLabel={t("seuilProgression")}
                  intlTag={intlTag}
                  caption={t("itSeuil", { seuil: SEUIL_FORFETTARIO_IT.toLocaleString(intlTag) })}
                />
              </div>
            ) : mode === "es" ? (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <InputField label={t("fieldStripe")} placeholder="1.5" value={stripeRateES} onChange={setStripeRateES} />
                  <InputField label={t("fieldTauxRetour")} placeholder="8" value={tauxRetourES} onChange={setTauxRetourES} />
                </div>
                <div className="text-xs text-[var(--text-faint)] leading-relaxed">
                  {t("esCharges", {
                    iva: (TVA_RATE_ES * 100).toFixed(0),
                    stripe: stripeRateES || "0",
                    fixe: STRIPE_FIXED_ES.toFixed(2),
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-[var(--bg-sunken)] rounded-xl p-5 border border-[var(--border)] grid grid-cols-2 gap-4">
                <InputField
                  label={t("fieldTauxCharge")}
                  placeholder="15"
                  value={tauxCharge}
                  onChange={setTauxCharge}
                />
                <InputField
                  label={t("fieldTauxTaxe")}
                  placeholder="5"
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
            {t("calculInverse")}
          </h2>
          <div className="grid grid-cols-2 gap-4 items-end">
            <InputField
              label={t("fieldMargeCible")}
              placeholder="30"
              value={margeCible}
              onChange={setMargeCible}
            />
            <div className="bg-[var(--bg-sunken)] rounded-[10px] px-4 py-3 border border-[var(--border)] h-[46px] flex items-center justify-between">
              <span className="text-xs text-[var(--text-faint)]">{t("prixVenteMin")}</span>
              <span className={`text-base font-bold ${prixVenteMin !== null ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}`}>
                {margeCible
                  ? prixVenteMin !== null
                    ? `${prixVenteMin.toFixed(2)} ${devise}`
                    : t("prixVenteImpossible")
                  : "—"}
              </span>
            </div>
          </div>
          {margeCible && prixVenteMin === null && (
            <div className="mt-3 text-[12.5px] text-[var(--danger)]">{t("margeCibleInatteignable")}</div>
          )}
        </div>

        {/* Résultats */}
        {resultats ? (
          <div className="bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border-strong)]">
            <h2 className="mt-0 mb-6 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
              {t("resultats")}
            </h2>

            {/* Marge principale */}
            <div className={`bg-[var(--bg-sunken)] rounded-xl px-7 py-6 mb-5 border flex justify-between items-center ${MARGE_BORDER[margeTier(resultats.margePct)]}`}>
              <div>
                <div className="text-[13px] text-[var(--text-faint)] mb-1">{t("margeNetteParVente")}</div>
                <div className="text-4xl font-bold" style={{ color: getMargeColor(resultats.margePct) }}>
                  {resultats.margeNette >= 0 ? "+" : ""}{resultats.margeNette.toFixed(2)} {devise}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[22px] font-bold" style={{ color: getMargeColor(resultats.margePct) }}>
                  {resultats.margePct.toFixed(1)}%
                </div>
                <div className="text-xs font-semibold mt-1" style={{ color: getMargeColor(resultats.margePct) }}>
                  {t(getMargeLabelKey(resultats.margePct))}
                </div>
              </div>
            </div>

            {/* Avertissements fixes mode US — affichés en permanence sous le résultat, pas
                en tooltip, pour rester visibles même si l'utilisateur ne survole rien. */}
            {mode === "us" && (
              <div className="mb-5 grid gap-2.5">
                <div className="text-[12.5px] text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg px-4 py-3 leading-relaxed">
                  {t("noteUs1")}
                </div>
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  {t("noteUs2")}
                </div>
              </div>
            )}

            {/* Note fixe mode Belgique */}
            {mode === "be" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                {t("noteBe")}
              </div>
            )}

            {/* Notes fixes mode Suisse */}
            {mode === "ch" && (
              <div className="mb-5 grid gap-2.5">
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  {t("noteCh1", { seuil: COTISATIONS_SEUIL_CH.toLocaleString(intlTag) })}
                </div>
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  {t("noteCh2")}
                </div>
              </div>
            )}

            {/* Avertissements fixes mode Canada — affichés en permanence sous le résultat */}
            {mode === "ca" && (
              <div className="mb-5 grid gap-2.5">
                <div className="text-[12.5px] text-[var(--warning)] bg-[var(--warning)]/10 border border-[var(--warning)]/20 rounded-lg px-4 py-3 leading-relaxed">
                  {t("noteCa1")}
                </div>
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  {t("noteCa2")}
                </div>
                <div className="text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                  {t("noteCa3")}
                </div>
              </div>
            )}

            {/* Note fixe mode Luxembourg */}
            {mode === "lu" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                {t("noteLu")}
              </div>
            )}

            {/* Note fixe mode Allemagne */}
            {mode === "de" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                {t("noteDe")}
              </div>
            )}

            {/* Note fixe mode Italie */}
            {mode === "it" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                {t("noteIt")}
              </div>
            )}

            {/* Note fixe mode Espagne */}
            {mode === "es" && (
              <div className="mb-5 text-[12.5px] text-[var(--text-faint)] bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-4 py-3 leading-relaxed">
                {t("noteEs")}
              </div>
            )}

            {/* Stats secondaires */}
            <div className="grid grid-cols-4 gap-3">
              <StatCard label={t("statCoutTotal")} value={`${resultats.coutTotal.toFixed(2)} ${devise}`} />
              <StatCard label={t("statCharges")} value={`${resultats.chargesTotal.toFixed(2)} ${devise}`} />
              <StatCard label={t("statRoi")} value={`${resultats.roi.toFixed(0)}%`} />
              <StatCard label={t("statBreakEven")} value={`${resultats.breakEven.toFixed(2)} ${devise}`} />
            </div>

            {/* Détail des charges — libellé et note traduits depuis les clés renvoyées par
                getCharges (lib/calcul-marge reste du calcul pur, sans texte localisé). */}
            <div className="mt-5 grid gap-2">
              {charges.breakdown.map((c) => (
                <div key={c.labelKey} className="flex justify-between text-[12.5px] text-[var(--text-faint)]">
                  <span>{t(c.labelKey)}</span>
                  <span className="text-[var(--text-muted)]">
                    {c.detail}
                    {c.noteKey ? t(c.noteKey, c.noteValues) : null}
                  </span>
                </div>
              ))}
            </div>

            {/* Sauvegarde de la simulation */}
            {user ? (
              <div className="mt-5 flex gap-2.5">
                <input
                  type="text"
                  placeholder={t("savePlaceholder")}
                  value={nomSimulation}
                  onChange={(e) => setNomSimulation(e.target.value)}
                  className="flex-1 bg-[var(--bg-sunken)] border border-[var(--border-strong)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[var(--text-primary)] outline-none focus:border-violet-500"
                />
                <button
                  onClick={handleSauvegarder}
                  disabled={saving}
                  className={`bg-violet-600 text-white border-none px-4.5 py-2.5 rounded-lg text-[13.5px] font-semibold whitespace-nowrap ${saving ? "cursor-default opacity-60" : "cursor-pointer"}`}
                >
                  {saving ? t("saving") : t("saveButton")}
                </button>
              </div>
            ) : null}
            {saveError && (
              <div className="mt-3 px-3.5 py-2.5 bg-[var(--danger)]/10 border border-[var(--danger)]/20 rounded-lg text-[12.5px] text-[var(--danger)]">
                {saveError}
              </div>
            )}
            {!user && (
              <div className="mt-5 text-[12.5px] text-[var(--text-faint)]">{t("loginToSave")}</div>
            )}

            {/* Conseil */}
            {resultats.margePct < 20 && (
              <div className="mt-5 px-4.5 py-3.5 bg-[var(--danger)]/10 rounded-[10px] border border-[var(--danger)]/20 text-[13px] text-[var(--danger)] leading-relaxed">
                {t("conseilFaible")}
              </div>
            )}
            {resultats.margePct >= 40 && (
              <div className="mt-5 px-4.5 py-3.5 bg-[var(--success)]/10 rounded-[10px] border border-[var(--success)]/20 text-[13px] text-[var(--success)] leading-relaxed">
                {t("conseilBonne")}
              </div>
            )}

            {/* Simulation à l'échelle */}
            <div className="mt-8">
              <h2 className="mt-0 mb-4 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
                {t("simulationEchelle")}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {scaleData.map((s) => (
                  <div key={s.n} className="bg-[var(--bg-sunken)] rounded-xl px-4 py-4.5 border border-[var(--border)]">
                    <div className="text-xs font-bold text-[var(--accent)] mb-3">
                      {t("commandesParMois", { n: s.n })}
                    </div>
                    <div className="grid gap-2">
                      <MiniStat label={t("miniCa")} value={`${s.ca.toFixed(0)} ${devise}`} />
                      <MiniStat label={t("miniMargeBrute")} value={`${s.margeBrute.toFixed(0)} ${devise}`} />
                      <MiniStat label={t("miniMargeNette")} value={`${s.margeNette.toFixed(0)} ${devise}`} color={getMargeColor(resultats.margePct)} />
                      <MiniStat label={t("miniCharges")} value={`${s.charges.toFixed(0)} ${devise}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Graphique marge brute vs marge nette */}
            <div className="mt-7">
              <h2 className="mt-0 mb-4 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
                {t("chartTitle")}
              </h2>
              <div className="bg-[var(--bg-sunken)] rounded-xl border border-[var(--border)] pt-4 px-2 pb-2">
                <MargeBarChart chartData={chartData} devise={devise} />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-[var(--surface)] rounded-2xl p-10 border border-[var(--border-strong)] text-center text-[var(--text-faint)] text-sm">
            {t("emptyResults")}
          </div>
        )}

        {/* Simulations sauvegardées */}
        {user && (
          <div className="bg-[var(--surface)] rounded-2xl p-7 border border-[var(--border-strong)] mt-6">
            <h2 className="mt-0 mb-4 text-base font-semibold text-[var(--text-faint)] uppercase tracking-[0.1em]">
              {t("mesSimulations")}
            </h2>

            {deleteError && (
              <div className="mb-3 text-[13px] text-[var(--danger)]">{deleteError}</div>
            )}

            {loadingSims ? (
              <div className="text-[13px] text-[var(--text-faint)]">{tCommon("loading")}</div>
            ) : simulations.length === 0 ? (
              <div className="text-[13px] text-[var(--text-faint)]">{t("simsEmpty")}</div>
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
                          {new Date(sim.created_at).toLocaleDateString(intlTag, { day: "numeric", month: "short", year: "numeric" })}
                          {margePct !== null && (
                            <span className="font-semibold" style={{ color: getMargeColor(margePct) }}>
                              {t("simsNet", { pct: margePct.toFixed(1) })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => handleCharger(sim)}
                          className="bg-violet-500/10 border border-violet-500/30 text-[var(--accent)] px-3 py-[7px] rounded-[7px] text-xs font-semibold cursor-pointer"
                        >
                          {t("simCharger")}
                        </button>
                        <button
                          onClick={() => handleSupprimer(sim.id)}
                          disabled={deletingSimId === sim.id}
                          className="bg-transparent border border-[var(--danger)]/20 text-[var(--danger)] px-3 py-[7px] rounded-[7px] text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deletingSimId === sim.id ? "…" : t("simSupprimer")}
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
  progressionLabel,
  intlTag,
}: {
  label: string;
  devise: string;
  value: string;
  onChange: (v: string) => void;
  seuil: number;
  caption: string;
  progressionLabel: string;
  intlTag: string;
}) {
  const cumule = parseFloat(value) || 0;
  const pct = Math.min((cumule / seuil) * 100, 100);
  const color = cumule > seuil ? "var(--danger)" : cumule > seuil * 0.85 ? "var(--warning)" : "var(--success)";
  return (
    <div>
      <InputField label={`${label} (${devise})`} placeholder={String(Math.round(seuil * 0.4))} value={value} onChange={onChange} />
      <div className="mt-3">
        <div className="flex justify-between text-[11px] text-[var(--text-faint)] mb-1.5">
          <span>{progressionLabel}</span>
          <span className="font-semibold" style={{ color }}>{cumule.toLocaleString(intlTag)}{devise} / {seuil.toLocaleString(intlTag)}{devise}</span>
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
