"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import Logo from "@/components/Logo";
import { Suspense } from "react";

function isEmailNotConfirmedError(err: { message: string; code?: string }): boolean {
  return err.code === "email_not_confirmed" || err.message.toLowerCase().includes("email not confirmed");
}

function LoginForm() {
  const t = useTranslations("auth.login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const justConfirmed = searchParams.get("confirmed") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    setUnconfirmed(false);
    setResendState("idle");

    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (authError) {
      if (isEmailNotConfirmedError(authError)) {
        setUnconfirmed(true);
        setError(t("errorUnconfirmed"));
      } else {
        setError(t("errorInvalid"));
      }
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  async function handleResend() {
    setResendState("loading");
    setResendError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: resendErr } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      },
    });

    if (resendErr) {
      setResendState("error");
      setResendError(resendErr.message);
      return;
    }
    setResendState("sent");
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <Logo className="w-7 h-7 text-[var(--logo-accent)]" />
          <span className="text-xl font-bold bg-gradient-to-r from-[var(--accent)] to-[var(--accent-secondary)] bg-clip-text text-transparent">
            Dropvio
          </span>
        </div>

        <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-8">
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-1">{t("title")}</h1>
          <p className="text-[var(--text-faint)] text-sm mb-8">{t("subtitle")}</p>

          {justConfirmed && !error && (
            <div className="mb-5 rounded-xl bg-[var(--success)]/10 border border-[var(--success)]/20 px-4 py-3 text-[var(--success)] text-sm">
              {t("confirmedBanner")}
            </div>
          )}

          {error && (
            <div className="mb-5 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm flex flex-col gap-2">
              <span>{error}</span>
              {unconfirmed && (
                resendState === "sent" ? (
                  <span className="text-[var(--success)] text-xs">{t("resendSent")}</span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendState === "loading"}
                    className="self-start text-xs text-[var(--accent)] hover:opacity-80 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {resendState === "loading" ? t("resendSending") : t("resend")}
                  </button>
                )
              )}
              {unconfirmed && resendState === "error" && resendError && (
                <span className="text-[var(--danger)] text-xs">{resendError}</span>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("emailLabel")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("emailPlaceholder")}
                required
                className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("passwordLabel")}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("passwordPlaceholder")}
                required
                className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="mt-2 w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("submitting") : t("submit")}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-faint)]">
            {t("noAccount")}{" "}
            <a href="/register" className="text-[var(--accent)] hover:opacity-80 font-medium transition">
              {t("createAccount")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const t = useTranslations("auth.login");
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center text-[var(--text-faint)] text-sm">
        {t("loadingFallback")}
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
