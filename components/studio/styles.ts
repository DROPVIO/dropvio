// Classes reprises du Site Builder (app/site-builder/page.tsx) pour que le Studio IA ait les
// mêmes boutons, panneaux et sélecteurs de mode.
export const BOUTON_PRIMAIRE =
  "rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all hover:from-violet-500 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-40";
export const BOUTON_SECONDAIRE =
  "rounded-xl border border-[var(--border-strong)] px-4 py-3 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]";
export const PANNEAU = "rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 flex flex-col gap-5 min-w-0";
export const SELECTEUR = "inline-flex gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-1";
export const SELECTEUR_BOUTON = (actif: boolean) =>
  `min-h-[40px] rounded-lg px-4 py-2 text-xs font-semibold transition-all ${actif ? "bg-violet-600 text-white" : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"}`;
export const BOUTON_FORMAT = (actif: boolean) =>
  `min-h-[44px] rounded-xl border px-4 text-sm font-semibold transition ${
    actif ? "border-violet-500/40 bg-violet-500/10 text-[var(--text-primary)]" : "border-[var(--border-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
  }`;
