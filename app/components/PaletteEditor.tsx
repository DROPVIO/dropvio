import { useTranslations } from "next-intl";

export type Palette = { primary: string; secondary: string; accent: string };

const COLOR_FIELDS: Array<keyof Palette> = ["primary", "secondary", "accent"];

// Éditeur de palette à 3 couleurs — extrait de app/site-builder/page.tsx (sélecteur de
// style mono-page) pour être réutilisé tel quel par le flux de contenu boutique
// multi-produits, sans dupliquer le JSX des color pickers.
export default function PaletteEditor({
  palette,
  onChange,
}: {
  palette: Palette;
  onChange: (palette: Palette) => void;
}) {
  const t = useTranslations("siteBuilder.palette");
  return (
    <div className="flex flex-col gap-4">
      {COLOR_FIELDS.map((key) => (
        <div key={key} className="flex items-center gap-3">
          <div className="relative shrink-0">
            <input
              type="color"
              value={palette[key]}
              onChange={(e) => onChange({ ...palette, [key]: e.target.value })}
              className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0"
            />
            {/* Couleur choisie par l'utilisateur — inline style volontaire, valeur dynamique arbitraire. */}
            <div
              className="absolute inset-0 rounded-xl ring-1 ring-white/10 pointer-events-none"
              style={{ background: palette[key] }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">{t(`${key}.label`)}</p>
            <p className="text-[10px] text-[var(--text-faint)] mt-0.5">
              {t(`${key}.hint`)} · <span className="font-mono">{palette[key]}</span>
            </p>
          </div>
        </div>
      ))}

      {/* Preview strip — couleurs dynamiques utilisateur, inline style volontaire */}
      <div className="h-6 rounded-lg overflow-hidden flex">
        <div className="flex-1" style={{ background: palette.primary }} />
        <div className="flex-1" style={{ background: palette.secondary }} />
        <div className="flex-1" style={{ background: palette.accent }} />
      </div>
    </div>
  );
}
