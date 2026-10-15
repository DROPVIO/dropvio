"use client";

import { useEffect, useState } from "react";

// recharts dessine ses axes/légende/brush en SVG avec des valeurs de couleur littérales
// (fill/stroke), qui ne résolvent pas var(--token) de façon fiable — ces quelques couleurs
// doivent être recalculées en JS quand le thème change. Observe l'attribut data-theme plutôt
// que de dupliquer l'état du toggle (posé dans ParametresModal, lu ici via le DOM).
export function useIsLightTheme(): boolean {
  const [isLight, setIsLight] = useState(false);
  useEffect(() => {
    const read = () => setIsLight(document.documentElement.getAttribute("data-theme") === "light");
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return isLight;
}
