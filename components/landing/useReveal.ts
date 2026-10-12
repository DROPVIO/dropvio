"use client";

import { useEffect, useRef } from "react";

/** Apparition au scroll de la landing.
 *
 *  Le masquage initial est conditionné par l'attribut data-rv-on, posé ici au montage :
 *  sans JS, avant hydratation ou en reduced-motion, aucun élément n'est masqué et la page
 *  s'affiche directement dans son état final (voir .dv-home[data-rv-on] dans globals.css).
 *
 *  Le CSS ne porte que les variables d'amplitude par variante (data-rv="left" | "zoom" | …) ;
 *  ce hook ne fait que basculer data-rv-in. Un MutationObserver reprend les éléments montés
 *  après coup — une réponse de FAQ dépliée, la modale de la démo. */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    root.setAttribute("data-rv-on", "");

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          // Le seuil de sortie est 0 et non 0.15 : retirer l'attribut dès que l'élément
          // quitte franchement le viewport permet de rejouer l'entrée au scroll inverse,
          // sans clignoter sur la bande où il est partiellement visible.
          if (e.isIntersecting && e.intersectionRatio >= 0.15) e.target.setAttribute("data-rv-in", "");
          else if (!e.isIntersecting) e.target.removeAttribute("data-rv-in");
        }
      },
      { threshold: [0, 0.15], rootMargin: "0px 0px -10% 0px" }
    );

    const vus = new WeakSet<Element>();
    const scan = () => {
      root.querySelectorAll("[data-rv]").forEach((el) => {
        if (vus.has(el)) return;
        vus.add(el);
        io.observe(el);
      });
    };
    scan();

    const mo = new MutationObserver(scan);
    mo.observe(root, { childList: true, subtree: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      root.removeAttribute("data-rv-on");
    };
  }, []);

  return ref;
}
