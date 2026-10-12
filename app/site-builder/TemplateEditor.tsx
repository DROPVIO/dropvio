"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CATEGORIES,
  TEXTES_DEFAUT,
  REASSURANCE_DEFAUT,
  imagesVides,
  buildTemplateHtml,
  buildTemplateHtmlBoutique,
  type Categorie,
  type ContenuTexte,
  type ImagesSite,
  type Reassurance,
} from "@/lib/site-templates";
import type { BoutiqueDraft } from "@/lib/site-builder-handoff";
import { applyTokenOverrides } from "@/lib/color-tokens";
import ColorTokenPanel from "@/components/site-builder/ColorTokenPanel";
import { slugFichier, telechargerTexte } from "@/lib/audit-download";
import { ToastHost, useToast } from "@/components/Toast";
import { LIEN_CHANGER_DE_PLAN } from "@/lib/plan-links";
import { useTranslations } from "next-intl";
import { useApiErrorMessage } from "@/lib/use-api-error";

type AuditLive = {
  score_global: number;
  resume_executif: string;
};

export default function TemplateEditor({
  boutiqueDraft,
  canExport,
}: {
  boutiqueDraft?: BoutiqueDraft | null;
  canExport: boolean;
}) {
  const { toast, succes, fermer } = useToast();
  const t = useTranslations("siteBuilder.templates");
  const apiErrorMessage = useApiErrorMessage();
  // Préremplissage depuis "Créer un site pour cette boutique" (page de gestion boutique) —
  // mêmes query params que le mode IA (app/site-builder/page.tsx), lus ici directement
  // puisque ce composant n'a pas accès aux props du parent pour ce préremplissage.
  // Mode produit unique seulement — le mode boutique arrive via la prop boutiqueDraft.
  const searchParams = useSearchParams();
  const isBoutiqueMode = Boolean(boutiqueDraft);
  const prefillName = searchParams.get("name");
  const prefillDescription = searchParams.get("description");
  const prefillImage = searchParams.get("image");
  const boutiqueId = searchParams.get("boutiqueId") ?? undefined;

  const [categorie, setCategorie] = useState<Categorie>("generique");
  const [contenu, setContenu] = useState<ContenuTexte>(() =>
    prefillName || prefillDescription
      ? {
          ...TEXTES_DEFAUT.generique,
          titre: prefillName || TEXTES_DEFAUT.generique.titre,
          description: prefillDescription || TEXTES_DEFAUT.generique.description,
        }
      : TEXTES_DEFAUT.generique
  );
  const [images, setImages] = useState<ImagesSite>(() =>
    prefillImage ? { ...imagesVides(), hero: prefillImage } : imagesVides()
  );
  const [prixVente, setPrixVente] = useState("");
  const [prixBarre, setPrixBarre] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [avantApresActif, setAvantApresActif] = useState(false);
  const [uploadEnCours, setUploadEnCours] = useState<string | null>(null);
  const [uploadErreur, setUploadErreur] = useState<string | null>(null);
  const [reassurance, setReassurance] = useState<Reassurance>(REASSURANCE_DEFAUT);

  const html = useMemo(
    () =>
      boutiqueDraft
        ? buildTemplateHtmlBoutique({
            categorie,
            nomBoutique: boutiqueDraft.nomBoutique,
            descriptionBoutique: boutiqueDraft.descriptionBoutique,
            produits: boutiqueDraft.produits,
            reassurance,
          })
        : buildTemplateHtml({
            categorie,
            contenu,
            images,
            prixVente,
            prixBarre,
            reassurance,
          }),
    [categorie, contenu, images, prixVente, prixBarre, reassurance, boutiqueDraft]
  );

  // Personnalisation post-génération (couleurs, voir ColorTokenPanel) — html ci-dessus est
  // recalculé à chaque changement de champ (useMemo), donc les couleurs choisies ne peuvent
  // pas vivre "dans" ce HTML directement : elles seraient écrasées par les valeurs par défaut
  // du template au prochain recalcul. On les garde à part et on les réapplique par-dessus.
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});
  const finalHtml = useMemo(() => applyTokenOverrides(html, colorOverrides), [html, colorOverrides]);

  // Score d'audit IA live — débouncé, réutilise l'auditeur existant (/api/audit-site)
  const [auditResult, setAuditResult] = useState<AuditLive | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const dernierHtmlAudite = useRef<string>("");

  useEffect(() => {
    const pretAAuditer = isBoutiqueMode
      ? Boolean(boutiqueDraft?.nomBoutique.trim() && boutiqueDraft?.produits.length)
      : Boolean(contenu.titre.trim() && contenu.description.trim());
    if (!pretAAuditer) return;
    if (html === dernierHtmlAudite.current) return;

    const timeout = setTimeout(async () => {
      setAuditLoading(true);
      try {
        const res = await fetch("/api/audit-site", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html }),
        });
        const data = await res.json();
        if (res.ok && !data.error) {
          setAuditResult(data as AuditLive);
          dernierHtmlAudite.current = html;
        }
      } catch {
        // silencieux — le score live est un bonus, pas bloquant
      } finally {
        setAuditLoading(false);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [html, contenu.titre, contenu.description, isBoutiqueMode, boutiqueDraft]);

  function changerCategorie(id: Categorie) {
    setCategorie(id);
    setContenu(TEXTES_DEFAUT[id]);
    // Chaque catégorie a sa propre palette par défaut (lib/site-templates.ts) — un override
    // choisi pour "tech" n'a pas de sens réappliqué tel quel sur "maison".
    setColorOverrides({});
  }

  function reinitialiserTextes() {
    setContenu(TEXTES_DEFAUT[categorie]);
  }

  function updateBullet(i: number, value: string) {
    setContenu((c) => {
      const bullets = [...c.bullets];
      bullets[i] = value;
      return { ...c, bullets };
    });
  }

  async function uploadImage(
    file: File,
    slot: "hero" | "galerie" | "avant" | "apres",
    onSuccess: (url: string) => void
  ) {
    const slotKey = slot === "galerie" ? `galerie` : slot;
    setUploadEnCours(slotKey);
    setUploadErreur(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("slot", slot);
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setUploadErreur(apiErrorMessage(json, t("erreurs.upload")));
        return;
      }
      onSuccess(json.url);
    } catch {
      setUploadErreur(apiErrorMessage({ code: "network" }));
    } finally {
      setUploadEnCours(null);
    }
  }

  async function handleDownload() {
    if (saving) return;
    const nom = isBoutiqueMode ? boutiqueDraft?.nomBoutique || t("nomParDefautBoutique") : contenu.titre || t("nomParDefautLanding");

    // Plan free : la sauvegarde dans "Mes sites" reste inconditionnelle (le travail n'est
    // jamais perdu, juste pas téléchargeable) — voir diagnostic "restriction export Site
    // Builder". Le fichier n'est produit que pour Pro/Agency.
    if (canExport) {
      // slugFichier() : `nom` vient d'un champ libre (titre ou nom de boutique) et peut
      // contenir des accents, que l'ancien replace() sur les espaces laissait passer.
      const nomFichier = `${slugFichier(nom)}.html`;
      telechargerTexte(finalHtml, nomFichier);
      succes(t("fichierTelecharge", { fichier: nomFichier }));
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/sites-generes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom_produit: nom, html_content: finalHtml, boutique_id: boutiqueId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(apiErrorMessage(data, t("erreurs.sauvegarde")));
        return;
      }
      setSaved(true);
    } catch {
      setSaveError(canExport ? t("erreurs.reseauTelecharge") : t("erreurs.reseauRien"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sélecteur de catégorie / template */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6">
        <p className="text-sm font-medium text-[var(--text-muted)] mb-3">{t("categorie")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => {
            const active = categorie === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => changerCategorie(cat.id)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  active
                    ? "border-violet-500/50 bg-violet-500/[0.07]"
                    : "border-[var(--border)] bg-[var(--surface-2)] hover:border-violet-500/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{cat.emoji}</span>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{cat.label}</p>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />}
                </div>
                <p className="text-[11px] text-[var(--text-faint)] leading-relaxed">{t(`categories.${cat.id}`)}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mode boutique : les champs produit unique (contenu/preuve sociale/photos) ne
          s'appliquent pas — l'édition des produits se fait en amont, une seule fois,
          partagée avec le mode IA (voir components/site-builder/BoutiqueProduitsEditor.tsx
          et app/site-builder/page.tsx). Ce composant se contente de consommer boutiqueDraft
          pour le rendu (html useMemo ci-dessus) et l'audit live. */}

      {!isBoutiqueMode && (
      <>
      {/* Formulaire de contenu */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-[var(--text-muted)]">{t("contenu.titre")}</p>
          <button
            onClick={reinitialiserTextes}
            className="text-[11px] text-[var(--text-faint)] hover:text-[var(--accent)] transition"
          >
            {t("contenu.reinitialiser")}
          </button>
        </div>
        <p className="text-[11px] text-[var(--text-faint)] -mt-3">
          {t("contenu.aide", { categorie: CATEGORIES.find((c) => c.id === categorie)?.label ?? "" })}
        </p>

        <Champ label={t("contenu.titrePrincipal")} value={contenu.titre} onChange={(v) => setContenu((c) => ({ ...c, titre: v }))} />
        <Champ label={t("contenu.sousTitre")} value={contenu.sousTitre} onChange={(v) => setContenu((c) => ({ ...c, sousTitre: v }))} />
        <ChampArea label={t("contenu.description")} value={contenu.description} onChange={(v) => setContenu((c) => ({ ...c, description: v }))} />

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-[var(--text-muted)]">{t("contenu.benefices")}</label>
          {contenu.bullets.map((b, i) => (
            <input
              key={i}
              type="text"
              value={b}
              onChange={(e) => updateBullet(i, e.target.value)}
              className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          ))}
        </div>

        <Champ label={t("contenu.cta")} value={contenu.cta} onChange={(v) => setContenu((c) => ({ ...c, cta: v }))} />

        <div className="flex gap-3">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-sm font-medium text-[var(--text-muted)]">{t("contenu.prixVente")}</label>
            <div className="relative">
              <input
                type="number" min="0" step="0.01"
                value={prixVente}
                onChange={(e) => setPrixVente(e.target.value)}
                placeholder="29.99"
                className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl pl-4 pr-10 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)] text-sm">€</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-sm font-medium text-[var(--text-muted)]">{t("contenu.prixBarre")}</label>
            <div className="relative">
              <input
                type="number" min="0" step="0.01"
                value={prixBarre}
                onChange={(e) => setPrixBarre(e.target.value)}
                placeholder="59.99"
                className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl pl-4 pr-10 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)] text-sm">€</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preuve sociale */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-4">
        <p className="text-sm font-medium text-[var(--text-muted)]">{t("preuve.titre")}</p>
        <p className="text-[11px] text-[var(--text-faint)] -mt-2">
          {t("preuve.aide")}
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--text-muted)]">{t("preuve.note")}</label>
            <input
              type="number" min="0" max="5" step="0.1"
              value={contenu.noteMoyenne ?? ""}
              onChange={(e) => setContenu((c) => ({ ...c, noteMoyenne: e.target.value }))}
              placeholder="4.8"
              className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--text-muted)]">{t("preuve.avis")}</label>
            <input
              type="number" min="0" step="1"
              value={contenu.nombreAvis ?? ""}
              onChange={(e) => setContenu((c) => ({ ...c, nombreAvis: e.target.value }))}
              placeholder="120"
              className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-[var(--text-muted)]">{t("preuve.ventes")}</label>
            <input
              type="number" min="0" step="1"
              value={contenu.nombreCommandes ?? ""}
              onChange={(e) => setContenu((c) => ({ ...c, nombreCommandes: e.target.value }))}
              placeholder="500"
              className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-5">
        <p className="text-sm font-medium text-[var(--text-muted)]">{t("photos.titre")}</p>

        {uploadErreur && (
          <p className="text-xs text-[var(--danger)]">{uploadErreur}</p>
        )}

        <div>
          <label className="text-xs text-[var(--text-faint)] mb-2 block">{t("photos.hero")}</label>
          <SlotPhoto
            url={images.hero}
            loading={uploadEnCours === "hero"}
            onUpload={(file) => uploadImage(file, "hero", (url) => setImages((im) => ({ ...im, hero: url })))}
            onRemove={() => setImages((im) => ({ ...im, hero: null }))}
          />
        </div>

        <div>
          <label className="text-xs text-[var(--text-faint)] mb-2 block">{t("photos.galerie")}</label>
          <div className="grid grid-cols-3 gap-3">
            {images.galerie.map((url, i) => (
              <SlotPhoto
                key={i}
                compact
                url={url}
                loading={uploadEnCours === "galerie"}
                onUpload={(file) =>
                  uploadImage(file, "galerie", (u) =>
                    setImages((im) => {
                      const galerie = [...im.galerie];
                      galerie[i] = u;
                      return { ...im, galerie };
                    })
                  )
                }
                onRemove={() =>
                  setImages((im) => {
                    const galerie = [...im.galerie];
                    galerie[i] = null;
                    return { ...im, galerie };
                  })
                }
              />
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={avantApresActif}
              onChange={(e) => {
                setAvantApresActif(e.target.checked);
                if (!e.target.checked) setImages((im) => ({ ...im, avant: null, apres: null }));
              }}
              className="w-4 h-4 accent-violet-600"
            />
            {t("photos.avantApres")}
          </label>
          {avantApresActif && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">{t("photos.avant")}</span>
                <SlotPhoto
                  compact
                  url={images.avant}
                  loading={uploadEnCours === "avant"}
                  onUpload={(file) => uploadImage(file, "avant", (u) => setImages((im) => ({ ...im, avant: u })))}
                  onRemove={() => setImages((im) => ({ ...im, avant: null }))}
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-faint)] uppercase tracking-widest">{t("photos.apres")}</span>
                <SlotPhoto
                  compact
                  url={images.apres}
                  loading={uploadEnCours === "apres"}
                  onUpload={(file) => uploadImage(file, "apres", (u) => setImages((im) => ({ ...im, apres: u })))}
                  onRemove={() => setImages((im) => ({ ...im, apres: null }))}
                />
              </div>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* Réassurance */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] cursor-pointer">
          <input
            type="checkbox"
            checked={reassurance.actif}
            onChange={(e) => setReassurance((r) => ({ ...r, actif: e.target.checked }))}
            className="w-4 h-4 accent-violet-600"
          />
          {t("reassurance.titre")}
        </label>
        <p className="text-[11px] text-[var(--text-faint)] -mt-2">
          {t("reassurance.aide")}
        </p>
        {reassurance.actif && (
          <div className="grid gap-3">
            <Champ label={t("reassurance.livraison")} value={reassurance.livraison} onChange={(v) => setReassurance((r) => ({ ...r, livraison: v }))} />
            <Champ label={t("reassurance.paiement")} value={reassurance.paiement} onChange={(v) => setReassurance((r) => ({ ...r, paiement: v }))} />
            <Champ label={t("reassurance.retour")} value={reassurance.retour} onChange={(v) => setReassurance((r) => ({ ...r, retour: v }))} />
          </div>
        )}
      </div>

      {/* Score d'audit IA live */}
      <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6 flex items-center gap-5">
        <div
          className="w-16 h-16 rounded-full border-4 flex items-center justify-center shrink-0 font-bold text-lg"
          style={{
            borderColor: !auditResult ? "var(--border-strong)" : auditResult.score_global >= 75 ? "var(--success)" : auditResult.score_global >= 50 ? "var(--warning)" : "var(--danger)",
            color: !auditResult ? "var(--text-faint)" : auditResult.score_global >= 75 ? "var(--success)" : auditResult.score_global >= 50 ? "var(--warning)" : "var(--danger)",
          }}
        >
          {auditResult ? auditResult.score_global : "—"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
            {t("audit.titre")}
            {auditLoading && (
              <span className="w-3 h-3 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
            )}
          </p>
          <p className="text-[11px] text-[var(--text-faint)] mt-1 leading-relaxed">
            {auditResult
              ? auditResult.resume_executif
              : (isBoutiqueMode ? boutiqueDraft?.produits.length : contenu.titre.trim() && contenu.description.trim())
              ? t("audit.enCours")
              : t("audit.aRemplir")}
          </p>
        </div>
      </div>

      {/* Preview + téléchargement */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--text-muted)]">{t("apercu.direct")}</p>
          {canExport ? (
            <button
              onClick={handleDownload}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "…" : t("apercu.telecharger")}
            </button>
          ) : (
            <button
              onClick={handleDownload}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "…" : t("apercu.sauvegarderFree")}
            </button>
          )}
        </div>
        {saved && (
          <p className="text-[11px] text-[var(--success)]">
            {canExport ? (
              t("apercu.sauvegarde")
            ) : (
              <>
                {t("apercu.sauvegardeFree")}{" "}
                <Link href={LIEN_CHANGER_DE_PLAN} className="text-[var(--accent)] font-semibold hover:underline">
                  {t("apercu.passerPro")}
                </Link>
              </>
            )}
          </p>
        )}
        {saveError && (
          <p className="text-[11px] text-[var(--danger)]">{saveError}</p>
        )}

        <ColorTokenPanel
          html={finalHtml}
          onTokenChange={(name, value) => setColorOverrides((prev) => ({ ...prev, [name]: value }))}
        />

        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Desktop */}
          <div className="flex-1 min-w-0 w-full rounded-2xl border border-[var(--border-strong)] overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              <span className="ml-2 text-[10px] text-[var(--text-faint)]">{t("apercu.bureau")}</span>
            </div>
            {/* Aperçu toujours rendu sur fond blanc, indépendamment du thème de l'app —
                reflet fidèle du rendu réel de la landing page générée. */}
            <iframe
              srcDoc={finalHtml}
              title={t("apercu.titreBureau")}
              className="w-full"
              style={{ height: "70vh", border: "none", background: "#fff" }}
              sandbox="allow-same-origin"
            />
          </div>

          {/* Mobile — live, mise à jour à chaque frappe */}
          <div className="shrink-0 mx-auto lg:sticky lg:top-6">
            <p className="text-center text-[10px] text-[var(--text-faint)] mb-2">{t("apercu.mobile")}</p>
            <div className="rounded-[28px] border-4 border-[var(--border-strong)] bg-[var(--surface)] p-1.5 shadow-xl">
              <div className="rounded-[20px] overflow-hidden" style={{ width: 300, height: 620 }}>
                <iframe
                  srcDoc={finalHtml}
                  title={t("apercu.titreMobile")}
                  style={{ width: 300, height: 620, border: "none", background: "#fff" }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <ToastHost toast={toast} onClose={fermer} />
    </div>
  );
}

function Champ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--text-muted)]">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
      />
    </div>
  );
}

function ChampArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-[var(--text-muted)]">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none"
      />
    </div>
  );
}

function SlotPhoto({
  url,
  loading,
  onUpload,
  onRemove,
  compact,
}: {
  url: string | null;
  loading: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("siteBuilder.templates");
  return (
    <div
      className={`relative rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] overflow-hidden flex items-center justify-center ${
        compact ? "h-24" : "h-40"
      }`}
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            onClick={onRemove}
            aria-label={t("photos.retirer")}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80 transition"
          >
            ✕
          </button>
        </>
      ) : (
        <label className="w-full h-full flex flex-col items-center justify-center gap-1.5 cursor-pointer text-[var(--text-faint)] hover:text-[var(--text-muted)] transition">
          {loading ? (
            <span className="w-5 h-5 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          ) : (
            <>
              <span className={compact ? "text-lg" : "text-2xl"}>+</span>
              {!compact && <span className="text-[11px]">{t("photos.ajouter")}</span>}
            </>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={loading}
            onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
          />
        </label>
      )}
    </div>
  );
}
