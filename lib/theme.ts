export type Theme = "dark" | "light";

// Doit rester identique au script inline dans app/layout.tsx (qui ne peut pas importer
// cette constante — il s'exécute avant tout bundle JS, pour poser data-theme sans flash).
export const THEME_STORAGE_KEY = "dropvio-theme";

// Clair par défaut : seule une préférence "dark" explicitement enregistrée bascule en
// sombre. Doit rester aligné sur le script inline de app/layout.tsx (même défaut, même clé).
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

// data-theme reste la seule source de vérité pour le CSS (voir app/globals.css) —
// localStorage ne sert qu'à la persistance entre sessions, jamais lu directement par le CSS.
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Stockage indisponible (navigation privée stricte, quota...) : le thème reste actif
    // pour la session en cours via l'attribut déjà posé, juste non persisté.
  }
}
