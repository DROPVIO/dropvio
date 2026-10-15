"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { PLAN_LIMITS, getMonthlyUsage, type Plan } from "@/lib/plan-limits";
import type { DashboardChartData } from "@/components/DashboardActiviteChart";

// recharts (~390 KB) ne doit jamais faire partie du bundle initial du dashboard — chargé à
// la demande, après le premier rendu. ssr: false : recharts mesure le DOM au montage
// (ResponsiveContainer), un rendu serveur n'apporterait rien et créerait un mismatch
// d'hydratation.
const DashboardActiviteChart = dynamic(() => import("@/components/DashboardActiviteChart"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 h-[420px] flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
    </div>
  ),
});

// Même chargement à la demande pour le tableau des ventes et les camemberts (recharts).
const chargementGraphique = (hauteur: number) => {
  function Chargement() {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 flex items-center justify-center" style={{ height: hauteur }}>
        <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      </div>
    );
  }
  return Chargement;
};
const VentesDashboard = dynamic(() => import("@/components/dashboard/VentesDashboard"), { ssr: false, loading: chargementGraphique(220) });
const RepartitionDashboard = dynamic(() => import("@/components/dashboard/RepartitionDashboard"), { ssr: false, loading: chargementGraphique(300) });

type Profile = { nom_complet: string | null; plan: string };

type ShopifyStatus = {
  connected: boolean;
  reconnectRequired: boolean;
  disputesScopeGranted: boolean;
  incidentsSummary: { refunds30d: number; disputes30d: number | null } | null;
};

type CardStat = { label: string; value: string; accent?: string };
type CardConfig = { id: string; href: string; icon: string; title: string; stats: CardStat[] };

// Badges opaques (pas de wash translucide) — un texte pâle sur fond teinté à faible
// opacité (l'ancien style) n'a de contraste correct que sur un fond sombre ; ces valeurs
// reprennent celles, déjà éprouvées dans les deux thèmes, de ParametresModal.tsx.
const PLAN_META: Record<string, { label: string; badge: string; border: string }> = {
  free:   { label: "Free",   badge: "bg-zinc-700 text-zinc-200",  border: "border-white/10" },
  pro:    { label: "Pro",    badge: "bg-violet-600 text-white",   border: "border-violet-500/30" },
  agency: { label: "Agency", badge: "bg-amber-400 text-black",    border: "border-amber-500/30" },
};

