"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORIES,
  TEXTES_DEFAUT,
  REASSURANCE_DEFAUT,
  imagesVides,
  buildTemplateHtml,
  type Categorie,
  type ContenuTexte,
  type ImagesSite,
  type Reassurance,
} from "@/lib/site-templates";

type AuditLive = {
  score_global: number;
  resume_executif: string;
};

export default function TemplateEditor() {
  const [categorie, setCategorie] = useState<Categorie>("generique");
  const [contenu, setContenu] = useState<ContenuTexte>(TEXTES_DEFAUT.generique);
  const [images, setImages] = useState<ImagesSite>(imagesVides());
  const [prixVente, setPrixVente] = useState("");
  const [prixBarre, setPrixBarre] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avantApresActif, setAvantApresActif] = useState(false);
  const [uploadEnCours, setUploadEnCours] = useState<string | null>(null);
  const [uploadErreur, setUploadErreur] = useState<string | null>(null);
  const [reassurance, setReassurance] = useState<Reassurance>(REASSURANCE_DEFAUT);

  const html = useMemo(
    () =>
      buildTemplateHtml({
        categorie,
        contenu,
        images,
        prixVente,
        prixBarre,
        reassurance,
      }),
    [categorie, contenu, images, prixVente, prixBarre, reassurance]
  );

  // Score d'audit IA live — débouncé, réutilise l'auditeur existant (/api/audit-site)
  const [auditResult, setAuditResult] = useState<AuditLive | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const dernierHtmlAudite = useRef<string>("");

  useEffect(() => {
    if (!contenu.titre.trim() || !contenu.description.trim()) return;
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
  }, [html, contenu.titre, contenu.description]);

  function changerCategorie(id: Categorie) {
    setCategorie(id);
    setContenu(TEXTES_DEFAUT[id]);
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
        setUploadErreur(json.error ?? "Échec de l'upload");
        return;
      }
      onSuccess(json.url);
    } catch {
      setUploadErreur("Impossible de contacter le serveur");
    } finally {
      setUploadEnCours(null);
    }
  }

  async function handleDownload() {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(contenu.titre || "landing").replace(/\s+/g, "-").toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);

    setSaveError(null);
    try {
      const res = await fetch("/api/sites-generes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom_produit: contenu.titre || "Landing page", html_content: html }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Erreur lors de la sauvegarde dans « Mes sites ».");
        return;
      }
      setSaved(true);
    } catch {
      setSaveError("Impossible de contacter le serveur — le HTML a bien été téléchargé, mais pas sauvegardé dans « Mes sites ».");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Sélecteur de catégorie / template */}
      <div className="rounded-2xl bg-[#13131f] border border-white/5 p-6">
        <p className="text-sm font-medium text-zinc-300 mb-3">Catégorie de produit</p>
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
                    : "border-white/[0.06] bg-white/[0.02] hover:border-violet-500/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-base">{cat.emoji}</span>
                  <p className="text-sm font-semibold text-white">{cat.label}</p>
                  {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />}
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">{cat.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Formulaire de contenu */}
      <div className="rounded-2xl bg-[#13131f] border border-white/5 p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-300">Contenu de la page</p>
          <button
            onClick={reinitialiserTextes}
            className="text-[11px] text-zinc-500 hover:text-violet-400 transition"
          >
            ↺ Réinitialiser les textes par défaut
          </button>
        </div>
        <p className="text-[11px] text-zinc-600 -mt-3">
          Textes pré-remplis pour la catégorie « {CATEGORIES.find((c) => c.id === categorie)?.label} » — personnalise-les avec les vrais arguments de ton produit.
        </p>

        <Champ label="Titre principal" value={contenu.titre} onChange={(v) => setContenu((c) => ({ ...c, titre: v }))} />
        <Champ label="Sous-titre" value={contenu.sousTitre} onChange={(v) => setContenu((c) => ({ ...c, sousTitre: v }))} />
        <ChampArea label="Description" value={contenu.description} onChange={(v) => setContenu((c) => ({ ...c, description: v }))} />

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-300">Bénéfices (bullet points)</label>
          {contenu.bullets.map((b, i) => (
            <input
              key={i}
              type="text"
              value={b}
              onChange={(e) => updateBullet(i, e.target.value)}
              className="bg-[#0d0d14] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          ))}
        </div>

        <Champ label="Texte du bouton (CTA)" value={contenu.cta} onChange={(v) => setContenu((c) => ({ ...c, cta: v }))} />

        <div className="flex gap-3">
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-sm font-medium text-zinc-300">Prix de vente</label>
            <div className="relative">
              <input
                type="number" min="0" step="0.01"
                value={prixVente}
                onChange={(e) => setPrixVente(e.target.value)}
                placeholder="29.99"
                className="w-full bg-[#0d0d14] border border-white/10 rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
            </div>
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <label className="text-sm font-medium text-zinc-300">Prix barré (optionnel)</label>
            <div className="relative">
              <input
                type="number" min="0" step="0.01"
                value={prixBarre}
                onChange={(e) => setPrixBarre(e.target.value)}
                placeholder="59.99"
                className="w-full bg-[#0d0d14] border border-white/10 rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
            </div>
          </div>
        </div>
      </div>

      {/* Preuve sociale */}
      <div className="rounded-2xl bg-[#13131f] border border-white/5 p-6 flex flex-col gap-4">
        <p className="text-sm font-medium text-zinc-300">Preuve sociale (optionnel)</p>
        <p className="text-[11px] text-zinc-600 -mt-2">
          Laisse vide si tu n&apos;as pas encore de vrais chiffres — la section ne s&apos;affichera pas. Jamais de valeurs inventées.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-400">Note (/5)</label>
            <input
              type="number" min="0" max="5" step="0.1"
              value={contenu.noteMoyenne ?? ""}
              onChange={(e) => setContenu((c) => ({ ...c, noteMoyenne: e.target.value }))}
              placeholder="4.8"
              className="bg-[#0d0d14] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-400">Nombre d&apos;avis</label>
            <input
              type="number" min="0" step="1"
              value={contenu.nombreAvis ?? ""}
              onChange={(e) => setContenu((c) => ({ ...c, nombreAvis: e.target.value }))}
              placeholder="120"
              className="bg-[#0d0d14] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium text-zinc-400">Ventes</label>
            <input
              type="number" min="0" step="1"
              value={contenu.nombreCommandes ?? ""}
              onChange={(e) => setContenu((c) => ({ ...c, nombreCommandes: e.target.value }))}
              placeholder="500"
              className="bg-[#0d0d14] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>
        </div>
      </div>

      {/* Photos */}
      <div className="rounded-2xl bg-[#13131f] border border-white/5 p-6 flex flex-col gap-5">
        <p className="text-sm font-medium text-zinc-300">Photos du produit</p>

        {uploadErreur && (
          <p className="text-xs text-red-400">{uploadErreur}</p>
        )}

        <div>
          <label className="text-xs text-zinc-500 mb-2 block">Photo héro (mise en avant)</label>
          <SlotPhoto
            url={images.hero}
            loading={uploadEnCours === "hero"}
            onUpload={(file) => uploadImage(file, "hero", (url) => setImages((im) => ({ ...im, hero: url })))}
            onRemove={() => setImages((im) => ({ ...im, hero: null }))}
          />
        </div>

        <div>
          <label className="text-xs text-zinc-500 mb-2 block">Galerie (jusqu&apos;à 3 photos)</label>
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
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={avantApresActif}
              onChange={(e) => {
                setAvantApresActif(e.target.checked);
                if (!e.target.checked) setImages((im) => ({ ...im, avant: null, apres: null }));
              }}
              className="w-4 h-4 accent-violet-600"
            />
            Ajouter des photos avant / après
          </label>
          {avantApresActif && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Avant</span>
                <SlotPhoto
                  compact
                  url={images.avant}
                  loading={uploadEnCours === "avant"}
                  onUpload={(file) => uploadImage(file, "avant", (u) => setImages((im) => ({ ...im, avant: u })))}
                  onRemove={() => setImages((im) => ({ ...im, avant: null }))}
                />
              </div>
              <div>
                <span className="text-[10px] text-zinc-600 uppercase tracking-widest">Après</span>
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

      {/* Réassurance */}
      <div className="rounded-2xl bg-[#13131f] border border-white/5 p-6 flex flex-col gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-300 cursor-pointer">
          <input
            type="checkbox"
            checked={reassurance.actif}
            onChange={(e) => setReassurance((r) => ({ ...r, actif: e.target.checked }))}
            className="w-4 h-4 accent-violet-600"
          />
          Blocs de réassurance
        </label>
        <p className="text-[11px] text-zinc-600 -mt-2">
          Mentions génériques et factuelles uniquement — pas de chiffres inventés (nombre de clients, avis...).
        </p>
        {reassurance.actif && (
          <div className="grid gap-3">
            <Champ label="🚚 Livraison" value={reassurance.livraison} onChange={(v) => setReassurance((r) => ({ ...r, livraison: v }))} />
            <Champ label="🔒 Paiement" value={reassurance.paiement} onChange={(v) => setReassurance((r) => ({ ...r, paiement: v }))} />
            <Champ label="↩ Satisfait ou remboursé" value={reassurance.retour} onChange={(v) => setReassurance((r) => ({ ...r, retour: v }))} />
          </div>
        )}
      </div>

      {/* Score d'audit IA live */}
      <div className="rounded-2xl bg-[#13131f] border border-white/5 p-6 flex items-center gap-5">
        <div
          className="w-16 h-16 rounded-full border-4 flex items-center justify-center shrink-0 font-bold text-lg"
          style={{
            borderColor: !auditResult ? "#3f3f46" : auditResult.score_global >= 75 ? "#22c55e" : auditResult.score_global >= 50 ? "#f59e0b" : "#ef4444",
            color: !auditResult ? "#71717a" : auditResult.score_global >= 75 ? "#22c55e" : auditResult.score_global >= 50 ? "#f59e0b" : "#ef4444",
          }}
        >
          {auditResult ? auditResult.score_global : "—"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white flex items-center gap-2">
            Score d&apos;audit IA
            {auditLoading && (
              <span className="w-3 h-3 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
            )}
          </p>
          <p className="text-[11px] text-zinc-500 mt-1 leading-relaxed">
            {auditResult
              ? auditResult.resume_executif
              : contenu.titre.trim() && contenu.description.trim()
              ? "Analyse en cours après tes modifications…"
              : "Remplis le titre et la description pour lancer l'analyse."}
          </p>
        </div>
      </div>

      {/* Preview + téléchargement */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-400">Aperçu en direct</p>
          <button
            onClick={handleDownload}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40"
          >
            ⬇ Télécharger le HTML
          </button>
        </div>
        {saved && (
          <p className="text-[11px] text-emerald-400">Sauvegardé dans « Mes sites ».</p>
        )}
        {saveError && (
          <p className="text-[11px] text-red-400">{saveError}</p>
        )}
        <div className="flex flex-col lg:flex-row gap-5 items-start">
          {/* Desktop */}
          <div className="flex-1 min-w-0 w-full rounded-2xl border border-white/10 overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 bg-[#13131f] border-b border-white/5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              <span className="ml-2 text-[10px] text-zinc-600">Bureau</span>
            </div>
            <iframe
              srcDoc={html}
              title="Aperçu bureau de la landing page"
              className="w-full"
              style={{ height: "70vh", border: "none", background: "#fff" }}
              sandbox="allow-same-origin"
            />
          </div>

          {/* Mobile — live, mise à jour à chaque frappe */}
          <div className="shrink-0 mx-auto lg:sticky lg:top-6">
            <p className="text-center text-[10px] text-zinc-600 mb-2">📱 Aperçu mobile</p>
            <div className="rounded-[28px] border-4 border-[#2a2a35] bg-[#13131f] p-1.5 shadow-xl">
              <div className="rounded-[20px] overflow-hidden" style={{ width: 300, height: 620 }}>
                <iframe
                  srcDoc={html}
                  title="Aperçu mobile de la landing page"
                  style={{ width: 300, height: 620, border: "none", background: "#fff" }}
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Champ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-[#0d0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
      />
    </div>
  );
}

function ChampArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium text-zinc-300">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className="bg-[#0d0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none"
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
  return (
    <div
      className={`relative rounded-xl border border-white/10 bg-[#0d0d14] overflow-hidden flex items-center justify-center ${
        compact ? "h-24" : "h-40"
      }`}
    >
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="w-full h-full object-cover" />
          <button
            onClick={onRemove}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-black/80 transition"
          >
            ✕
          </button>
        </>
      ) : (
        <label className="w-full h-full flex flex-col items-center justify-center gap-1.5 cursor-pointer text-zinc-600 hover:text-zinc-400 transition">
          {loading ? (
            <span className="w-5 h-5 border-2 border-violet-500/40 border-t-violet-500 rounded-full animate-spin" />
          ) : (
            <>
              <span className={compact ? "text-lg" : "text-2xl"}>+</span>
              {!compact && <span className="text-[11px]">Ajouter une photo</span>}
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
