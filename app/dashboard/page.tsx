"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { PLAN_LIMITS, getMonthlyUsage, type Plan } from "@/lib/plan-limits";
import DashboardActiviteChart from "@/components/DashboardActiviteChart";

type Profile = { nom_complet: string | null; plan: string };

type ShopifyStatus = {
  connected: boolean;
  reconnectRequired: boolean;
  disputesScopeGranted: boolean;
  incidentsSummary: { refunds30d: number; disputes30d: number | null } | null;
};

type CardStat = { label: string; value: string; accent?: string };
type CardConfig = { id: string; href: string; icon: string; title: string; stats: CardStat[] };

const PLAN_META: Record<string, { label: string; badge: string; border: string }> = {
  free:   { label: "Free",   badge: "text-zinc-300 bg-zinc-700/50",    border: "border-white/10" },
  pro:    { label: "Pro",    badge: "text-violet-300 bg-violet-600/20", border: "border-violet-500/30" },
  agency: { label: "Agency", badge: "text-amber-300 bg-amber-500/15",  border: "border-amber-500/30" },
};

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 6)  return "Bonne nuit";
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function DashboardPage() {
  const [user,          setUser]          = useState<import("@supabase/supabase-js").User | null>(null);
  const [profile,       setProfile]       = useState<Profile | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null);

  const [sitesTotal,    setSitesTotal]    = useState(0);
  const [sitesMois,     setSitesMois]     = useState(0);
  const [produitsTotal, setProduitsTotal] = useState(0);

  const [simulationsCount, setSimulationsCount] = useState(0);
  const [margeMoyenne,     setMargeMoyenne]     = useState<number | null>(null);
  const [auditsCount,      setAuditsCount]      = useState(0);
  const [scoreMoyen,       setScoreMoyen]       = useState<number | null>(null);
  const [boutiquesCount,   setBoutiquesCount]   = useState(0);
  const [produitsBoutiquesCount, setProduitsBoutiquesCount] = useState(0);
  const [auditsMoisUsage,  setAuditsMoisUsage]  = useState(0);
  const [sitesMoisUsage,   setSitesMoisUsage]   = useState(0);

  // Requête séparée (route API, pas le client Supabase browser) : shopify_connections /
  // shopify_incidents n'ont aucune policy RLS pour authenticated (accès service role
  // uniquement, voir 015/019), donc pas interrogeables directement depuis le navigateur.
  useEffect(() => {
    fetch("/api/shopify/status")
      .then((res) => res.json())
      .then((json) => setShopifyStatus(json))
      .catch(() => setShopifyStatus(null));
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      if (user) {
        const now = new Date();
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

        const [
          { data: p },
          { count: sitesTotalCount },
          { count: sitesMoisCount },
          { count: prodCount },
          { data: sims },
          { data: auds },
          { data: mesBoutiques },
        ] = await Promise.all([
          supabase.from("profils").select("nom_complet, plan").eq("id", user.id).maybeSingle(),
          supabase.from("sites_generes").select("id", { count: "exact", head: true }).eq("user_id", user.id),
          supabase.from("sites_generes").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", startOfMonth),
          supabase.from("produits").select("*", { count: "exact", head: true }),
          supabase.from("simulations_marge").select("resultats").eq("user_id", user.id).limit(500),
          supabase.from("audits_realises").select("score_total").eq("user_id", user.id).limit(500),
          // "boutiques" a aussi une policy select_public (boutiques d'autres utilisateurs
          // marquées publiques) — le filtre .eq("user_id", ...) est indispensable, la RLS
          // seule ne garantit pas qu'on ne liste que les miennes.
          supabase.from("boutiques").select("id").eq("user_id", user.id),
        ]);

        if (p) setProfile(p as Profile);
        setSitesTotal(sitesTotalCount ?? 0);
        setSitesMois(sitesMoisCount ?? 0);
        setProduitsTotal(prodCount ?? 0);

        const simRows = sims ?? [];
        setSimulationsCount(simRows.length);
        const pcts = simRows
          .map((s) => (s.resultats as { margePct?: number } | null)?.margePct)
          .filter((v): v is number => typeof v === "number");
        setMargeMoyenne(pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null);

        const audRows = auds ?? [];
        setAuditsCount(audRows.length);
        setScoreMoyen(audRows.length > 0 ? Math.round(audRows.reduce((a, r) => a + r.score_total, 0) / audRows.length) : null);

        const boutiqueIds = (mesBoutiques ?? []).map((b) => b.id);
        setBoutiquesCount(boutiqueIds.length);
        if (boutiqueIds.length > 0) {
          const { count: produitsBoutiques } = await supabase
            .from("boutique_produits")
            .select("id", { count: "exact", head: true })
            .in("boutique_id", boutiqueIds);
          setProduitsBoutiquesCount(produitsBoutiques ?? 0);
        }

        const [auditsUsed, sitesUsed] = await Promise.all([
          getMonthlyUsage(supabase, user.id, "audit_ia"),
          getMonthlyUsage(supabase, user.id, "site_builder"),
        ]);
        setAuditsMoisUsage(auditsUsed);
        setSitesMoisUsage(sitesUsed);
      }

      setLoading(false);
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d14] flex items-center justify-center">
        <div className="w-5 h-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  const planKey  = (profile?.plan ?? "free") as Plan;
  const planMeta = PLAN_META[planKey] ?? PLAN_META.free;
  const planLimits = PLAN_LIMITS[planKey];
  const prenom   = profile?.nom_complet?.split(" ")[0]
    || user?.email?.split("@")[0]
    || "là";

  const METRICS = [
    {
      id: "mois",
      label: "Sites ce mois",
      value: String(sitesMois),
      sub: "landing pages créées",
      accent: "text-violet-400",
    },
    {
      id: "total",
      label: "Sites au total",
      value: fmt(sitesTotal),
      sub: "toutes périodes",
      accent: "text-blue-400",
    },
    {
      id: "produits",
      label: "Produits disponibles",
      value: fmt(produitsTotal),
      sub: "dans le catalogue",
      accent: "text-emerald-400",
    },
    {
      id: "plan",
      label: "Plan actuel",
      value: planMeta.label,
      sub: null,
      badge: planMeta.badge,
      accent: null,
    },
  ] as const;

  const CARDS: CardConfig[] = [
    {
      id: "marges",
      href: "/dashboard/marges",
      icon: "📊",
      title: "Calculateur de marge",
      stats: [
        { label: "Simulations", value: String(simulationsCount) },
        { label: "Marge moyenne", value: margeMoyenne !== null ? `${margeMoyenne.toFixed(1)}%` : "—" },
      ],
    },
    {
      id: "audits",
      href: "/dashboard/audits",
      icon: "🔍",
      title: "Audits IA",
      stats: [
        { label: "Audits réalisés", value: String(auditsCount) },
        { label: "Score moyen", value: scoreMoyen !== null ? `${scoreMoyen}/100` : "—" },
      ],
    },
    {
      id: "shopify",
      href: "/dashboard/shopify",
      icon: "🛍️",
      title: "Remboursements & litiges",
      stats: shopifyStatus?.connected
        ? [
            { label: "Remboursements 30j", value: String(shopifyStatus.incidentsSummary?.refunds30d ?? "—") },
            {
              label: "Litiges 30j",
              value: shopifyStatus.disputesScopeGranted ? String(shopifyStatus.incidentsSummary?.disputes30d ?? "—") : "N/A",
            },
          ]
        : [{ label: "Statut", value: "Non connecté" }],
    },
    {
      id: "sites",
      href: "/dashboard/sites",
      icon: "🌐",
      title: "Sites générés",
      stats: [
        { label: "Ce mois", value: String(sitesMois) },
        { label: "Au total", value: fmt(sitesTotal) },
      ],
    },
    {
      id: "boutiques",
      href: "/dashboard/boutiques",
      icon: "🏬",
      title: "Mes boutiques",
      stats: [
        { label: "Boutiques", value: String(boutiquesCount) },
        { label: "Produits catalogués", value: String(produitsBoutiquesCount) },
      ],
    },
    {
      id: "utilisation",
      href: "/dashboard/utilisation",
      icon: "📈",
      title: "Utilisation du plan",
      stats: [
        { label: "Audits ce mois", value: `${auditsMoisUsage}${planLimits.auditsParMoisMax !== null ? `/${planLimits.auditsParMoisMax}` : ""}` },
        { label: "Sites ce mois", value: `${sitesMoisUsage}${planLimits.sitesParMoisMax !== null ? `/${planLimits.sitesParMoisMax}` : ""}` },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[#0d0d14] px-8 py-10">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">

        {/* ── Welcome ─────────────────────────────────────────────────── */}
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting()}, {prenom} 👋
          </h1>
          <p className="text-zinc-500 text-sm mt-1.5">
            Voici un aperçu de ton activité sur Dropvio.
          </p>
        </div>

        {/* ── Bannière reconnexion Shopify ─────────────────────────────── */}
        {shopifyStatus?.reconnectRequired && (
          <a
            href="/dashboard?openIntegrations=1"
            className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.07] px-5 py-4 flex items-center gap-3 hover:bg-amber-500/[0.1] transition-colors"
          >
            <span className="text-lg shrink-0">⚠️</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-200">
                Ta connexion Shopify n&apos;est plus active
              </p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">
                Le push produits et le suivi des remboursements/litiges sont en pause jusqu&apos;à la reconnexion. Clique ici pour reconnecter ta boutique.
              </p>
            </div>
          </a>
        )}

        {/* ── 4 metric cards ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {METRICS.map((m) => (
            <div
              key={m.id}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-2"
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {m.label}
              </p>
              {"badge" in m && m.badge ? (
                <span className={`self-start text-[11px] font-bold px-2.5 py-1 rounded-full ${m.badge}`}>
                  {m.value.toUpperCase()}
                </span>
              ) : (
                <span className={`text-2xl font-bold tabular-nums ${"accent" in m ? m.accent : ""}`}>
                  {m.value}
                </span>
              )}
              {m.sub && (
                <p className="text-[11px] text-zinc-600 leading-relaxed">{m.sub}</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Graphique d'activité combiné ─────────────────────────────── */}
        <DashboardActiviteChart />

        {/* ── Dashboard complet ─────────────────────────────────────────── */}
        <div>
          <div className="mb-4">
            <p className="text-sm font-semibold text-white">Dashboard complet</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">Tous tes tableaux de bord Dropvio, en un seul endroit.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-4 hover:border-white/[0.12] hover:bg-white/[0.03] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg shrink-0">{card.icon}</span>
                  <p className="text-sm font-semibold text-white">{card.title}</p>
                </div>
                <div className="flex items-center gap-6">
                  {card.stats.map((s) => (
                    <div key={s.label}>
                      <p className="text-lg font-bold tabular-nums text-zinc-100">{s.value}</p>
                      <p className="text-[10px] text-zinc-600 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Footer hint ─────────────────────────────────────────────── */}
        <p className="text-center text-[11px] text-zinc-700">
          Accède aux paramètres de ton compte via la sidebar à gauche.
        </p>

      </div>
    </div>
  );
}