function fmt(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

function greetingKey(): string {
  const h = new Date().getHours();
  if (h < 6)  return "greetingNight";
  if (h < 12) return "greetingMorning";
  if (h < 18) return "greetingAfternoon";
  return "greetingEvening";
}

export default function DashboardPage() {
  const t = useTranslations("dashboard.home");
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
  const [chartData,        setChartData]        = useState<DashboardChartData | null>(null);

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

        // usage_mensuel (audit_ia seul) fusionné ici : cette requête ne dépend que de
        // user.id, déjà disponible — l'isoler dans un Promise.all séparé après coup ne
        // faisait qu'ajouter une étape séquentielle inutile.
        // site_builder n'y figure pas : ce compteur n'est jamais incrémenté (aucun appelant
        // d'incrementMonthlyUsage pour cette feature), il affichait donc 0 en permanence.
        // Le quota des sites se mesure sur les lignes de sites_generes — voir plus bas.
        const [
          { data: p },
          { data: sitesRows },
          { count: prodCount },
          { data: sims },
          { data: auds },
          { data: mesBoutiques },
          auditsUsed,
        ] = await Promise.all([
          supabase.from("profils").select("nom_complet, plan").eq("id", user.id).maybeSingle(),
          // Lignes complètes (pas juste un count) : sert à la fois au total/ce mois-ci
          // ci-dessous, au quota mensuel ET au graphique d'activité
          // (DashboardActiviteChart), qui n'a plus sa propre requête sur cette table.
          // is_trace est sélectionné pour le seul calcul du quota : les lignes de trace du
          // flux « Préparer ma boutique » (voir 028_sites_generes_is_trace.sql) ne sont pas
          // des générations et ne décomptent rien.
          supabase.from("sites_generes").select("id, created_at, is_trace").eq("user_id", user.id).limit(1000),
          // produits_dedup (supabase/migrations/027_produits_dedup_view.sql) : compte le
          // catalogue tel que l'utilisateur le voit réellement dans produits-gagnants
          // (dédupliqué par (nom, niche)), pas le nombre brut de lignes sourcées.
          supabase.from("produits_dedup").select("*", { count: "exact", head: true }),
          supabase.from("simulations_marge").select("resultats, created_at").eq("user_id", user.id).limit(500),
          supabase.from("audits_realises").select("score_total, created_at").eq("user_id", user.id).limit(500),
          // "boutiques" a aussi une policy select_public (boutiques d'autres utilisateurs
          // marquées publiques) — le filtre .eq("user_id", ...) est indispensable, la RLS
          // seule ne garantit pas qu'on ne liste que les miennes.
          supabase.from("boutiques").select("id").eq("user_id", user.id),
          getMonthlyUsage(supabase, user.id, "audit_ia"),
        ]);

        if (p) setProfile(p as Profile);

        const siteRows = sitesRows ?? [];
        setSitesTotal(siteRows.length);
        setSitesMois(siteRows.filter((s) => s.created_at >= startOfMonth).length);
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

        let boutiqueProduitsRows: { created_at: string }[] = [];
        if (boutiqueIds.length > 0) {
          const { data: bp } = await supabase
            .from("boutique_produits")
            .select("id, created_at")
            .in("boutique_id", boutiqueIds);
          boutiqueProduitsRows = bp ?? [];
          setProduitsBoutiquesCount(boutiqueProduitsRows.length);
        }

        setAuditsMoisUsage(auditsUsed);
        // Même règle exactement que celle appliquée côté serveur (app/api/generate-site,
        // app/api/sites-generes) : lignes du mois en cours, traces exclues. Calculé sur
        // siteRows, déjà chargé ci-dessus — aucune requête supplémentaire.
        setSitesMoisUsage(
          siteRows.filter((site) => site.created_at >= startOfMonth && !site.is_trace).length
        );

        // Passé en props à DashboardActiviteChart, qui n'a plus besoin de refetcher ces
        // 5 sources ni de faire son propre auth.getUser() (voir components/DashboardActiviteChart.tsx).
        setChartData({
          simulations: simRows,
          audits: audRows,
          sites: siteRows,
          boutiqueProduits: boutiqueProduitsRows,
        });
      }

      setLoading(false);
    }

    load();
  }, []);

  const planKey  = (profile?.plan ?? "free") as Plan;
  const planMeta = PLAN_META[planKey] ?? PLAN_META.free;
  const planLimits = PLAN_LIMITS[planKey];
  const prenom   = profile?.nom_complet?.split(" ")[0]
    || user?.email?.split("@")[0]
    || t("fallbackName");

  const METRICS = [
    {
      id: "mois",
      label: t("metricSitesMonth"),
      value: String(sitesMois),
      sub: t("metricSitesMonthSub"),
      accent: "text-[var(--accent)]",
    },
    {
      id: "total",
      label: t("metricSitesTotal"),
      value: fmt(sitesTotal),
      sub: t("metricSitesTotalSub"),
      accent: "text-[var(--accent-secondary)]",
    },
    {
      id: "produits",
      label: t("metricProducts"),
      value: fmt(produitsTotal),
      sub: t("metricProductsSub"),
      accent: "text-[var(--success)]",
    },
    {
      id: "plan",
      label: t("metricPlan"),
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
      title: t("cardMarges"),
      stats: [
        { label: t("cardMargesSimulations"), value: String(simulationsCount) },
        { label: t("cardMargesAverage"), value: margeMoyenne !== null ? `${margeMoyenne.toFixed(1)}%` : "—" },
      ],
    },
    {
      id: "audits",
      href: "/dashboard/audits",
      icon: "🔍",
      title: t("cardAudits"),
      stats: [
        { label: t("cardAuditsDone"), value: String(auditsCount) },
        { label: t("cardAuditsScore"), value: scoreMoyen !== null ? `${scoreMoyen}/100` : "—" },
      ],
    },
    {
      id: "shopify",
      href: "/dashboard/shopify",
      icon: "🛍️",
      title: t("cardShopify"),
      stats: shopifyStatus?.connected
        ? [
            { label: t("cardShopifyRefunds"), value: String(shopifyStatus.incidentsSummary?.refunds30d ?? "—") },
            {
              label: t("cardShopifyDisputes"),
              value: shopifyStatus.disputesScopeGranted ? String(shopifyStatus.incidentsSummary?.disputes30d ?? "—") : "N/A",
            },
          ]
        : [{ label: t("cardShopifyStatus"), value: t("cardShopifyNotConnected") }],
    },
    {
      id: "sites",
      href: "/dashboard/sites",
      icon: "🌐",
      title: t("cardSites"),
      stats: [
        { label: t("cardSitesMonth"), value: String(sitesMois) },
        { label: t("cardSitesTotal"), value: fmt(sitesTotal) },
      ],
    },
    {
      id: "boutiques",
      href: "/dashboard/boutiques",
      icon: "🏬",
      title: t("cardBoutiques"),
      stats: [
        { label: t("cardBoutiquesCount"), value: String(boutiquesCount) },
        { label: t("cardBoutiquesProducts"), value: String(produitsBoutiquesCount) },
      ],
    },
    {
      id: "utilisation",
      href: "/dashboard/utilisation",
      icon: "📈",
      title: t("cardUsage"),
      stats: [
        { label: t("cardUsageAudits"), value: `${auditsMoisUsage}${planLimits.auditsParMoisMax !== null ? `/${planLimits.auditsParMoisMax}` : ""}` },
        { label: t("cardUsageSites"), value: `${sitesMoisUsage}${planLimits.sitesParMoisMax !== null ? `/${planLimits.sitesParMoisMax}` : ""}` },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-10 sm:px-8">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-5 h-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          </div>
        ) : (
          <>
            {/* ── Welcome ─────────────────────────────────────────────────── */}
            <div>
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">
                {t("title", { greeting: t(greetingKey()), name: prenom })}
              </h1>
              <p className="text-[var(--text-faint)] text-sm mt-1.5">{t("subtitle")}</p>
            </div>

            {/* ── Bannière reconnexion Shopify ─────────────────────────────── */}
            {shopifyStatus?.reconnectRequired && (
              <a
                href="/dashboard?openIntegrations=1"
                className="rounded-2xl border border-[var(--warning)]/25 bg-[var(--warning)]/[0.07] px-5 py-4 flex items-center gap-3 hover:bg-[var(--warning)]/10 transition-colors"
              >
                <span className="text-lg shrink-0">⚠️</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--warning)]">{t("reconnectTitle")}</p>
                  <p className="text-[11px] text-[var(--warning)]/80 mt-0.5">{t("reconnectBody")}</p>
                </div>
              </a>
            )}

            {/* ── 4 metric cards ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {METRICS.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-2"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">
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
                    <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">{m.sub}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Graphique d'activité combiné ─────────────────────────────────
            Position JSX fixe, jamais dans une branche conditionnelle liée à
            "loading" : sinon React démonte/remonte le composant quand loading
            change, ce qui relance son fetch (incidents Shopify) pour rien. */}
        {/* Ventes Shopify : chiffres clés, par produit, courbes zoomables. */}
        <VentesDashboard />

        <DashboardActiviteChart chartData={chartData} />

        {/* Répartition de toute l'activité Dropvio et du budget IA, en camemberts. */}
        <RepartitionDashboard chartData={chartData} />

        {loading ? null : (
        <>
        {/* ── Dashboard complet ─────────────────────────────────────────── */}
        <div>
          <div className="mb-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">{t("cardsTitle")}</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("cardsSubtitle")}</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((card) => (
              <Link
                key={card.id}
                href={card.href}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4 hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-lg shrink-0">{card.icon}</span>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{card.title}</p>
                </div>
                <div className="flex items-center gap-6">
                  {card.stats.map((s) => (
                    <div key={s.label}>
                      <p className="text-lg font-bold tabular-nums text-[var(--text-primary)]">{s.value}</p>
                      <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* ── Footer hint ─────────────────────────────────────────────── */}
        <p className="text-center text-[11px] text-[var(--text-faint)]">{t("footerHint")}</p>
        </>
        )}

      </div>
    </div>
  );
}
