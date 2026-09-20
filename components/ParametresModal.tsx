"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useOnboarding } from "./onboarding/OnboardingProvider";
import { UsageMeter } from "./UsageMeter";
import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { setLocaleCookie, type AppLocale } from "@/lib/locale";

const SUPPORT_EMAIL = "support@dropvio.com";
const LEGAL_EMAIL = "legal@dropvio.com";

// ─── Types ──────────────────────────────────────────────────────────────────

type Profile = {
  nom_complet: string | null;
  plan: string;
  langue?: string | null;
  notif_email?: boolean | null;
  notif_push?: boolean | null;
};
type SectionId =
  | "plan" | "profil" | "securite" | "preferences" | "usage"
  | "integrations" | "facturation" | "legal" | "danger";

// ─── Plan config ─────────────────────────────────────────────────────────────
// Label/description/prix/features viennent des traductions (parametres.plan.*) — seules les
// classes de style, non localisées, restent ici.

const PLAN_STYLE: Record<string, { badge: string; border: string; bg: string; glow: string }> = {
  free:   { badge: "bg-zinc-700 text-zinc-200",  border: "border-[var(--border-strong)]", bg: "bg-[var(--surface)]",  glow: "" },
  pro:    { badge: "bg-violet-600 text-white",   border: "border-violet-500/40",   bg: "bg-violet-500/[0.06]",  glow: "shadow-[0_0_28px_rgba(124,58,237,0.14)]" },
  agency: { badge: "bg-amber-400 text-black",   border: "border-amber-400/40",    bg: "bg-amber-400/[0.05]",   glow: "shadow-[0_0_28px_rgba(251,191,36,0.11)]" },
};

// ─── Shared styles ───────────────────────────────────────────────────────────

const FIELD = "w-full bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/40 transition";
const LABEL = "block text-xs font-medium text-[var(--text-muted)] mb-1.5";
const BTN_V = "px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed";
const BTN_G = "px-4 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border-strong)] hover:bg-[var(--surface-3)] text-[var(--text-primary)] text-xs font-semibold transition disabled:opacity-40";
const MSG_OK = "text-[11px] text-[var(--success)]";
const MSG_ERR = "text-[11px] text-[var(--danger)]";
const SECTION_TITLE = "text-[15px] font-semibold text-[var(--text-primary)]";
const SECTION_SUB = "text-[12px] text-[var(--text-faint)] mt-0.5";
const DIVIDER = "border-t border-[var(--border)] my-5";
const ROW = "flex items-center justify-between gap-4";

// ─── Icons ───────────────────────────────────────────────────────────────────

