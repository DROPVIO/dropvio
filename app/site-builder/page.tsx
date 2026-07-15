"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Step = 1 | 2 | 3;

type Palette = { primary: string; secondary: string; accent: string };

const STYLES: Array<{
  id: string; icon: string; label: string; desc: string;
  from: string; to: string; defaultPalette: Palette;
}> = [
  { id: "premium",    icon: "✨", label: "Luxueux / Premium",            desc: "Élégant, exclusif, haut de gamme",     from: "#7c3aed", to: "#ec4899", defaultPalette: { primary: "#7c3aed", secondary: "#1a0533", accent: "#f59e0b" } },
  { id: "nature",     icon: "🌿", label: "Éco-responsable / Nature",     desc: "Durable, naturel, éthique",            from: "#16a34a", to: "#0891b2", defaultPalette: { primary: "#16a34a", secondary: "#052e16", accent: "#0891b2" } },
  { id: "mainstream", icon: "🛒", label: "Mainstream / Accessible",      desc: "Simple, efficace, grand public",       from: "#2563eb", to: "#7c3aed", defaultPalette: { primary: "#2563eb", secondary: "#0f172a", accent: "#06b6d4" } },
  { id: "retro",      icon: "🎞️", label: "Rétro / Vintage",              desc: "Nostalgique, authentique, chaleureux", from: "#ea580c", to: "#ca8a04", defaultPalette: { primary: "#ea580c", secondary: "#1c0a00", accent: "#ca8a04" } },
  { id: "minimal",    icon: "◻",  label: "Minimaliste / Épuré",          desc: "Sobre, clair, moderne",                from: "#09090b", to: "#312e81", defaultPalette: { primary: "#a78bfa", secondary: "#09090b", accent: "#e4e4e7" } },
  { id: "tech",       icon: "⚡", label: "Tech / Futuriste",             desc: "Innovant, digital, high-tech",         from: "#0ea5e9", to: "#7c3aed", defaultPalette: { primary: "#0ea5e9", secondary: "#0c1a2e", accent: "#7c3aed" } },
];

const SHOPIFY_HTML_STEPS = [
  {
    icon: "🛍️",
    title: "Ouvre ton Shopify Admin",
    desc: "Connecte-toi à ton espace admin Shopify, puis dans le menu de gauche clique sur « Boutique en ligne » → « Pages ».",
  },
  {
    icon: "➕",
    title: "Crée une nouvelle page",
    desc: "Clique sur le bouton « Ajouter une page » en haut à droite de la liste des pages.",
  },
  {
    icon: "</>",
    title: "Passe en mode code HTML",
    desc: "Dans l'éditeur de texte de la page, clique sur l'icône « < > » (Source du code) pour basculer en mode HTML brut.",
  },
  {
    icon: "📋",
    title: "Colle le code HTML",
    desc: "Télécharge le fichier HTML via le bouton ci-dessus, ouvre-le dans un éditeur de texte (Bloc-notes, VS Code…), sélectionne tout (Ctrl+A), copie (Ctrl+C) et colle (Ctrl+V) dans l'éditeur Shopify.",
  },
  {
    icon: "🚀",
    title: "Enregistre et publie",
    desc: "Clique sur « Enregistrer » puis assure-toi que la visibilité est bien sur « Visible ». Ta landing page est maintenant en ligne à l'URL /pages/nom-de-ta-page.",
  },
];

