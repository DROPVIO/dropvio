"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import Logo from "./Logo";
import ParametresModal from "./ParametresModal";
import type { User } from "@supabase/supabase-js";
import { GROUPES_NAV, basculerGroupe, groupeDeLaRoute, ouvertAuChargement, sousEntreeActive, type GroupeId, type SousEntree } from "@/lib/sidebar-nav";

type Profile = { nom_complet: string | null; plan: string };

// ─── Icons ───────────────────────────────────────────────────────────────────

const IcoTrophy = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M8 10.5V13M5.5 14.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M4 2.5H2.5V5c0 1.7 1.3 3 2.5 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M12 2.5h1.5V5c0 1.7-1.3 3-2.5 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M4 2.5h8v5a4 4 0 01-8 0V2.5Z" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);

const IcoGlobe = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 2c-1.5 1.8-2 3.7-2 6s.5 4.2 2 6M8 2c1.5 1.8 2 3.7 2 6s-.5 4.2-2 6M2.5 8h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoVentes = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 2.5h1.6l1.6 7.5h7.3l1.5-5.5H4.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="6.2" cy="12.8" r="1" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="11.5" cy="12.8" r="1" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);

const IcoCalc = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="2" width="10" height="12" rx="2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M5.5 5.5h5M5.5 8.5h1.5M9 8.5h1.5M5.5 11.5h1.5M9 11.5h1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoAudit = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="1.5" width="8.5" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M4.5 5h4M4.5 7.5h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <circle cx="11.5" cy="11.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M13.3 13.3L15 15" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoStudio = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.3"/>
    <circle cx="5.5" cy="6.5" r="1" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M2.5 11.5L6 8.5l2.5 2 2-1.5 3 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoQuota = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2.5 11.5a5.5 5.5 0 1111 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    <path d="M8 11.5l2.5-3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoBook = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M2 3.2c1.2-.6 2.7-.9 4-.9 1 0 2 .2 2.8.6v9.4c-.8-.4-1.8-.6-2.8-.6-1.3 0-2.8.3-4 .9V3.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
    <path d="M14 3.2c-1.2-.6-2.7-.9-4-.9-1 0-2 .2-2.8.6v9.4c.8-.4 1.8-.6 2.8-.6 1.3 0 2.8.3 4 .9V3.2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
  </svg>
);

const IcoDashboard = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="2" y="2" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="2" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="2" y="9" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
    <rect x="9" y="9" width="5" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
  </svg>
);

const IcoSettings = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.3"/>
    <path d="M8 2V3.5M8 12.5V14M2 8H3.5M12.5 8H14M3.5 3.5L4.6 4.6M11.4 11.4L12.5 12.5M12.5 3.5L11.4 4.6M4.6 11.4L3.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
  </svg>
);

const IcoPlus = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M6.5 2v9M2 6.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </svg>
);

