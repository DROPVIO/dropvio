"use client";

import { useEffect, useState } from "react";
import type { AppLocale } from "@/lib/locale";
import type { SiteCtx, TextesSite } from "@/lib/site-textes";

// Textes de site (siteContenu) d'une langue, chargés depuis GET /api/site-textes : null tant
// qu'ils ne sont pas arrivés. Un changement de langue recharge les textes de la nouvelle.
export function useSiteCtx(langue: AppLocale): SiteCtx | null {
  const [charges, setCharges] = useState<{ langue: AppLocale; t: TextesSite } | null>(null);

  useEffect(() => {
    let annule = false;
    fetch(`/api/site-textes?langue=${langue}`)
      .then((res) => res.json())
      .then((json: { langue: AppLocale; textes: TextesSite }) => {
        if (!annule) setCharges({ langue: json.langue, t: json.textes });
      })
      .catch(() => {
        // Réessayé au prochain changement de langue ; l'éditeur reste en chargement.
      });
    return () => {
      annule = true;
    };
  }, [langue]);

  return charges && charges.langue === langue ? { t: charges.t, langue } : null;
}