const SHOPIFY_LIQUID_STEPS = [
  {
    icon: "🛍️",
    title: "Ouvre ton Shopify Admin",
    desc: "Connecte-toi à ton espace admin Shopify.",
  },
  {
    icon: "🎨",
    title: "Va dans Boutique en ligne → Thèmes → Modifier le code",
    desc: "Dans le menu de gauche, clique sur « Boutique en ligne » → « Thèmes ». Sur ton thème actif, clique sur « Actions » → « Modifier le code ».",
  },
  {
    icon: "📁",
    title: "Crée le fichier section",
    desc: "Dans le panneau de gauche, repère le dossier « sections ». Clique sur « Ajouter un nouveau fichier », nomme-le par exemple landing-produit.liquid et valide.",
  },
  {
    icon: "📋",
    title: "Colle le code Liquid",
    desc: "Télécharge le fichier .liquid via le bouton ci-dessus. Ouvre-le dans un éditeur de texte, copie tout le contenu (Ctrl+A puis Ctrl+C) et colle-le dans l'éditeur de code Shopify. Clique « Enregistrer ».",
  },
  {
    icon: "📄",
    title: "Crée une page et ajoute la section",
    desc: "Va dans « Boutique en ligne » → « Pages » → « Ajouter une page ». Enregistre-la. Ensuite dans « Thèmes » clique « Personnaliser », navigue sur ta nouvelle page, puis clique « Ajouter une section » et cherche le fichier liquid par son nom.",
  },
  {
    icon: "🚀",
    title: "Publie et partage",
    desc: "Ta landing page est maintenant intégrée dans ton thème Shopify avec header et footer. Elle est accessible à l'URL /pages/nom-de-ta-page.",
  },
];

function addTargetBlank(html: string): string {
  return html.replace(/<a(\s)/gi, '<a target="_blank" rel="noopener noreferrer"$1');
}

