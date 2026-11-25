"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

// Prévient l'abonné quand son renouvellement attend une action : validation bancaire
// (3D Secure, prix en hausse) ou carte refusée.
export default function PaiementActionBanner() {
  const t = useTranslations("expertPaiement");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/expert/paiement-action")
      .then((res) => res.json())
      .then((json) => setUrl(json.url ?? null))
      .catch(() => setUrl(null));
  }, []);

  if (!url) return null;

  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--warning)] bg-[var(--surface)] px-6 py-3 text-sm text-[var(--text-primary)]">
      <span>{t("message")}</span>
      <a href={url} className="font-semibold text-[var(--warning-text)] underline underline-offset-2">
        {t("cta")}
      </a>
    </div>
  );
}
