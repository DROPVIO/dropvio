"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { TOKEN_CLES, extractRootTokens, parseColorValue } from "@/lib/color-tokens";

export default function ColorTokenPanel({
  html,
  onTokenChange,
  onSave,
  saving,
  saveError,
  saveSuccess,
}: {
  html: string;
  onTokenChange: (name: string, newValue: string) => void;
  onSave?: () => void;
  saving?: boolean;
  saveError?: string | null;
  saveSuccess?: boolean;
}) {
  const t = useTranslations("siteBuilder.couleurs");
  const tokens = useMemo(() => extractRootTokens(html), [html]);
  const libelle = (name: string) => (TOKEN_CLES[name] ? t(`tokens.${TOKEN_CLES[name]}`) : name);

  if (tokens.length === 0) return null;

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("titre")}</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        {t("aide")}
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {tokens.map(({ name, value }) => {
          const parsed = parseColorValue(value);
          return (
            <div
              key={name}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
            >
              <span className="text-sm text-[var(--text-primary)]">{libelle(name)}</span>
              {parsed ? (
                <input
                  type="color"
                  value={parsed.hex}
                  onChange={(e) => onTokenChange(name, parsed.write(e.target.value))}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent"
                  aria-label={libelle(name)}
                />
              ) : (
                <span className="text-xs text-[var(--text-faint)]" title={value}>
                  {t("nonEditable")}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {onSave ? (
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
          >
            {saving ? t("enregistrement") : t("enregistrer")}
          </button>
          {saveSuccess ? <span className="text-sm text-[var(--success)]">{t("enregistre")}</span> : null}
          {saveError ? <span className="text-sm text-[var(--danger)]">{saveError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