function SiteBuilderContent() {
  const searchParams = useSearchParams();

  const [step, setStep] = useState<Step>(1);
  const [productName, setProductName] = useState(searchParams.get("name") ?? "");
  const [description, setDescription] = useState(searchParams.get("description") ?? "");
  const [imageUrl, setImageUrl] = useState(searchParams.get("image") ?? "");
  const rating = searchParams.get("rating") ?? undefined;
  const orders = searchParams.get("orders") ?? undefined;

  // Style & palette
  const [selectedStyleId, setSelectedStyleId] = useState("premium");
  const [styleDrawerOpen, setStyleDrawerOpen] = useState(false);
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette>(STYLES[0].defaultPalette);
  const [draftPalette, setDraftPalette] = useState<Palette>(STYLES[0].defaultPalette);
  const [autoMode, setAutoMode] = useState(false);

  // Prices
  const [salePrice, setSalePrice] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");

  // AliExpress import
  const [aliexpressUrl, setAliexpressUrl] = useState("");
  const [aliexpressLoading, setAliexpressLoading] = useState(false);
  const [aliexpressError, setAliexpressError] = useState<string | null>(null);

  // Result
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [shopifyMode, setShopifyMode] = useState<"html" | "liquid" | null>(null);
  const [publishStep, setPublishStep] = useState(0);
  const [published, setPublished] = useState(false);

  const selectedStyle = STYLES.find((s) => s.id === selectedStyleId) ?? STYLES[0];

  async function handleImportAliexpress() {
    if (!aliexpressUrl.trim()) return;
    setAliexpressLoading(true);
    setAliexpressError(null);
    try {
      const res = await fetch("/api/aliexpress/product-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: aliexpressUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAliexpressError(json.error ?? "Produit introuvable");
      } else {
        if (json.nom) setProductName(json.nom);
        if (json.description) setDescription(json.description);
        if (json.image) setImageUrl(json.image);
        setAliexpressUrl("");
      }
    } catch {
      setAliexpressError("Impossible de contacter l'API");
    } finally {
      setAliexpressLoading(false);
    }
  }

  async function handleGenerate(withAutoMode = false) {
    if (!productName.trim() || !description.trim()) return;
    const isAuto = withAutoMode || autoMode;
    setStep(2);
    setError(null);
    try {
      const res = await fetch("/api/generate-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName,
          description,
          colorPrimary: isAuto ? undefined : palette.primary,
          colorSecondary: isAuto ? undefined : palette.secondary,
          colorAccent: isAuto ? undefined : palette.accent,
          style: isAuto ? "auto" : selectedStyleId,
          imageUrl: imageUrl.trim() || undefined,
          rating,
          orders,
          salePrice: salePrice.trim() || undefined,
          originalPrice: originalPrice.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Une erreur est survenue");
        setStep(1);
        return;
      }
      const finalHtml = addTargetBlank(json.html);
      setGeneratedHtml(finalHtml);
      setStep(3);

      fetch("/api/sites-generes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom_produit: productName, html_content: finalHtml }),
      }).catch(() => {});  // fire-and-forget, non bloquant
    } catch {
      setError("Impossible de contacter l'API");
      setStep(1);
    }
  }

  function handleDownload() {
    const blob = new Blob([generatedHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${productName.replace(/\s+/g, "-").toLowerCase()}-landing.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadLiquid() {
    // Extract <style> blocks from anywhere in the document
    const styleBlocks: string[] = [];
    const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
    let sm: RegExpExecArray | null;
    while ((sm = styleRe.exec(generatedHtml)) !== null) {
      styleBlocks.push(`<style>${sm[1]}</style>`);
    }

    // Extract body content (strip style tags already captured above)
    const bodyMatch = generatedHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    const bodyContent = (
      bodyMatch
        ? bodyMatch[1].replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
        : generatedHtml
            .replace(/<html\b[^>]*>/gi, "")
            .replace(/<\/html>/gi, "")
            .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
            .replace(/<body\b[^>]*>/gi, "")
            .replace(/<\/body>/gi, "")
    ).trim();

    const schemaName = productName.slice(0, 25).replace(/"/g, '\\"');
    const liquid = [
      ...styleBlocks,
      "",
      `<div class="dropvio-landing">`,
      bodyContent,
      `</div>`,
      "",
      `{% schema %}`,
      JSON.stringify({ name: schemaName, settings: [], presets: [{ name: schemaName }] }, null, 2),
      `{% endschema %}`,
    ].join("\n");

    const blob = new Blob([liquid], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${productName.replace(/\s+/g, "-").toLowerCase()}-section.liquid`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleReset() {
    setStep(1);
    setGeneratedHtml("");
    setError(null);
    setShopifyMode(null);
    setPublishStep(0);
    setPublished(false);
    setAliexpressError(null);
    setSalePrice("");
    setOriginalPrice("");
  }

  const canGenerate = productName.trim() && description.trim() && salePrice.trim();

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white font-sans px-4 py-16">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Site Builder
          </div>
          <div className="flex items-center justify-center gap-3 mb-3">
            <h1 className="text-3xl font-extrabold tracking-tight">
              Générateur de Landing Page
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold tracking-wider uppercase">
              Pro
            </span>
          </div>
          <p className="text-zinc-400 text-sm max-w-md mx-auto">
            Génère une landing page HTML complète pour ton produit dropshipping
            en quelques secondes grâce à l&apos;IA.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                  step === s
                    ? "bg-violet-600 border-violet-500 text-white"
                    : step > s
                    ? "bg-violet-600/30 border-violet-500/40 text-violet-400"
                    : "bg-transparent border-white/10 text-zinc-600"
                }`}
              >
                {step > s ? "✓" : s}
              </div>
              <span className={`text-xs font-medium ${step >= s ? "text-zinc-300" : "text-zinc-600"}`}>
                {s === 1 ? "Infos produit" : s === 2 ? "Génération" : "Résultat"}
              </span>
              {s < 3 && (
                <div className={`w-8 h-px ml-1 ${step > s ? "bg-violet-500/50" : "bg-white/10"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Product info form */}
        {step === 1 && (
          <div className="rounded-2xl bg-[#13131f] border border-white/5 p-8 flex flex-col gap-6">
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* AliExpress import */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-zinc-300">
                Importer depuis AliExpress{" "}
                <span className="text-zinc-500 font-normal">(optionnel)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={aliexpressUrl}
                  onChange={(e) => { setAliexpressUrl(e.target.value); setAliexpressError(null); }}
                  placeholder="https://www.aliexpress.com/item/123456789.html"
                  className="flex-1 bg-[#0d0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                />
                <button
                  type="button"
                  onClick={handleImportAliexpress}
                  disabled={!aliexpressUrl.trim() || aliexpressLoading}
                  className="px-4 py-3 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-400 text-sm font-semibold hover:bg-violet-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {aliexpressLoading ? "…" : "Importer"}
                </button>
              </div>
              {aliexpressError && (
                <p className="text-xs text-red-400">{aliexpressError}</p>
              )}
            </div>

            <div className="border-t border-white/5" />

            {/* Product name */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-zinc-300">Nom du produit</label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="ex: Ceinture Chauffante Lombaire Pro"
                className="bg-[#0d0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-zinc-300">Description courte</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="ex: Soulage les douleurs lombaires grâce à la chaleur infrarouge. Idéal pour le bureau et le sport. Batterie longue durée 8h."
                className="bg-[#0d0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none"
              />
            </div>

            {/* Image URL */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-zinc-300">
                URL de l&apos;image produit{" "}
                <span className="text-zinc-500 font-normal">(optionnel)</span>
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://exemple.com/image-produit.jpg"
                className="bg-[#0d0d14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
              {imageUrl.trim() && (
                <div className="mt-1 rounded-xl overflow-hidden border border-white/10 bg-[#0d0d14] h-32 flex items-center justify-center">
                  <img
                    src={imageUrl}
                    alt="Aperçu"
                    className="max-h-full max-w-full object-contain"
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              )}
            </div>

            {/* Prices */}
            <div className="flex gap-3">
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-medium text-zinc-300">
                  Prix de vente <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="29.99"
                    className="w-full bg-[#0d0d14] border border-white/10 rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-medium text-zinc-300">
                  Prix barré <span className="text-zinc-500 font-normal">(optionnel)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder="59.99"
                    className="w-full bg-[#0d0d14] border border-white/10 rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">€</span>
                </div>
              </div>
            </div>

            {/* Style chooser */}
            {!autoMode && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-zinc-300">Style de la page</label>

                {/* Trigger button */}
                <button
                  type="button"
                  onClick={() => { setStyleDrawerOpen((o) => !o); setEditingStyleId(null); }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all border ${
                    styleDrawerOpen
                      ? "border-violet-500/50 bg-violet-500/5"
                      : "border-white/10 bg-[#0d0d14] hover:border-white/20"
                  }`}
                >
                  <div className="flex rounded-lg overflow-hidden shrink-0 w-7 h-7">
                    <div className="flex-1" style={{ background: palette.primary }} />
                    <div className="flex-1" style={{ background: palette.secondary }} />
                    <div className="flex-1" style={{ background: palette.accent }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white leading-tight">
                      {selectedStyle.icon} {selectedStyle.label}
                    </p>
                    <p className="text-[11px] text-zinc-500 mt-0.5">{selectedStyle.desc}</p>
                  </div>
                  <span className="text-zinc-600 text-xs">{styleDrawerOpen ? "▲" : "▼"}</span>
                </button>

                {/* Drawer */}
                {styleDrawerOpen && (
                  <div className="rounded-xl border border-white/8 bg-[#0d0d14] overflow-hidden">
                    {editingStyleId === null ? (
                      /* ── Phase 1 : liste des styles ── */
                      <div className="p-3 flex flex-col gap-1">
                        {STYLES.map((s) => {
                          const sel = selectedStyleId === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => {
                                setEditingStyleId(s.id);
                                setDraftPalette(s.defaultPalette);
                              }}
                              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all w-full ${
                                sel ? "bg-violet-500/10 ring-1 ring-violet-500/40" : "hover:bg-white/[0.03]"
                              }`}
                            >
                              <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-white">{s.icon} {s.label}</p>
                                <p className="text-[11px] text-zinc-500 mt-0.5">{s.desc}</p>
                              </div>
                              <span className="text-zinc-600 text-xs shrink-0">Personnaliser →</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      /* ── Phase 2 : édition de la palette ── */
                      (() => {
                        const editingStyle = STYLES.find((s) => s.id === editingStyleId)!;
                        const colorFields: Array<{ key: keyof Palette; label: string; hint: string }> = [
                          { key: "primary",   label: "Couleur principale",  hint: "CTA, boutons, accents forts" },
                          { key: "secondary", label: "Couleur secondaire",  hint: "Fonds de sections alternées" },
                          { key: "accent",    label: "Couleur accent",      hint: "Badges, icônes, hover" },
                        ];
                        return (
                          <div className="flex flex-col">
                            {/* Header palette editor */}
                            <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-white/5">
                              <button
                                type="button"
                                onClick={() => setEditingStyleId(null)}
                                className="text-zinc-500 hover:text-white transition text-sm"
                              >
                                ← Retour
                              </button>
                              <div className="w-px h-4 bg-white/10" />
                              <span className="text-sm font-semibold text-white">{editingStyle.icon} {editingStyle.label}</span>
                            </div>

                            {/* Color pickers */}
                            <div className="p-4 flex flex-col gap-4">
                              {colorFields.map(({ key, label, hint }) => (
                                <div key={key} className="flex items-center gap-3">
                                  <div className="relative shrink-0">
                                    <input
                                      type="color"
                                      value={draftPalette[key]}
                                      onChange={(e) => setDraftPalette((p) => ({ ...p, [key]: e.target.value }))}
                                      className="w-10 h-10 rounded-xl cursor-pointer bg-transparent border-0 p-0"
                                    />
                                    <div
                                      className="absolute inset-0 rounded-xl ring-1 ring-white/10 pointer-events-none"
                                      style={{ background: draftPalette[key] }}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white">{label}</p>
                                    <p className="text-[10px] text-zinc-500 mt-0.5">{hint} · <span className="font-mono">{draftPalette[key]}</span></p>
                                  </div>
                                </div>
                              ))}

                              {/* Preview strip */}
                              <div className="h-6 rounded-lg overflow-hidden flex">
                                <div className="flex-1" style={{ background: draftPalette.primary }} />
                                <div className="flex-1" style={{ background: draftPalette.secondary }} />
                                <div className="flex-1" style={{ background: draftPalette.accent }} />
                              </div>

                              {/* Save button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedStyleId(editingStyleId);
                                  setPalette(draftPalette);
                                  setEditingStyleId(null);
                                  setStyleDrawerOpen(false);
                                }}
                                className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition"
                              >
                                Enregistrer les modifications
                              </button>
                            </div>
                          </div>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
            )}

            {/* CTA buttons */}
            <div className="mt-2 flex flex-col gap-3">
              <button
                onClick={() => handleGenerate(false)}
                disabled={!canGenerate || autoMode}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition-all duration-200 shadow-lg shadow-violet-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Générer la landing page avec l&apos;IA
              </button>

              <button
                onClick={() => {
                  setAutoMode(true);
                  handleGenerate(true);
                }}
                disabled={!canGenerate}
                className="w-full py-3 rounded-xl border border-white/10 text-zinc-300 text-sm font-semibold hover:border-white/20 hover:text-white hover:bg-white/[0.03] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>🤖</span>
                Génération automatique — l&apos;IA choisit le style
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Loading */}
        {step === 2 && (
          <div className="rounded-2xl bg-[#13131f] border border-white/5 p-16 flex flex-col items-center gap-6 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">✨</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-white font-semibold">L&apos;IA génère votre landing page…</p>
              <p className="text-zinc-500 text-sm">Création du hero, bénéfices, preuve sociale et CTA</p>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-zinc-400">
                Landing page générée pour{" "}
                <span className="text-white font-medium">{productName}</span>
              </p>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl border border-white/10 text-zinc-400 text-xs font-medium hover:border-white/20 hover:text-white transition"
                >
                  Recommencer
                </button>
                <button
                  onClick={handleDownloadLiquid}
                  className="px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition"
                >
                  ⬇ Fichier .liquid
                </button>
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40"
                >
                  ⬇ Télécharger le HTML
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 bg-[#13131f] border-b border-white/5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                <span className="ml-3 text-xs text-zinc-500 font-mono">
                  {productName.replace(/\s+/g, "-").toLowerCase()}-landing.html
                </span>
              </div>
              <iframe
                srcDoc={generatedHtml}
                title="Landing page preview"
                className="w-full"
                style={{ height: "70vh", border: "none", background: "#fff" }}
                sandbox="allow-same-origin"
              />
            </div>

            {/* Shopify publish guide */}
            <div className="mt-6 rounded-2xl bg-[#13131f] border border-white/5 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-base">🛍️</div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Publier sur Shopify</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Choisis ton mode de publication</p>
                </div>
              </div>

              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                {(
                  [
                    {
                      id: "html",
                      icon: "📄",
                      label: "Page HTML standalone",
                      desc: "Idéal pour les publicités Facebook et TikTok — une page dédiée sans le design de ton thème Shopify, parfaite pour convertir du trafic publicitaire.",
                      badge: "Pubs Facebook & TikTok",
                      badgeCls: "bg-blue-500/15 border-blue-500/20 text-blue-400",
                    },
                    {
                      id: "liquid",
                      icon: "💧",
                      label: "Section Liquid Shopify",
                      desc: "Idéal pour intégrer dans ton thème existant — la page s'adapte à ton header et footer Shopify, parfaite pour les pages produit de ta boutique.",
                      badge: "Boutique existante",
                      badgeCls: "bg-emerald-500/15 border-emerald-500/20 text-emerald-400",
                    },
                  ] as const
                ).map((mode) => {
                  const active = shopifyMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => { setShopifyMode(mode.id); setPublishStep(0); setPublished(false); }}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        active
                          ? "border-violet-500/50 bg-violet-500/[0.07]"
                          : "border-white/[0.06] bg-white/[0.02] hover:border-violet-500/30 hover:bg-violet-500/[0.03]"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{mode.icon}</span>
                        <p className="text-sm font-semibold text-white leading-snug">{mode.label}</p>
                        {active && <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-violet-400" />}
                      </div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed mb-3">{mode.desc}</p>
                      <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${mode.badgeCls}`}>
                        {mode.badge}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Empty state */}
              {shopifyMode === null && (
                <div className="rounded-xl border border-white/[0.04] py-6 text-center">
                  <p className="text-xs text-zinc-600">Sélectionne un mode pour afficher le guide</p>
                </div>
              )}

              {/* Guide */}
              {shopifyMode !== null && (
                published ? (
                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-6 py-8 text-center flex flex-col items-center gap-3">
                    <span className="text-4xl">🎉</span>
                    <p className="text-white font-semibold text-base">Félicitations !</p>
                    <p className="text-zinc-400 text-sm max-w-sm">
                      Ta landing page est maintenant en ligne sur Shopify. Partage l&apos;URL avec tes clients et lance tes publicités !
                    </p>
                    <button
                      onClick={handleReset}
                      className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                    >
                      Créer une autre landing page
                    </button>
                  </div>
                ) : (() => {
                  const steps = shopifyMode === "html" ? SHOPIFY_HTML_STEPS : SHOPIFY_LIQUID_STEPS;
                  return (
                    <div className="flex flex-col gap-3">
                      {steps.map((s, i) => {
                        const revealed = i <= publishStep;
                        const active = i === publishStep;
                        return (
                          <div
                            key={i}
                            className={`rounded-xl border px-4 py-4 flex gap-4 items-start transition-all duration-300 ${
                              revealed
                                ? active
                                  ? "border-violet-500/40 bg-violet-500/5"
                                  : "border-white/8 bg-white/[0.02]"
                                : "border-white/5 bg-transparent opacity-30"
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0 ${
                              revealed && !active ? "bg-emerald-500/15 border border-emerald-500/20" : "bg-[#0d0d14] border border-white/10"
                            }`}>
                              {revealed && !active ? "✓" : s.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-[10px] font-bold text-zinc-600 tracking-widest uppercase">Étape {i + 1}</span>
                              <p className={`text-sm font-semibold mt-0.5 ${revealed ? "text-white" : "text-zinc-600"}`}>{s.title}</p>
                              {revealed && (
                                <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{s.desc}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      <div className="mt-2 flex justify-end">
                        {publishStep < steps.length - 1 ? (
                          <button
                            onClick={() => setPublishStep((p) => p + 1)}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 text-white text-xs font-semibold transition-all shadow-lg shadow-violet-900/30"
                          >
                            Étape suivante →
                          </button>
                        ) : (
                          <button
                            onClick={() => setPublished(true)}
                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-lg shadow-emerald-900/30"
                          >
                            J&apos;ai publié mon site sur Shopify 🎉
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SiteBuilderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0d0d14] flex items-center justify-center text-zinc-500 text-sm">
        Chargement…
      </div>
    }>
      <SiteBuilderContent />
    </Suspense>
  );
}