const IcoChevronLeft = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M9 3L5 7L9 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoChevronDown = ({ ouvert }: { ouvert: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true" className={`shrink-0 transition-transform duration-150 ${ouvert ? "rotate-180" : ""}`}>
    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IcoGear = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <circle cx="6.5" cy="6.5" r="1.8" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M6.5 1.5V3M6.5 10V11.5M1.5 6.5H3M10 6.5H11.5M3 3L4 4M9 9L10 10M10 3L9 4M4 9L3 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

// ─── Nav config ───────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  /** Clé de traduction sous dashboard.nav — le libellé est résolu au rendu. */
  labelKey: string;
  expertOnly?: boolean;
  icon: React.ReactNode;
  soon?: boolean;
  /** Clé ciblée par le tutoriel d'onboarding (voir components/onboarding). */
  onboardingTarget?: string;
  /** Entrée à sous-menu (lib/sidebar-nav.ts) : un clic l'ouvre au lieu de changer de page. */
  groupe?: GroupeId;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard",         labelKey: "itemDashboard",         icon: <IcoDashboard />, onboardingTarget: "dashboard" },
  { href: "/produits-gagnants", labelKey: "itemProduitsGagnants",  icon: <IcoTrophy />,    onboardingTarget: "produits-gagnants", groupe: "produits-gagnants" },
  // « Mes sites » (/mes-sites) est une sous-entrée de Site Builder.
  { href: "/site-builder",      labelKey: "itemSiteBuilder",       icon: <IcoGlobe />,     onboardingTarget: "site-builder", groupe: "site-builder" },
  { href: "/studio",            labelKey: "itemStudio",            icon: <IcoStudio /> },
  { href: "/ventes",            labelKey: "itemVentes",            icon: <IcoVentes /> },
  { href: "/audit",             labelKey: "itemAudit",             icon: <IcoAudit />,     onboardingTarget: "audit" },
  { href: "/tools/calculateur-marge", labelKey: "itemCalculateurMarge", icon: <IcoCalc />, onboardingTarget: "calculateur-marge" },
  { href: "/quota",             labelKey: "itemQuota",             icon: <IcoQuota />, expertOnly: true },
  { href: "/formation",         labelKey: "itemFormation",         icon: <IcoBook /> },
];

// Classes communes aux entrées et sous-entrées : mêmes couleurs, police et espacements.
const ENTREE_ACTIVE = "bg-[var(--surface-3)] text-[var(--text-primary)]";
const ENTREE_INACTIVE = "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]";

/** Entrée à sous-menu. Barre dépliée : accordéon, sous-entrées juste dessous avec un retrait.
 *  Barre repliée : panneau volant à droite de l'icône, au survol, au focus ou au clic (tactile). */
function NavGroupe({
  item,
  label,
  ouvert,
  collapsed,
  pathname,
  onBasculer,
  onNavigate,
}: {
  item: NavItem & { groupe: GroupeId };
  label: string;
  ouvert: boolean;
  collapsed: boolean;
  pathname: string;
  onBasculer: () => void;
  /** Appelé au clic sur une sous-entrée (ferme le tiroir mobile). */
  onNavigate?: () => void;
}) {
  const t = useTranslations("dashboard.nav");
  const enfants: readonly SousEntree[] = GROUPES_NAV[item.groupe];
  const actif = sousEntreeActive(pathname, enfants);
  const idListe = `sous-menu-${item.groupe}`;
  const bouton = useRef<HTMLButtonElement>(null);
  const [volant, setVolant] = useState<number | null>(null);

  // Panneau volant : fermé à la navigation et à la touche Échap.
  const [cheminVolant, setCheminVolant] = useState(pathname);
  if (cheminVolant !== pathname) {
    setCheminVolant(pathname);
    setVolant(null);
  }
  const ouvrirVolant = () => setVolant(bouton.current?.getBoundingClientRect().top ?? 0);
  const conteneur = useRef<HTMLDivElement>(null);

  // Un clic ou un appui en dehors ferme le panneau (au tactile, il n'y a pas de « sortie » du survol).
  useEffect(() => {
    if (volant === null) return;
    const fermerSiDehors = (e: PointerEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setVolant(null);
    };
    document.addEventListener("pointerdown", fermerSiDehors);
    return () => document.removeEventListener("pointerdown", fermerSiDehors);
  }, [volant]);

  // Parent mis en évidence quand une de ses sous-entrées est active et qu'on ne la voit pas.
  const parentEnEvidence = actif !== null && (collapsed || !ouvert);

  const sousEntrees = (dansVolant: boolean) =>
    enfants.map((enfant) => {
      const libelle = t(enfant.labelKey);
      const estActif = actif?.href === enfant.href;
      const cls = `relative flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${
        enfant.soon ? "cursor-not-allowed text-[var(--text-faint)] opacity-60" : estActif ? ENTREE_ACTIVE : ENTREE_INACTIVE
      }`;
      return (
        <li key={enfant.href}>
          {enfant.soon ? (
            <span className={cls} aria-disabled="true">
              <span className="flex-1 whitespace-nowrap">{libelle}</span>
              <span className="text-[9px] font-bold bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-faint)] px-1.5 py-0.5 rounded-full">{t("soon")}</span>
            </span>
          ) : (
            <Link href={enfant.href} onClick={onNavigate} aria-current={estActif ? "page" : undefined} className={cls}>
              {estActif && !dansVolant && <span className="absolute -left-[9px] top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--accent)] rounded-r-full" />}
              <span className="flex-1 whitespace-nowrap">{libelle}</span>
            </Link>
          )}
        </li>
      );
    });

  return (
    <div
      ref={conteneur}
      className="shrink-0"
      onMouseEnter={collapsed ? ouvrirVolant : undefined}
      onMouseLeave={collapsed ? () => setVolant(null) : undefined}
      onKeyDown={(e) => { if (e.key === "Escape") setVolant(null); }}
    >
      <button
        ref={bouton}
        type="button"
        // Replié : le clic ouvre toujours (le survol l'a souvent déjà fait ; basculer le refermerait).
        onClick={collapsed ? ouvrirVolant : onBasculer}
        onFocus={collapsed ? ouvrirVolant : undefined}
        aria-expanded={collapsed ? volant !== null : ouvert}
        aria-controls={idListe}
        title={collapsed ? label : undefined}
        data-onboarding-target={item.onboardingTarget}
        className={`relative flex w-full items-center gap-3 rounded-lg text-sm transition-all duration-150 ${
          collapsed ? "w-10 h-10 mx-auto justify-center" : "px-3 py-2.5 text-left"
        } ${parentEnEvidence ? ENTREE_ACTIVE : ENTREE_INACTIVE}`}
      >
        {parentEnEvidence && !collapsed && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--accent)] rounded-r-full" />
        )}
        <span className={`shrink-0 ${actif ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}`}>{item.icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1 whitespace-nowrap">{label}</span>
            <span className="text-[var(--text-faint)]"><IcoChevronDown ouvert={ouvert} /></span>
          </>
        )}
      </button>

      {!collapsed && ouvert && (
        <ul id={idListe} aria-label={label} className="mt-1 ml-[21px] flex flex-col gap-1 border-l border-[var(--border)] pl-2">
          {sousEntrees(false)}
        </ul>
      )}

      {collapsed && volant !== null && (
        // position fixed : la barre latérale coupe ce qui déborde (overflow-hidden). Le pont
        // invisible (pl-2) garde le survol actif entre l'icône et le panneau.
        <div className="fixed left-16 z-50 pl-2" style={{ top: volant }}>
          <ul
            id={idListe}
            aria-label={label}
            className="flex min-w-[200px] flex-col gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-sunken)] p-2 shadow-xl"
          >
            <li className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">{label}</li>
            {sousEntrees(true)}
          </ul>
        </div>
      )}
    </div>
  );
}

