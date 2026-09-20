"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import Logo from "@/components/Logo";

// authError.message peut être vide, absent, ou littéralement "{}" (cas observé avec
// AuthRetryableFetchError quand Supabase ne renvoie pas de corps JSON exploitable) —
// on n'affiche jamais l'objet brut, seulement un message texte utile.
function getAuthErrorMessage(err: { message?: string } | null | undefined, fallback: string): string {
  const msg = err?.message?.trim();
  if (!msg || msg === "{}") return fallback;
  return msg;
}

export default function RegisterPage() {
  const t = useTranslations("auth.register");
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendState, setResendState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError(t("errorPasswordLength"));
      return;
    }
    if (password !== confirm) {
      setError(t("errorPasswordMismatch"));
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      },
    });

    if (authError) {
      setError(authError.message === "User already registered"
        ? t("errorAlreadyRegistered")
        : getAuthErrorMessage(authError, t("errorFallback"))
      );
      setLoading(false);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setSuccess(true);
    setLoading(false);
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
      setResendError(getAuthErrorMessage(resendErr, t("errorFallback")));
      return;
    }
    setResendState("sent");
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-8 text-center flex flex-col items-center gap-4">
          <span className="text-4xl">📧</span>
          <h2 className="text-[var(--text-primary)] font-bold text-lg">{t("successTitle")}</h2>
          <p className="text-[var(--text-muted)] text-sm leading-relaxed">
            {t.rich("successBody", {
              emailValue: email,
              bold: (chunks) => <span className="text-[var(--text-primary)] font-medium">{chunks}</span>,
            })}
          </p>

          {resendState === "sent" ? (
            <p className="mt-1 text-sm text-[var(--success)]">{t("resendSent")}</p>
          ) : (
            <button
              onClick={handleResend}
              disabled={resendState === "loading"}
              className="mt-1 text-sm text-[var(--accent)] hover:opacity-80 transition font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resendState === "loading" ? t("resendSending") : t("resend")}
            </button>
          )}
          {resendState === "error" && resendError && (
            <p className="text-xs text-[var(--danger)]">{resendError}</p>
          )}

          <a href="/login" className="mt-2 text-sm text-[var(--text-faint)] hover:text-[var(--text-muted)] transition font-medium">
            {t("backToLogin")}
          </a>
        </div>
      </div>
    );
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

          {error && (
            <div className="mb-5 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">
              {error}
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

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t("confirmPasswordLabel")}</label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("confirmPasswordPlaceholder")}
                required
                className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password || !confirm}
              className="mt-2 w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? t("submitting") : t("submit")}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-[var(--text-faint)]">
            {t("hasAccount")}{" "}
            <a href="/login" className="text-[var(--accent)] hover:opacity-80 font-medium transition">
              {t("signIn")}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
