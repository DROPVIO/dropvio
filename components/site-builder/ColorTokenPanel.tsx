"use client";

import { useMemo } from "react";
import { TOKEN_LABELS, extractRootTokens, parseColorValue } from "@/lib/color-tokens";

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
  const tokens = useMemo(() => extractRootTokens(html), [html]);

  if (tokens.length === 0) return null;

  return (
    <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
      <h3 className="text-lg font-semibold text-[var(--text-primary)]">🎨 Personnaliser les couleurs</h3>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Modifie les couleurs de la page générée — l&apos;aperçu se met à jour immédiatement.
      </p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {tokens.map(({ name, value }) => {
          const parsed = parseColorValue(value);
          return (
            <div
              key={name}
              className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3"
            >
              <span className="text-sm text-[var(--text-primary)]">{TOKEN_LABELS[name] ?? name}</span>
              {parsed ? (
                <input
                  type="color"
                  value={parsed.hex}
                  onChange={(e) => onTokenChange(name, parsed.write(e.target.value))}
                  className="h-9 w-14 cursor-pointer rounded-lg border border-[var(--border)] bg-transparent"
                  aria-label={TOKEN_LABELS[name] ?? name}
                />
              ) : (
                <span className="text-xs text-[var(--text-faint)]" title={value}>
                  non éditable (dégradé)
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
            {saving ? "Enregistrement..." : "Enregistrer ces couleurs"}
          </button>
          {saveSuccess ? <span className="text-sm text-[var(--success)]">Enregistré.</span> : null}
          {saveError ? <span className="text-sm text-[var(--danger)]">{saveError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