const Ico = {
  plan: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 1.5L10.5 6H3.5L7 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M3.5 6L5.5 12.5H8.5L10.5 6" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  ),
  profil: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="4.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 12c0-2.2 2.2-4 5-4s5 1.8 5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  securite: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="3" y="6.5" width="8" height="5.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5 6.5V4.5a2 2 0 014 0V6.5" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  ),
  preferences: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M7 2V3.5M7 10.5V12M2 7h1.5M10.5 7H12M3.5 3.5l1 1M9.5 9.5l1 1M3.5 10.5l1-1M9.5 4.5l1-1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  integrations: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="3.5" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <circle cx="10.5" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5.5 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  usage: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 11.5V7M7 11.5V2.5M11.5 11.5V5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  facturation: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="3.5" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M2 6.5h10M5 9h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  legal: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="3" y="1.5" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M5.5 5h3M5.5 7.5h3M5.5 10h1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  danger: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M7 2L12.5 11.5H1.5L7 2Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M7 6v2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      <circle cx="7" cy="10" r="0.5" fill="currentColor"/>
    </svg>
  ),
  ext: (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
      <path d="M2 8L8 2M4.5 2H8V5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6.5L4.5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${on ? "bg-violet-600" : "bg-[var(--surface-3)]"}`}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

// ─── Nav config ──────────────────────────────────────────────────────────────
// Ordre des sections + icônes — les labels viennent des traductions (parametres.nav.*),
// construits dans le composant plutôt qu'ici au niveau module (useTranslations est un hook).

const NAV_SECTIONS: Exclude<SectionId, "danger">[] = [
  "plan", "profil", "securite", "preferences", "usage", "integrations", "facturation", "legal",
];
const NAV_ICONS: Record<Exclude<SectionId, "danger">, React.ReactNode> = {
  plan: Ico.plan,
  profil: Ico.profil,
  securite: Ico.securite,
  preferences: Ico.preferences,
  usage: Ico.usage,
  integrations: Ico.integrations,
  facturation: Ico.facturation,
  legal: Ico.legal,
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function ParametresModal({
  user,
  onClose,
  initialSection,
  initialShopifyMessage,
}: {
  user: User;
  onClose: () => void;
  initialSection?: SectionId;
  initialShopifyMessage?: { ok: boolean; text: string } | null;
}) {
  const t = useTranslations("parametres");
  const supabase = createSupabaseBrowserClient();
  const router = useRouter();
  const overlayRef = useRef<HTMLDivElement>(null);
  const { restart: restartOnboarding } = useOnboarding();

  const [activeSection, setActiveSection] = useState<SectionId>(initialSection ?? "plan");

  // Profile
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nomComplet, setNomComplet] = useState("");
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Password
  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [changingPwd, setChangingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Preferences
  const [langue, setLangue] = useState<AppLocale>("fr");
  // Initialisé à "dark" (valeur par défaut de app/globals.css) puis synchronisé depuis
  // localStorage au montage — le data-theme réel est déjà posé avant hydratation par le
  // script inline de app/layout.tsx, cet état ne fait que refléter ce choix dans l'UI.
  const [theme, setThemeState] = useState<Theme>("dark");
  // setState différé (microtask) plutôt qu'appelé en synchrone dans le corps de l'effet, pour
  // éviter le re-render en cascade immédiat (react-hooks/set-state-in-effect) — même pattern
  // que app/boutiques/[slug]/panier/page.tsx.
  useEffect(() => { queueMicrotask(() => setThemeState(getStoredTheme())); }, []);

  function handleThemeChange(next: Theme) {
    setThemeState(next);
    applyTheme(next);
  }
  const [notifEmail, setNotifEmail] = useState(true);
  const [notifPush, setNotifPush] = useState(false);
  const [prefMsg, setPrefMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Usage
  type UsageMetric = { key: string; label: string; used: number; max: number | null };
  type BoutiqueUsage = { id: string; nom: string; used: number; max: number | null };
  type UsageData = {
    plan: string;
    monthly: UsageMetric[];
    total: UsageMetric[];
    catalogue: { max: number | null };
    boutiques: BoutiqueUsage[];
  };
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/usage")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setUsageError(json.error ?? "Impossible de charger ton utilisation.");
          return;
        }
        setUsage(json);
      })
      .catch(() => setUsageError("Impossible de contacter le serveur."))
      .finally(() => setUsageLoading(false));
  }, []);

  // Integrations — Shopify
  type ShopifyStatus = {
    configured: boolean;
    connected: boolean;
    reconnectRequired: boolean;
    shop_domain: string | null;
    shop_name: string | null;
    connected_at: string | null;
    disputesScopeGranted: boolean;
  };
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null);
  const [shopifyStatusLoading, setShopifyStatusLoading] = useState(true);
  const [shopifyDomainInput, setShopifyDomainInput] = useState("");
  const [shopifyConnecting, setShopifyConnecting] = useState(false);
  const [shopifyDisconnecting, setShopifyDisconnecting] = useState(false);
  const [intMsg, setIntMsg] = useState<{ ok: boolean; text: string } | null>(initialShopifyMessage ?? null);

  useEffect(() => {
    fetch("/api/shopify/status")
      .then((res) => res.json())
      .then((json) => {
        setShopifyStatus(json);
        if (json?.reconnectRequired && json.shop_domain) {
          setShopifyDomainInput(json.shop_domain);
        }
      })
      .catch(() => setShopifyStatus(null))
      .finally(() => setShopifyStatusLoading(false));
  }, []);

  async function handleConnectShopify() {
    const shop = shopifyDomainInput.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      setIntMsg({ ok: false, text: t("integrations.shopifyFormatError") });
      return;
    }
    if (shopifyStatus && !shopifyStatus.configured) {
      setIntMsg({ ok: false, text: t("integrations.shopifyNotConfiguredError") });
      return;
    }
    setShopifyConnecting(true);
    setIntMsg(null);
    // /api/shopify/connect répond par une redirection 302 en cas de succès (donc rien à lire
    // ici), mais un JSON d'erreur sinon (ex. session expirée) — vérifiée avant de naviguer en
    // plein-page pour ne plus jamais éjecter l'utilisateur sur une page de JSON brut hors app.
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setShopifyConnecting(false);
      setIntMsg({ ok: false, text: t("integrations.shopifySessionExpired") });
      return;
    }
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/shopify/connect?shop=${encodeURIComponent(shop)}&returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function handleDisconnectShopify() {
    setShopifyDisconnecting(true);
    setIntMsg(null);
    try {
      const res = await fetch("/api/shopify/disconnect", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setIntMsg({ ok: false, text: json.error ?? t("integrations.shopifyDisconnectError") });
        return;
      }
      setShopifyStatus((s) => (s ? { ...s, connected: false, reconnectRequired: false, shop_domain: null, shop_name: null } : s));
      setIntMsg({ ok: true, text: t("integrations.shopifyDisconnectSuccess") });
    } catch {
      setIntMsg({ ok: false, text: t("integrations.serverUnreachable") });
    } finally {
      setShopifyDisconnecting(false);
    }
  }

  // Danger zone
  useEffect(() => {
    supabase
      .from("profils")
      .select("nom_complet, plan, langue, notif_email, notif_push")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfile(data as Profile);
          setNomComplet(data.nom_complet ?? "");
          setLangue(data.langue === "en" ? "en" : "fr");
          setNotifEmail(data.notif_email ?? true);
          setNotifPush(data.notif_push ?? false);
        } else {
          supabase
            .from("profils")
            .upsert({ id: user.id, nom_complet: null, plan: "free" })
            .then(() => setProfile({ nom_complet: null, plan: "free" }));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function handleSaveProfile() {
    setSaving(true);
    setProfileMsg(null);
    const { error } = await supabase
      .from("profils")
      .upsert({ id: user.id, nom_complet: nomComplet.trim() || null });
    setSaving(false);
    if (error) {
      setProfileMsg({ ok: false, text: t("profil.saveError") });
    } else {
      setProfile((p) => p ? { ...p, nom_complet: nomComplet.trim() || null } : p);
      setProfileMsg({ ok: true, text: t("profil.saveSuccess") });
      setTimeout(() => setProfileMsg(null), 3000);
    }
  }

  async function handleSavePreferences() {
    setSavingPrefs(true);
    setPrefMsg(null);
    const langueChanged = langue !== (profile?.langue ?? "fr");
    const { error } = await supabase
      .from("profils")
      .upsert({ id: user.id, langue, notif_email: notifEmail, notif_push: notifPush });
    setSavingPrefs(false);
    if (error) {
      setPrefMsg({ ok: false, text: t("preferences.saveError") });
    } else {
      setProfile((p) => (p ? { ...p, langue, notif_email: notifEmail, notif_push: notifPush } : p));
      setPrefMsg({ ok: true, text: t("preferences.saveSuccess") });
      setTimeout(() => setPrefMsg(null), 3000);
      if (langueChanged) {
        // Persiste aussi côté cookie pour que le choix survive à une déconnexion (une fois
        // déconnecté, profils.langue ne compte plus, voir lib/locale.ts) — puis rafraîchit
        // l'arbre serveur (middleware -> i18n/request.ts) sans reload complet du navigateur :
        // router.refresh() ré-exécute le middleware, qui relit profils.langue à jour.
        setLocaleCookie(langue);
        router.refresh();
      }
    }
  }

  async function handleChangePassword() {
    if (!currentPwd) { setPwdMsg({ ok: false, text: t("securite.errorMissingCurrent") }); return; }
    if (!newPwd || newPwd.length < 6) { setPwdMsg({ ok: false, text: t("securite.errorTooShort") }); return; }
    if (newPwd !== confirmPwd) { setPwdMsg({ ok: false, text: t("securite.errorMismatch") }); return; }
    if (!user.email) { setPwdMsg({ ok: false, text: t("securite.errorNoEmail") }); return; }
    setChangingPwd(true);
    setPwdMsg(null);

    // Supabase n'expose pas de vérification directe du mot de passe actuel : on ré-authentifie
    // avec signInWithPassword (échoue si le mot de passe actuel est faux) avant d'autoriser
    // updateUser, pour ne pas permettre de changer le mot de passe avec juste une session active.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPwd,
    });
    if (verifyError) {
      setChangingPwd(false);
      setPwdMsg({ ok: false, text: t("securite.errorWrongCurrent") });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPwd });
    setChangingPwd(false);
    if (error) {
      setPwdMsg({ ok: false, text: error.message });
    } else {
      setPwdMsg({ ok: true, text: t("securite.success") });
      setCurrentPwd(""); setNewPwd(""); setConfirmPwd("");
      setTimeout(() => setPwdMsg(null), 3000);
    }
  }

  const plan = profile?.plan ?? "free";
  // Repli sur "free" pour la clé de traduction si plan contient une valeur inattendue (même
  // garde que PLAN_STYLE ci-dessous) — évite un throw next-intl sur une clé manquante.
  const planKey = plan in PLAN_STYLE ? plan : "free";
  const planStyle = PLAN_STYLE[planKey];
  const planLabel = t(`plan.meta.${planKey}.label`);
  const planDesc = t(`plan.meta.${planKey}.desc`);

  // ── Section renderers ────────────────────────────────────────────────────

  const renderPlan = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("plan.title")}</p>
        <p className={SECTION_SUB}>{t("plan.subtitle")}</p>
      </div>

      {/* Current plan banner */}
      <div className={`rounded-xl border px-5 py-4 ${planStyle.border} ${planStyle.bg} ${planStyle.glow}`}>
        <div className={ROW}>
          <div>
            <p className="text-[10px] font-semibold text-[var(--text-faint)] uppercase tracking-widest mb-1">{t("plan.currentPlanLabel")}</p>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold text-[var(--text-primary)]">{planLabel}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${planStyle.badge}`}>{planLabel.toUpperCase()}</span>
            </div>
            <p className="text-[11px] text-[var(--text-faint)] mt-1">{planDesc}</p>
          </div>
          <button
            className={`${BTN_G} opacity-40 cursor-not-allowed`}
            disabled
            title={t("plan.changePlanTooltip", { email: SUPPORT_EMAIL })}
          >
            {t("plan.changePlan")}
          </button>
        </div>
      </div>

      {/* Plan comparison */}
      <div className="grid grid-cols-3 gap-3">
        {(["free", "pro", "agency"] as const).map((p) => {
          const style = PLAN_STYLE[p];
          const isCurrent = plan === p;
          return (
            <div key={p} className={`rounded-xl border p-4 flex flex-col gap-3 transition ${isCurrent ? `${style.border} ${style.bg}` : "border-[var(--border)] bg-[var(--surface-2)]"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">{t(`plan.meta.${p}.label`)}</span>
                  <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t(`plan.price.${p}`)}</p>
                </div>
                {isCurrent && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${style.badge}`}>{t("plan.current")}</span>
                )}
              </div>
              <ul className="flex flex-col gap-1.5">
                {t.raw(`plan.features.${p}`).map((f: string) => (
                  <li key={f} className="flex items-start gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <span className="text-[var(--success)] mt-[1px] shrink-0">{Ico.check}</span>
                    {f}
                  </li>
                ))}
              </ul>
              {!isCurrent && (
                <button
                  className="mt-auto w-full py-1.5 rounded-lg text-xs font-semibold bg-[var(--surface-2)] border border-[var(--border-strong)] text-[var(--text-primary)] opacity-40 cursor-not-allowed"
                  disabled
                  title={t("plan.chooseTooltip", { email: SUPPORT_EMAIL })}
                >
                  {t("plan.choose")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderProfil = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("profil.title")}</p>
        <p className={SECTION_SUB}>{t("profil.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className={LABEL}>{t("profil.emailLabel")}</label>
          <p className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2.5 text-sm text-[var(--text-muted)] truncate">{user.email}</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-1.5">{t("profil.emailCaption")}</p>
        </div>

        <div>
          <label className={LABEL}>{t("profil.nomLabel")}</label>
          <input
            type="text"
            value={nomComplet}
            onChange={(e) => setNomComplet(e.target.value)}
            placeholder={t("profil.nomPlaceholder")}
            className={FIELD}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleSaveProfile} disabled={saving || profile === null} className={BTN_V}>
          {saving ? t("profil.saving") : t("profil.save")}
        </button>
        {profileMsg && <p className={profileMsg.ok ? MSG_OK : MSG_ERR}>{profileMsg.text}</p>}
      </div>

      <div className={DIVIDER} />

      <div>
        <p className="text-[12px] font-medium text-[var(--text-muted)] mb-0.5">{t("profil.avatarTitle")}</p>
        <p className="text-[11px] text-[var(--text-faint)] mb-3">{t("profil.avatarCaption")}</p>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center text-lg font-bold text-white">
            {(nomComplet || user.email || "?").slice(0, 2).toUpperCase()}
          </div>
          <button className={`${BTN_G} opacity-40 cursor-not-allowed`} disabled>{t("profil.avatarChange")}</button>
        </div>
      </div>
    </div>
  );

  const renderSecurite = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("securite.title")}</p>
        <p className={SECTION_SUB}>{t("securite.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className={LABEL}>{t("securite.currentPwdLabel")}</label>
          <input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} placeholder={t("securite.pwdPlaceholder")} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{t("securite.newPwdLabel")}</label>
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder={t("securite.newPwdPlaceholder")} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>{t("securite.confirmPwdLabel")}</label>
          <input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder={t("securite.pwdPlaceholder")} className={FIELD} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={handleChangePassword} disabled={changingPwd || !currentPwd || !newPwd || !confirmPwd} className={BTN_V}>
          {changingPwd ? t("securite.submitting") : t("securite.submit")}
        </button>
        {pwdMsg && <p className={pwdMsg.ok ? MSG_OK : MSG_ERR}>{pwdMsg.text}</p>}
      </div>

      <div className={DIVIDER} />

      <div>
        <p className="text-[12px] font-medium text-[var(--text-muted)] mb-3">{t("securite.sessionsTitle")}</p>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--text-primary)]">{t("securite.currentSession")}</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">
              {t("securite.currentSessionCaption", { date: new Date().toLocaleDateString(langue === "en" ? "en-US" : "fr-FR") })}
            </p>
          </div>
          <span className="w-2 h-2 rounded-full bg-[var(--success)] shadow-[0_0_6px_var(--success)]" />
        </div>
      </div>
    </div>
  );

  const renderPreferences = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("preferences.title")}</p>
        <p className={SECTION_SUB}>{t("preferences.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-5">
        <div className={ROW}>
          <div>
            <p className="text-sm text-[var(--text-primary)]">{t("preferences.langueLabel")}</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("preferences.langueCaption")}</p>
          </div>
          <select
            value={langue}
            onChange={(e) => setLangue(e.target.value === "en" ? "en" : "fr")}
            className="bg-[var(--bg-sunken)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition shrink-0"
          >
            <option value="fr">{t("preferences.langueFr")}</option>
            <option value="en">{t("preferences.langueEn")}</option>
          </select>
        </div>

        <div className={DIVIDER} />

        <div className={ROW}>
          <div>
            <p className="text-sm text-[var(--text-primary)]">{t("preferences.themeLabel")}</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("preferences.themeCaption")}</p>
          </div>
          <div className="inline-flex gap-1 p-1 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] shrink-0">
            {([
              { id: "dark", label: t("preferences.themeDark") },
              { id: "light", label: t("preferences.themeLight") },
            ] as const).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleThemeChange(opt.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                  theme === opt.id
                    ? "bg-violet-600 text-white"
                    : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className={DIVIDER} />

        <div>
          <p className="text-[12px] font-medium text-[var(--text-muted)] mb-4">{t("preferences.notifTitle")}</p>
          <div className="flex flex-col gap-4">
            <div className={ROW}>
              <div>
                <p className="text-sm text-[var(--text-primary)]">{t("preferences.notifEmailLabel")}</p>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("preferences.notifEmailCaption")}</p>
              </div>
              <Toggle on={notifEmail} onChange={setNotifEmail} />
            </div>
            <div className={ROW}>
              <div>
                <p className="text-sm text-[var(--text-primary)]">{t("preferences.notifPushLabel")}</p>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("preferences.notifPushCaption")}</p>
              </div>
              <Toggle on={notifPush} onChange={setNotifPush} />
            </div>
          </div>
        </div>

        <div className={DIVIDER} />

        <div className={ROW}>
          <div>
            <p className="text-sm text-[var(--text-primary)]">{t("preferences.tutorialLabel")}</p>
            <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("preferences.tutorialCaption")}</p>
          </div>
          <button
            className={`${BTN_G} shrink-0`}
            onClick={() => { onClose(); restartOnboarding(); }}
          >
            {t("preferences.tutorialRestart")}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className={BTN_V} onClick={handleSavePreferences} disabled={savingPrefs}>
          {savingPrefs ? t("preferences.saving") : t("preferences.save")}
        </button>
        {prefMsg && <p className={prefMsg.ok ? MSG_OK : MSG_ERR}>{prefMsg.text}</p>}
      </div>
    </div>
  );

  const renderUsage = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("usage.title")}</p>
        <p className={SECTION_SUB}>{t("usage.subtitle", { plan: planLabel })}</p>
      </div>

      {usageLoading ? (
        <p className="text-xs text-[var(--text-faint)]">{t("usage.loading")}</p>
      ) : usageError ? (
        <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">{usageError}</div>
      ) : usage ? (
        <>
          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">{t("usage.thisMonth")}</p>
            {usage.monthly.map((m) => (
              <UsageMeter key={m.key} label={m.label} used={m.used} max={m.max} />
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">{t("usage.total")}</p>
            {usage.total.map((m) => (
              <UsageMeter key={m.key} label={m.label} used={m.used} max={m.max} />
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <p className="text-[11px] font-semibold text-[var(--text-faint)] uppercase tracking-widest">{t("usage.catalogueTitle")}</p>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--text-primary)]">{t("usage.catalogueLabel")}</p>
                <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{t("usage.catalogueCaption")}</p>
              </div>
              <p className="text-xs font-semibold shrink-0">
                {usage.catalogue.max === null ? (
                  <span className="text-[var(--success)]">{t("usage.catalogueFull")}</span>
                ) : (
                  <span className="text-[var(--text-muted)]">{t("usage.catalogueLimited", { max: usage.catalogue.max })}</span>
                )}
              </p>
            </div>

            {usage.boutiques.length === 0 ? (
              <p className="text-[11px] text-[var(--text-faint)]">{t("usage.noBoutique")}</p>
            ) : (
              usage.boutiques.map((b) => (
                <UsageMeter key={b.id} label={t("usage.boutiqueProduits", { nom: b.nom })} used={b.used} max={b.max} />
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );

  const renderIntegrations = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("integrations.title")}</p>
        <p className={SECTION_SUB}>{t("integrations.subtitle")}</p>
      </div>

      {/* Shopify */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#96bf48]/10 border border-[#96bf48]/20 flex items-center justify-center text-base">🛍️</div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{t("integrations.shopifyLabel")}</p>
            <p className="text-[11px] text-[var(--text-faint)]">{t("integrations.shopifyDesc")}</p>
          </div>
        </div>

        {shopifyStatusLoading ? (
          <p className="text-[11px] text-[var(--text-faint)]">{t("integrations.shopifyChecking")}</p>
        ) : !shopifyStatus?.configured ? (
          <p className="text-[11px] text-[var(--warning)]">
            {t("integrations.shopifyNotConfigured")}
          </p>
        ) : shopifyStatus.connected ? (
          <>
            <div className="rounded-lg border border-[var(--success)]/20 bg-[var(--success)]/[0.06] px-3 py-2.5 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--success)] shrink-0" />
              <p className="text-xs text-[var(--success)]">
                {t("integrations.shopifyConnectedPrefix")} <span className="font-semibold">{shopifyStatus.shop_name || shopifyStatus.shop_domain}</span>
                {shopifyStatus.shop_name ? <span className="text-[var(--success)]/70"> ({shopifyStatus.shop_domain})</span> : null}
              </p>
            </div>
            <p className="text-[11px] text-[var(--text-faint)]">
              {shopifyStatus.disputesScopeGranted
                ? t("integrations.shopifyDisputesOn")
                : t("integrations.shopifyDisputesOff")}
            </p>
            <div className="flex items-center gap-3">
              <button className={BTN_G} disabled={shopifyDisconnecting} onClick={handleDisconnectShopify}>
                {shopifyDisconnecting ? t("integrations.shopifyDisconnecting") : t("integrations.shopifyDisconnect")}
              </button>
              {intMsg && <p className={intMsg.ok ? MSG_OK : MSG_ERR}>{intMsg.text}</p>}
            </div>
          </>
        ) : (
          <>
            {shopifyStatus.reconnectRequired && (
              <div className="rounded-lg border border-[var(--warning)]/20 bg-[var(--warning)]/[0.06] px-3 py-2.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--warning)] shrink-0" />
                <p className="text-xs text-[var(--warning)]">
                  {t("integrations.shopifyReconnectRequired")}
                </p>
              </div>
            )}
            <div>
              <label className={LABEL}>{t("integrations.shopifyDomainLabel")}</label>
              <input
                type="text"
                value={shopifyDomainInput}
                onChange={(e) => setShopifyDomainInput(e.target.value)}
                placeholder={t("integrations.shopifyDomainPlaceholder")}
                className={FIELD}
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                className={BTN_G}
                disabled={shopifyConnecting || !shopifyDomainInput.trim()}
                onClick={handleConnectShopify}
              >
                {shopifyConnecting
                  ? t("integrations.shopifyConnecting")
                  : shopifyStatus.reconnectRequired
                  ? t("integrations.shopifyReconnect")
                  : t("integrations.shopifyConnect")}
              </button>
              {intMsg && <p className={intMsg.ok ? MSG_OK : MSG_ERR}>{intMsg.text}</p>}
            </div>
          </>
        )}
      </div>

      {/* AliExpress */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-base">📦</div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{t("integrations.aliexpressLabel")}</p>
            <p className="text-[11px] text-[var(--text-faint)]">{t("integrations.aliexpressDesc")}</p>
          </div>
          <span className="ml-auto text-[10px] font-bold bg-[var(--surface-2)] border border-[var(--border)] text-[var(--text-muted)] px-2 py-0.5 rounded-full">{t("integrations.aliexpressConnected")}</span>
        </div>
        <p className="text-[11px] text-[var(--text-faint)]">{t("integrations.aliexpressCaption")}</p>
      </div>

      {/* Coming soon */}
      <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-center">
        <p className="text-xs text-[var(--text-faint)]">{t("integrations.comingSoon")}</p>
      </div>
    </div>
  );

  const renderFacturation = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("facturation.title")}</p>
        <p className={SECTION_SUB}>{t("facturation.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 flex flex-col gap-3">
        <div className={ROW}>
          <p className="text-xs text-[var(--text-faint)] uppercase tracking-wider font-medium">{t("facturation.currentPlanLabel")}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${planStyle.badge}`}>{planLabel.toUpperCase()}</span>
        </div>
        <div className={DIVIDER} />
        <div className={ROW}>
          <p className="text-sm text-[var(--text-muted)]">{t("facturation.nextPayment")}</p>
          <p className="text-sm text-[var(--text-faint)]">{plan === "free" ? "—" : t("facturation.notConfigured")}</p>
        </div>
        <div className={ROW}>
          <p className="text-sm text-[var(--text-muted)]">{t("facturation.paymentMethod")}</p>
          <p className="text-sm text-[var(--text-faint)]">{plan === "free" ? "—" : t("facturation.notConfigured")}</p>
        </div>
      </div>

      <div>
        <p className="text-[12px] font-medium text-[var(--text-muted)] mb-3">{t("facturation.invoicesTitle")}</p>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--text-faint)]">{t("facturation.noInvoices")}</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-1">{t("facturation.noInvoicesCaption")}</p>
        </div>
      </div>

      {plan !== "free" && (
        <button
          className={`${BTN_G} self-start opacity-40 cursor-not-allowed`}
          disabled
          title={t("facturation.manageTooltip", { email: SUPPORT_EMAIL })}
        >
          {t("facturation.manage")}
        </button>
      )}
    </div>
  );

  const renderLegal = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("legal.title")}</p>
        <p className={SECTION_SUB}>{t("legal.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-3">
        {[
          { href: "/faq", title: t("legal.faqTitle"), desc: t("legal.faqDesc") },
          { href: "/mentions-legales", title: t("legal.mentionsTitle"), desc: t("legal.mentionsDesc") },
          { href: "/cgv", title: t("legal.cgvTitle"), desc: t("legal.cgvDesc") },
          { href: "/confidentialite", title: t("legal.confidentialiteTitle"), desc: t("legal.confidentialiteDesc") },
        ].map(({ href, title, desc }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-[var(--surface-2)] transition group"
          >
            <div>
              <p className="text-sm text-[var(--text-primary)] group-hover:text-violet-300 transition">{title}</p>
              <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{desc}</p>
            </div>
            <span className="text-[var(--text-faint)] group-hover:text-violet-400 transition shrink-0">{Ico.ext}</span>
          </a>
        ))}
      </div>

      <div className={DIVIDER} />

      <div className="text-[11px] text-[var(--text-faint)] leading-relaxed">
        {t.rich("legal.contact", {
          email: LEGAL_EMAIL,
          muted: (chunks) => <span className="text-[var(--text-muted)]">{chunks}</span>,
        })}
      </div>
    </div>
  );

  const renderDanger = () => (
    <div className="flex flex-col gap-6">
      <div>
        <p className={SECTION_TITLE}>{t("danger.title")}</p>
        <p className={SECTION_SUB}>{t("danger.subtitle")}</p>
      </div>

      <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/[0.03] p-5 flex flex-col gap-4">
        <div>
          <p className="text-sm font-medium text-[var(--danger)]">{t("danger.deleteLabel")}</p>
          <p className="text-[11px] text-[var(--text-faint)] mt-1 leading-relaxed">
            {t("danger.deleteDesc", { email: SUPPORT_EMAIL })}
          </p>
        </div>
        <button
          className="self-start px-4 py-2 rounded-lg border border-[var(--danger)]/30 text-[var(--danger)] text-xs font-semibold opacity-40 cursor-not-allowed"
          disabled
          title={t("danger.deleteTooltip", { email: SUPPORT_EMAIL })}
        >
          {t("danger.deleteButton")}
        </button>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[11px] text-[var(--text-faint)]">
        {t("danger.pauseText", { email: SUPPORT_EMAIL })}
      </div>
    </div>
  );

  const SECTION_CONTENT: Record<SectionId, () => React.ReactNode> = {
    plan: renderPlan,
    profil: renderProfil,
    securite: renderSecurite,
    preferences: renderPreferences,
    usage: renderUsage,
    integrations: renderIntegrations,
    facturation: renderFacturation,
    legal: renderLegal,
    danger: renderDanger,
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-[6px]" />

      <div className="relative z-10 w-full max-w-[820px] bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col"
        style={{ height: "80vh" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-violet-500/15 border border-violet-500/20 flex items-center justify-center">
              {Ico.preferences}
            </div>
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("header.title")}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--text-faint)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition"
            aria-label={t("header.close")}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 1l9 9M10 1L1 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0">

          {/* Left nav */}
          <nav className="w-[196px] shrink-0 border-r border-[var(--border)] flex flex-col p-2 overflow-y-auto">
            <div className="flex flex-col gap-0.5">
              {NAV_SECTIONS.map((id) => {
                const isActive = activeSection === id;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveSection(id)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition w-full ${
                      isActive
                        ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <span className={isActive ? "text-[var(--accent)]" : "text-[var(--text-faint)]"}>{NAV_ICONS[id]}</span>
                    {t(`nav.${id}`)}
                  </button>
                );
              })}
            </div>

            <div className="flex-1" />

            {/* Danger zone button */}
            <button
              onClick={() => setActiveSection("danger")}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-left transition w-full mt-1 ${
                activeSection === "danger"
                  ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                  : "text-[var(--danger)]/50 hover:text-[var(--danger)]/80 hover:bg-[var(--danger)]/[0.05]"
              }`}
            >
              <span>{Ico.danger}</span>
              {t("nav.danger")}
            </button>
          </nav>

          {/* Right content panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {SECTION_CONTENT[activeSection]()}
          </div>
        </div>
      </div>
    </div>
  );
}
