import type { ReactNode } from "react";

// Cadre de téléphone pour l'aperçu mobile d'un site généré (étape résultat du Site Builder).
// L'écran fait 375 × 740 px CSS (taille d'un iPhone courant) : l'iframe qu'il contient est
// réellement rendue à cette largeur, donc les media queries mobiles de la page s'appliquent —
// ce n'est pas une réduction de la version ordinateur. Couleurs du cadre fixes (un téléphone
// est noir quel que soit le thème de l'app), d'où les valeurs en dur.
export const LARGEUR_ECRAN_TELEPHONE = 375;
export const HAUTEUR_ECRAN_TELEPHONE = 740;

export default function CadreTelephone({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-center bg-[var(--surface-2)] px-4 py-8">
      <div className="relative max-w-full rounded-[3rem] bg-[#111] p-3 pt-9 shadow-2xl shadow-black/30 ring-1 ring-black/40">
        {/* Îlot de l'appareil photo, dans le bord du cadre (ne recouvre pas la page). */}
        <div className="absolute left-1/2 top-3 h-5 w-24 -translate-x-1/2 rounded-full bg-black" aria-hidden="true" />
        <div
          className="max-w-full overflow-hidden rounded-[2.25rem] bg-white"
          style={{ width: LARGEUR_ECRAN_TELEPHONE, height: HAUTEUR_ECRAN_TELEPHONE }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