const PLAN_CLS: Record<string, string> = {
  aucun:  "text-[var(--text-faint)]",
  pro:    "text-[var(--accent)]",
  agency: "text-[var(--warning)]",
  expert: "text-[var(--success)]",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Sidebar({
  collapsed: collapsedProp,
  onCollapse,
  variante = "barre",
  onCloseMobile,
}: {
  collapsed: boolean;
  onCollapse: () => void;
  /** « barre » : colonne fixe du desktop (≥ 1024 px, largeur --largeur-barre).
   *  « tiroir » : contenu du tiroir mobile (< 1024 px), toujours déplié. */
  variante?: "barre" | "tiroir";
  /** Ferme le tiroir mobile (appelé à chaque navigation depuis le tiroir). */
  onCloseMobile?: () => void;
}) {
  const tiroir = variante === "tiroir";
  const collapsed = collapsedProp && !tiroir;
  const t        = useTranslations("dashboard.nav");
  const pathname = usePathname();
  const router   = useRouter();

  const [user,       setUser]       = useState<User | null>(null);
  const [profile,    setProfile]    = useState<Profile | null>(null);
  const [planEnVigueur, setPlanEnVigueur] = useState<string | null>(null);
  const [modalOpen,  setModalOpen]  = useState(false);
  const [modalShopifyMsg, setModalShopifyMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [modalOpenIntegrations, setModalOpenIntegrations] = useState(false);

  // Sous-menu ouvert (un seul à la fois). Au chargement et à chaque navigation vers une
  // sous-entrée, c'est celui de la route active (lib/sidebar-nav.ts).
  const [groupeOuvert, setGroupeOuvert] = useState<GroupeId | null>(() => ouvertAuChargement(pathname));
  const [cheminVu, setCheminVu] = useState(pathname);
  if (cheminVu !== pathname) {
    setCheminVu(pathname);
    const groupe = groupeDeLaRoute(pathname);
    if (groupe) setGroupeOuvert(groupe);
  }

  // Retour du round-trip OAuth Shopify (/api/shopify/callback) : rouvre la modale de
  // paramètres directement sur l'onglet Intégrations avec le résultat de la connexion.
  // openIntegrations=1 (sans shopifyConnected/shopifyError) : même mécanisme, déclenché par
  // un lien "Reconnecter" ailleurs dans l'app (ex: bannière Dashboard) — ouvre direct sur
  // l'onglet Intégrations sans message de résultat. openPlan=1 ouvre la modale sur la section
  // Plan (section par défaut), voir lib/plan-links.ts.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("shopifyConnected");
    const err = params.get("shopifyError");
    const openIntegrations = params.get("openIntegrations");
    const openPlan = params.get("openPlan");
    if (!connected && !err && !openIntegrations && !openPlan) return;

    params.delete("shopifyConnected");
    params.delete("shopifyError");
    params.delete("openIntegrations");
    params.delete("openPlan");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);

    // setState différé (microtask) plutôt qu'appelé en synchrone dans le corps de
    // l'effet, pour éviter le re-render en cascade immédiat (react-hooks/set-state-in-effect).
    queueMicrotask(() => {
      if (connected || err) {
        setModalShopifyMsg(
          connected ? { ok: true, text: t("shopifyConnected") } : { ok: false, text: err! }
        );
      }
      if (connected || err || openIntegrations) setModalOpenIntegrations(true);
      setModalOpen(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) {
        supabase
          .from("profils")
          .select("nom_complet, plan")
          .eq("id", data.user.id)
          .maybeSingle()
          .then(({ data: p }) => { if (p) setProfile(p as Profile); });
        // Plan réellement en vigueur (un Expert sans période en cours n'en a aucun) : résolu par le
        // serveur, comme partout ailleurs, plutôt que lu tel quel dans profils.plan.
        fetch("/api/plan")
          .then((res) => res.json())
          .then((json) => setPlanEnVigueur(typeof json?.plan === "string" ? json.plan : null))
          .catch(() => setPlanEnVigueur(null));
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const initials  = (profile?.nom_complet || user?.email || "?").slice(0, 2).toUpperCase();
  const planKey   = planEnVigueur ?? "aucun";
  const planLabel = planEnVigueur
    ? t("planLabel", { plan: planEnVigueur.charAt(0).toUpperCase() + planEnVigueur.slice(1) })
    : t("aucunAbonnement");
  const displayName = profile?.nom_complet || user?.email || "";

  return (
    <>
      <aside
        className={
          tiroir
            ? "flex h-full w-full flex-col overflow-hidden bg-[var(--bg-sunken)]"
            : "fixed top-0 left-0 z-40 hidden h-dvh w-[var(--largeur-barre)] flex-col overflow-hidden border-r border-[var(--border)] bg-[var(--bg-sunken)] transition-[width] duration-200 ease-in-out lg:flex"
        }
      >
        {/* ── Logo ──────────────────────────────────────────────────────── */}
        <Link
          href="/dashboard"
          onClick={onCloseMobile}
          data-onboarding-target="logo"
          className="flex items-center gap-2.5 border-b border-[var(--border)] shrink-0 h-[57px] px-4 hover:bg-[var(--surface-2)] transition-colors"
        >
          <Logo className="w-6 h-6 shrink-0 text-[var(--logo-accent)]" />
          <span
            className={`text-[15px] font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] bg-clip-text text-transparent whitespace-nowrap transition-[opacity,width] duration-150 ${
              collapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
            }`}
          >
            Dropvio
          </span>
        </Link>

        {/* ── Nav ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden p-2 gap-1">

          {/* CTA */}
          <button
            onClick={() => { onCloseMobile?.(); router.push("/site-builder"); }}
            title={collapsed ? t("newGeneration") : undefined}
            className={`flex items-center gap-2.5 rounded-xl font-semibold text-sm transition-all shadow-[0_0_18px_rgba(124,58,237,0.18)] bg-gradient-to-br from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400 text-white shrink-0 ${
              collapsed
                ? "w-10 h-10 mx-auto justify-center"
                : "w-full px-4 py-2.5"
            }`}
          >
            <IcoPlus />
            {!collapsed && <span className="whitespace-nowrap">{t("newGeneration")}</span>}
          </button>

          <div className="h-px bg-[var(--border)] my-1.5 shrink-0" />

          {/* Links */}
          {NAV_ITEMS.filter((item) => !item.expertOnly || planEnVigueur === "expert").map((item) => {
            const { href, labelKey, icon, soon, onboardingTarget, groupe } = item;
            const label = t(labelKey);
            if (groupe) {
              return (
                <NavGroupe
                  key={href}
                  item={{ ...item, groupe }}
                  label={label}
                  ouvert={groupeOuvert === groupe}
                  collapsed={collapsed}
                  pathname={pathname}
                  onBasculer={() => setGroupeOuvert((o) => basculerGroupe(o, groupe))}
                  onNavigate={onCloseMobile}
                />
              );
            }
            const isActive = pathname.startsWith(href);
            const className = `relative flex items-center gap-3 rounded-lg text-sm transition-all duration-150 shrink-0 ${
              collapsed ? "w-10 h-10 mx-auto justify-center" : "px-3 py-2.5"
            } ${
              soon
                ? "opacity-40 cursor-not-allowed text-[var(--text-faint)]"
                : isActive
                ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
            }`;
            const inner = (
              <>
                {/* Active pill */}
                {isActive && !collapsed && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[var(--accent)] rounded-r-full" />
                )}

                <span className={`shrink-0 ${isActive ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}`}>
                  {icon}
                </span>

                {!collapsed && (
                  <>
                    <span className="flex-1 whitespace-nowrap">{label}</span>
                    {soon && (
                      <span className="text-[9px] font-bold bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-faint)] px-1.5 py-0.5 rounded-full">
                        {t("soon")}
                      </span>
                    )}
                  </>
                )}
              </>
            );

            // "soon" (aucun NAV_ITEM aujourd'hui, mais le type le permet) : jamais un vrai
            // lien, donc pas de Link (pas de prefetch/navigation vers une route qui n'a
            // rien à afficher) — un <span> non cliquable garde le même rendu visuel.
            return soon ? (
              <span key={href} title={collapsed ? label : undefined} className={className}>
                {inner}
              </span>
            ) : (
              <Link
                key={href}
                href={href}
                onClick={onCloseMobile}
                title={collapsed ? label : undefined}
                data-onboarding-target={onboardingTarget}
                className={className}
              >
                {inner}
              </Link>
            );
          })}

          {/* Paramètres */}
          <div className="h-px bg-[var(--border)] my-1 shrink-0" />
          <button
            onClick={() => setModalOpen(true)}
            title={collapsed ? t("settings") : undefined}
            className={`relative flex items-center gap-3 rounded-lg text-sm transition-all duration-150 shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] ${
              collapsed ? "w-10 h-10 mx-auto justify-center" : "px-3 py-2.5"
            }`}
          >
            <span className="shrink-0 text-[var(--text-faint)]"><IcoSettings /></span>
            {!collapsed && <span className="flex-1 whitespace-nowrap text-left">{t("settings")}</span>}
          </button>
        </div>

        {/* ── Collapse button ───────────────────────────────────────────── */}
        <div className={`px-2 pb-1 shrink-0 ${tiroir ? "hidden" : ""} ${collapsed ? "flex justify-center" : ""}`}>
          <button
            onClick={onCollapse}
            title={collapsed ? t("expandTooltip") : t("collapseTooltip")}
            className={`flex items-center gap-2 rounded-lg text-[11px] text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--surface-2)] transition h-8 ${
              collapsed ? "w-10 justify-center" : "w-full px-3"
            }`}
          >
            {collapsed ? <IcoChevronRight /> : (
              <>
                <IcoChevronLeft />
                <span className="whitespace-nowrap">{t("collapse")}</span>
              </>
            )}
          </button>
        </div>

        {/* ── User block ────────────────────────────────────────────────── */}
        <div className="border-t border-[var(--border)] p-2 shrink-0">
          {user && (
            <button
              onClick={() => setModalOpen(true)}
              title={collapsed ? t("userTooltip", { name: displayName }) : undefined}
              className={`flex items-center gap-2.5 w-full rounded-xl hover:bg-[var(--surface-2)] transition-colors px-2 py-2 group text-left ${
                collapsed ? "justify-center" : ""
              }`}
            >
              {/* Avatar */}
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-600 to-violet-800 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                {initials}
              </div>

              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-[var(--text-primary)] truncate leading-snug">
                      {displayName}
                    </p>
                    <p className={`text-[11px] leading-snug ${PLAN_CLS[planKey] ?? PLAN_CLS.aucun}`}>
                      {planLabel}
                    </p>
                  </div>
                  <span className="text-[var(--text-faint)] group-hover:text-[var(--text-muted)] transition-colors shrink-0">
                    <IcoGear />
                  </span>
                </>
              )}
            </button>
          )}
          {user && !planEnVigueur && !collapsed ? (
            <Link
              href="/abonnement"
              onClick={onCloseMobile}
              className="mt-1 block rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[var(--accent)] hover:bg-[var(--surface-2)]"
            >
              {t("choisirAbonnement")}
            </Link>
          ) : null}
        </div>
      </aside>

      {/* Paramètres modal */}
      {modalOpen && user && (
        <ParametresModal
          user={user}
          onClose={() => { setModalOpen(false); setModalShopifyMsg(null); setModalOpenIntegrations(false); }}
          initialSection={modalOpenIntegrations ? "integrations" : undefined}
          initialShopifyMessage={modalShopifyMsg}
        />
      )}
    </>
  );
}
