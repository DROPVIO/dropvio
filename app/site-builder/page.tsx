"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TemplateEditor from "./TemplateEditor";
import BoutiqueProduitsEditor from "@/components/site-builder/BoutiqueProduitsEditor";
import ColorTokenPanel from "@/components/site-builder/ColorTokenPanel";
import InspirationStyle from "@/components/site-builder/InspirationStyle";
import ApercuPages from "@/components/site-builder/ApercuPages";
import { pagesSiMultiples } from "@/lib/site-builder-pages";
import type { FicheStyle } from "@/lib/style-fiche";
import { applyTokenValue } from "@/lib/color-tokens";
import { htmlToLiquidSection } from "@/lib/html-to-liquid";
import { SHOW_LEGACY_TEMPLATES } from "@/lib/flags";
import { useBoutiqueDraft } from "@/lib/site-builder-handoff";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { slugFichier, telechargerTexte } from "@/lib/audit-download";
import { ToastHost, useToast } from "@/components/Toast";

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


// Longueur minimale du prompt du site — même seuil que PROMPT_MIN_CARACTERES côté serveur
// (app/api/generate-site/route.ts), qui refuse aussi la génération en dessous.
const PROMPT_MIN_CARACTERES = 20;

function addTargetBlank(html: string): string {
  return html.replace(/<a(\s)/gi, '<a target="_blank" rel="noopener noreferrer"$1');
}

// Palette initiale passée par « Créer mon site » (page boutique) via ?colorPrimary=…
// &colorSecondary=…&colorAccent=… — appliquée seulement si les trois sont en #RRGGBB,
// sinon on garde la palette par défaut du premier style.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
function initialPaletteFromParams(searchParams: Pick<URLSearchParams, "get">): Palette {
  const primary = searchParams.get("colorPrimary");
  const secondary = searchParams.get("colorSecondary");
  const accent = searchParams.get("colorAccent");
  if (primary && secondary && accent && HEX_COLOR.test(primary) && HEX_COLOR.test(secondary) && HEX_COLOR.test(accent)) {
    return { primary, secondary, accent };
  }
  return STYLES[0].defaultPalette;
}

const PRIX_FORMAT = /^\d+(\.\d{1,2})?$/;
function prixFromParam(value: string | null): string {
  return value && PRIX_FORMAT.test(value) && Number(value) > 0 ? value : "";
}

function SiteBuilderContent() {
  const { toast, succes, fermer } = useToast();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<"ia" | "template">(searchParams.get("mode") === "template" ? "template" : "ia");
  // Format d'export choisi à la création. N'influence PAS la génération : Claude produit
  // toujours du HTML standalone, et c'est lui qui est stocké dans sites_generes.html_content.
  // Le format ne décide que de la forme du fichier téléchargé / poussé vers Shopify, par
  // conversion à la demande (lib/html-to-liquid.ts). Il est modifiable après coup depuis
  // « Mes sites ».
  const [formatExport, setFormatExport] = useState<"html" | "liquid">("html");
  const [step, setStep] = useState<Step>(1);

  // Modes de création offerts par le sélecteur. « template » n'y figure que si le flag est
  // levé, ou si l'utilisateur est déjà dans ce mode (arrivée par ?mode=template) — voir
  // SHOW_LEGACY_TEMPLATES dans lib/flags.ts.
  const modesVisibles = (
    [
      { id: "ia", label: "🤖 Génération IA" },
      { id: "template", label: "🎨 Éditeur de templates" },
    ] as const
  ).filter((m) => m.id !== "template" || SHOW_LEGACY_TEMPLATES || mode === "template");
  const [productName, setProductName] = useState(searchParams.get("name") ?? "");
  const [description, setDescription] = useState(searchParams.get("description") ?? "");
  const [imageUrl, setImageUrl] = useState(searchParams.get("image") ?? "");
  const [reformulatingNom, setReformulatingNom] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [texteIaError, setTexteIaError] = useState<string | null>(null);
  const rating = searchParams.get("rating") ?? undefined;
  const orders = searchParams.get("orders") ?? undefined;
  // Préremplissage depuis "Créer un site pour cette boutique" (page de gestion boutique) —
  // relie le site généré à sa boutique d'origine dans sites_generes.boutique_id.
  const boutiqueId = searchParams.get("boutiqueId") ?? undefined;

  // Mode boutique (plusieurs produits) — le brouillon est déposé en sessionStorage par
  // app/site-builder/boutique/[id]/page.tsx juste avant la navigation (voir
  // lib/site-builder-handoff.ts). Il survit au rechargement de l'onglet, modifications
  // comprises. multi=1 sans brouillon (nouvel onglet, session expirée) : brouillonIntrouvable.
  const modeBoutique = searchParams.get("multi") === "1";
  const [brouillonLu, setBoutiqueDraft] = useBoutiqueDraft(modeBoutique);
  const boutiqueDraft = brouillonLu ?? null;
  const brouillonIntrouvable = modeBoutique && brouillonLu === null;

  // Style & palette
  const [selectedStyleId, setSelectedStyleId] = useState("premium");
  const [styleDrawerOpen, setStyleDrawerOpen] = useState(false);
  const [editingStyleId, setEditingStyleId] = useState<string | null>(null);
  const [palette, setPalette] = useState<Palette>(() => initialPaletteFromParams(searchParams));
  const [draftPalette, setDraftPalette] = useState<Palette>(() => initialPaletteFromParams(searchParams));
  const [autoMode, setAutoMode] = useState(false);

  // Prices
  // Préremplis par ?prixVente=…&prixOriginal=… (page boutique) — repris seulement si c'est un
  // prix valide (chiffres, 2 décimales max) et > 0, sinon le champ reste vide comme avant.
  const [salePrice, setSalePrice] = useState(() => prixFromParam(searchParams.get("prixVente")));
  const [originalPrice, setOriginalPrice] = useState(() => prixFromParam(searchParams.get("prixOriginal")));

  // AliExpress import
  const [aliexpressUrl, setAliexpressUrl] = useState("");
  const [aliexpressLoading, setAliexpressLoading] = useState(false);
  const [aliexpressError, setAliexpressError] = useState<string | null>(null);

  // Corrections d'un audit précédent, prises en compte dans le prompt de génération (voir
  // handleGenerate ci-dessous et app/api/generate-site/route.ts) — un texte libre, une
  // correction par ligne, éditable à la main même sans régénération en cours.
  const [corrections, setCorrections] = useState("");
  // Prompt du site, obligatoire dans les deux modes (au moins PROMPT_MIN_CARACTERES) : c'est la
  // consigne principale de la génération — sections, textes, animations — et il prime sur la
  // structure de base du prompt serveur (app/api/generate-site/route.ts, blocPromptUtilisateur).
  const [promptSite, setPromptSite] = useState("");
  // Fiche de style extraite des captures d'inspiration (components/site-builder/InspirationStyle.tsx),
  // envoyée avec la génération dans les deux modes — absente : prompt inchangé.
  const [ficheStyle, setFicheStyle] = useState<FicheStyle | null>(null);

  // Régénération pré-remplie (?regenerate=<id>, bouton "Regénérer" de app/mes-sites/page.tsx)
  // — recharge au montage tout ce qui a été perdu après la génération initiale (seuls
  // nom_produit/html_content étaient conservés jusqu'à 032_sites_generes_regeneration_fields.sql).
  const regenerateId = searchParams.get("regenerate") ?? undefined;
  // Initialisé directement à partir de regenerateId (lazy initializer) plutôt que mis à
  // true dans l'effet ci-dessous : évite un setState synchrone dans le corps de l'effet
  // (react-hooks/set-state-in-effect) pour un état qu'on connaît déjà au premier rendu.
  const [regenerating, setRegenerating] = useState(() => Boolean(regenerateId));
  const [regenerateError, setRegenerateError] = useState<string | null>(null);
  // Garde anti-double-appel en StrictMode (dev), qui monte, nettoie puis remonte le composant.
  const regenerateLu = useRef(false);
  useEffect(() => {
    if (regenerateLu.current) return;
    regenerateLu.current = true;
    if (!regenerateId) return;

    fetch(`/api/sites-generes/${regenerateId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setRegenerateError(json.error ?? "Impossible de charger ce site.");
          return;
        }
        if (typeof json.nom_produit === "string") setProductName(json.nom_produit);
        if (typeof json.description === "string") setDescription(json.description);
        if (typeof json.image_url === "string") setImageUrl(json.image_url);
        if (typeof json.lien_aliexpress === "string") setAliexpressUrl(json.lien_aliexpress);
        if (typeof json.prix_vente === "number") setSalePrice(String(json.prix_vente));
        if (typeof json.prix_original === "number") setOriginalPrice(String(json.prix_original));
        if (json.style_id === "auto") {
          setAutoMode(true);
        } else if (typeof json.style_id === "string" && STYLES.some((s) => s.id === json.style_id)) {
          setSelectedStyleId(json.style_id);
        }
        if (json.couleur_primary && json.couleur_secondary && json.couleur_accent) {
          const restored: Palette = {
            primary: json.couleur_primary,
            secondary: json.couleur_secondary,
            accent: json.couleur_accent,
          };
          setPalette(restored);
          setDraftPalette(restored);
        }
      })
      .catch(() => setRegenerateError("Impossible de contacter le serveur."))
      .finally(() => setRegenerating(false));

    // Corrections du dernier audit lié à ce site (audits_realises.site_id, voir
    // 031_audits_realises_site_id.sql) — best-effort et silencieux : sans audit lié, ou en
    // cas d'échec, le textarea reste simplement vide et éditable à la main.
    const supabase = createSupabaseBrowserClient();
    Promise.resolve(
      supabase
        .from("audits_realises")
        .select("categories")
        .eq("site_id", regenerateId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    )
      .then(({ data }) => {
        const categories = data?.categories as
          | { nom: string; corrections_specifiques: string[] }[]
          | undefined;
        if (!categories) return;
        const lines = categories
          .filter((c) => c.corrections_specifiques?.length > 0)
          .flatMap((c) => c.corrections_specifiques.map((s) => `[${c.nom}] ${s}`));
        if (lines.length > 0) setCorrections(lines.join("\n"));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Result
  const [generatedHtml, setGeneratedHtml] = useState("");
  // Site multi-pages (clé → HTML) quand la génération en renvoie au moins deux — l'aperçu
  // passe alors par ApercuPages, une page à la fois. null : aperçu d'une seule page, inchangé.
  const [generatedPages, setGeneratedPages] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveWarning, setSaveWarning] = useState<string | null>(null);
  const [savedSiteId, setSavedSiteId] = useState<string | null>(null);

  // Personnalisation post-génération (couleurs, voir ColorTokenPanel) — sauvegarde la
  // version modifiée dans sites_generes (PATCH), possible seulement une fois savedSiteId
  // connu (la sauvegarde initiale, non bloquante, se termine après le passage à l'étape 3).
  const [savingColors, setSavingColors] = useState(false);
  const [colorSaveError, setColorSaveError] = useState<string | null>(null);
  const [colorSaveSuccess, setColorSaveSuccess] = useState(false);
  // true dès qu'une couleur a été changée sans être encore enregistrée — la publication
  // Shopify (handlePushToShopify) lit html_content côté serveur depuis sites_generes, pas
  // l'état generatedHtml du navigateur : sans ce garde-fou visuel, publier après avoir changé
  // une couleur sans cliquer "Enregistrer" republierait silencieusement l'ancienne version.
  const [colorsDirty, setColorsDirty] = useState(false);

  // Shopify
  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null);
  const [shopifyDomain, setShopifyDomain] = useState<string | null>(null);
  const [shopifyDomainInput, setShopifyDomainInput] = useState("");
  const [shopifyPushingMode, setShopifyPushingMode] = useState<"html" | "liquid" | null>(null);
  const [shopifyPushError, setShopifyPushError] = useState<string | null>(null);
  const [shopifyPushResult, setShopifyPushResult] = useState<{
    mode: "html" | "liquid";
    url: string;
    admin_url: string;
    autoAttached?: boolean;
    message?: string;
  } | null>(null);

  useEffect(() => {
    fetch("/api/shopify/status")
      .then((res) => res.json())
      .then((json) => {
        setShopifyConnected(Boolean(json.connected));
        setShopifyDomain(json.shop_domain ?? null);
      })
      .catch(() => setShopifyConnected(false));
  }, []);

  // Restriction plan free — voir diagnostic "restriction export Site Builder" : l'aperçu reste
  // fonctionnel pour tous, mais téléchargement/export Liquid/publication Shopify sont réservés
  // à Pro/Agency. canExport démarre à false (état le plus restrictif) tant que /api/plan n'a
  // pas répondu, pour ne jamais afficher un bouton actif qui deviendrait grisé juste après.
  const [plan, setPlan] = useState<"free" | "pro" | "agency" | null>(null);
  useEffect(() => {
    fetch("/api/plan")
      .then((res) => res.json())
      .then((json) => setPlan(json.plan ?? "free"))
      .catch(() => setPlan("free"));
  }, []);
  const canExport = plan === "pro" || plan === "agency";

  function handleConnectShopify() {
    const shop = shopifyDomainInput.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      setShopifyPushError("Format attendu : ma-boutique.myshopify.com");
      return;
    }
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/shopify/connect?shop=${encodeURIComponent(shop)}&returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function handlePushToShopify(mode: "html" | "liquid") {
    if (!savedSiteId) {
      setShopifyPushError("Cette page n'a pas encore été sauvegardée — impossible de la publier sur Shopify.");
      return;
    }
    setShopifyPushingMode(mode);
    setShopifyPushError(null);
    setShopifyPushResult(null);
    try {
      const response = await fetch(`/api/sites-generes/${savedSiteId}/shopify-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const json = await response.json();
      if (!response.ok) {
        setShopifyPushError(json.error || "Impossible de publier sur Shopify.");
        return;
      }
      setShopifyPushResult(json);
    } catch {
      setShopifyPushError("Impossible de contacter le serveur.");
    } finally {
      setShopifyPushingMode(null);
    }
  }

  const selectedStyle = STYLES.find((s) => s.id === selectedStyleId) ?? STYLES[0];

  // Une correction par ligne dans le textarea → tableau de strings pour le payload
  // generate-site (voir app/api/generate-site/route.ts). undefined (pas []) quand vide, pour
  // ne pas ajouter de section vide au prompt.
  function correctionsList(): string[] | undefined {
    const lines = corrections
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.length > 0 ? lines : undefined;
  }

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
        // aliexpressUrl n'est plus effacé ici (contrairement à avant) : il est conservé et
        // envoyé à la sauvegarde du site (lien_aliexpress) pour être restitué lors d'une
        // future régénération — voir le useEffect de pré-remplissage plus haut.
      }
    } catch {
      setAliexpressError("Impossible de contacter l'API");
    } finally {
      setAliexpressLoading(false);
    }
  }

  async function handleReformulerNom() {
    if (!productName.trim()) return;
    setReformulatingNom(true);
    setTexteIaError(null);
    try {
      const response = await fetch("/api/generer-texte-produit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ champ: "nom", titre: productName }),
      });
      const json = await response.json();
      if (!response.ok) {
        setTexteIaError(json.error || "Impossible de reformuler le nom.");
        return;
      }
      setProductName(json.texte);
    } catch {
      setTexteIaError("Impossible de contacter le serveur.");
    } finally {
      setReformulatingNom(false);
    }
  }

  async function handleGenererDescription() {
    if (!productName.trim()) return;
    setGeneratingDescription(true);
    setTexteIaError(null);
    try {
      const response = await fetch("/api/generer-texte-produit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ champ: "description", titre: productName }),
      });
      const json = await response.json();
      if (!response.ok) {
        setTexteIaError(json.error || "Impossible de générer la description.");
        return;
      }
      setDescription(json.texte);
    } catch {
      setTexteIaError("Impossible de contacter le serveur.");
    } finally {
      setGeneratingDescription(false);
    }
  }

  async function handleGenerate(withAutoMode = false) {
    // Mode boutique (plusieurs produits) : style="auto" (Claude choisit librement toute la
    // palette) n'est pas supporté côté API pour ce mode — voir handleGenerateBoutique,
    // app/api/generate-site/route.ts — la grille injectée doit connaître la couleur d'accent
    // à l'avance. On résout donc toujours une palette concrète ici aussi.
    if (promptSite.trim().length < PROMPT_MIN_CARACTERES) return;
    if (boutiqueDraft) {
      if (boutiqueDraft.produits.length === 0) return;
    } else if (!productName.trim() || !description.trim()) {
      return;
    }
    const isAuto = !boutiqueDraft && (withAutoMode || autoMode);
    setStep(2);
    setError(null);
    try {
      const payload = boutiqueDraft
        ? {
            nomBoutique: boutiqueDraft.nomBoutique,
            descriptionBoutique: boutiqueDraft.descriptionBoutique,
            produits: boutiqueDraft.produits,
            categories: boutiqueDraft.categories,
            // Sert à relire côté serveur les mentions légales déjà renseignées de la boutique.
            boutiqueId: boutiqueDraft.boutiqueId,
            colorPrimary: palette.primary,
            colorSecondary: palette.secondary,
            colorAccent: palette.accent,
            style: selectedStyleId,
            prompt: promptSite.trim(),
            ficheStyle: ficheStyle ?? undefined,
          }
        : {
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
            corrections: correctionsList(),
            ficheStyle: ficheStyle ?? undefined,
            prompt: promptSite.trim(),
          };
      const res = await fetch("/api/generate-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Une erreur est survenue");
        setStep(1);
        return;
      }
      const finalHtml = addTargetBlank(json.html);
      setGeneratedHtml(finalHtml);
      setGeneratedPages(pagesSiMultiples(json.pages));
      setSaveWarning(null);
      setStep(3);

      // Sauvegarde non bloquante : la page générée reste utilisable même si la
      // sauvegarde dans "Mes sites" échoue (ex: limite du plan atteinte) — on
      // affiche juste un avertissement plutôt que de le cacher silencieusement.
      fetch("/api/sites-generes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom_produit: boutiqueDraft ? boutiqueDraft.nomBoutique : productName,
          html_content: finalHtml,
          // Site boutique multi-pages : html_content ne contient que l'accueil, le catalogue et
          // les collections sont dans pages (040_sites_generes_pages.sql).
          pages: pagesSiMultiples(json.pages) ?? undefined,
          boutique_id: boutiqueId,
          // Envoyé pour les deux modes : contrairement aux champs de pré-remplissage, le
          // format d'export a un sens pour un site boutique comme pour un mono-produit.
          format_export: formatExport,
          // Champs de pré-remplissage pour une future régénération (voir useEffect de
          // pré-remplissage ci-dessus) — uniquement pertinents en mode mono-page, jamais
          // envoyés pour un site boutique (plusieurs produits, pas de description unique).
          ...(!boutiqueDraft && {
            description,
            lien_aliexpress: aliexpressUrl.trim() || undefined,
            image_url: imageUrl.trim() || undefined,
            prix_vente: salePrice.trim() || undefined,
            prix_original: originalPrice.trim() || undefined,
            style_id: isAuto ? "auto" : selectedStyleId,
            couleur_primary: isAuto ? undefined : palette.primary,
            couleur_secondary: isAuto ? undefined : palette.secondary,
            couleur_accent: isAuto ? undefined : palette.accent,
          }),
        }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setSaveWarning(data.error ?? "Cette page n'a pas pu être sauvegardée dans « Mes sites ».");
            return;
          }
          // Publier sur Shopify (route /api/sites-generes/[id]/shopify-push) a besoin de
          // cet id — sans sauvegarde réussie, il n'y a rien à publier.
          setSavedSiteId(data.id ?? null);
        })
        .catch(() => setSaveWarning("Cette page n'a pas pu être sauvegardée dans « Mes sites » (connexion au serveur impossible)."));
    } catch {
      setError("Impossible de contacter l'API");
      setStep(1);
    }
  }

  function handleDownload() {
    const nom = boutiqueDraft ? boutiqueDraft.nomBoutique : productName;
    // slugFichier() : nom vient de l'utilisateur (nom de produit ou de boutique) et peut
    // contenir des accents, que l'ancien replace() sur les espaces laissait passer.
    const nomFichier = `${slugFichier(nom)}-landing.html`;
    telechargerTexte(generatedHtml, nomFichier);
    succes(`Fichier enregistré dans vos Téléchargements : ${nomFichier}`);
  }

  function handleDownloadLiquid() {
    const nom = boutiqueDraft ? boutiqueDraft.nomBoutique : productName;
    const liquid = htmlToLiquidSection(generatedHtml, nom);
    const nomFichier = `${slugFichier(nom)}-section.liquid`;
    telechargerTexte(liquid, nomFichier, "text/plain;charset=utf-8");
    succes(`Fichier enregistré dans vos Téléchargements : ${nomFichier}`);
  }

  async function handleSaveColors() {
    if (!savedSiteId) {
      setColorSaveError("Sauvegarde initiale du site pas encore terminée, réessaie dans un instant.");
      return;
    }
    setSavingColors(true);
    setColorSaveError(null);
    setColorSaveSuccess(false);
    try {
      const response = await fetch(`/api/sites-generes/${savedSiteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html_content: generatedHtml }),
      });
      const json = await response.json();
      if (!response.ok) {
        setColorSaveError(json.error || "Impossible d'enregistrer ces couleurs.");
        return;
      }
      setColorSaveSuccess(true);
      setColorsDirty(false);
      window.setTimeout(() => setColorSaveSuccess(false), 2500);
    } catch {
      setColorSaveError("Impossible de contacter le serveur.");
    } finally {
      setSavingColors(false);
    }
  }

  function handleReset() {
    setStep(1);
    setGeneratedHtml("");
    setGeneratedPages(null);
    setError(null);
    setSaveWarning(null);
    setSavedSiteId(null);
    setShopifyPushError(null);
    setShopifyPushResult(null);
    setAliexpressError(null);
    setSalePrice("");
    setOriginalPrice("");
  }

  // Caractères manquants au prompt pour pouvoir générer (0 : prompt suffisant).
  const promptManquant = Math.max(0, PROMPT_MIN_CARACTERES - promptSite.trim().length);
  const canGenerate =
    promptManquant === 0 &&
    (boutiqueDraft
      ? boutiqueDraft.produits.length > 0
      : productName.trim() && description.trim() && salePrice.trim());

  // Champ du prompt, rendu en tête de l'étape 1 dans les deux modes.
  const champPrompt = (
    <div className="flex flex-col gap-2">
      <label htmlFor="prompt-site" className="text-sm font-medium text-[var(--text-primary)]">
        Prompt de ton site <span className="text-[var(--danger)]">*</span>
      </label>
      <p className="text-xs text-[var(--text-faint)]">
        Décris le site que tu veux, de A à Z : sections, textes, ton, animations, ambiance. L&apos;IA s&apos;appuie sur
        une structure de base, mais c&apos;est ton prompt qui compte le plus.
      </p>
      <textarea
        id="prompt-site"
        value={promptSite}
        onChange={(e) => setPromptSite(e.target.value)}
        rows={6}
        placeholder="ex : Un hero plein écran avec une vidéo d'ambiance, puis une section « notre histoire » en deux colonnes, des témoignages en carrousel, un ton chaleureux et familial, des animations douces au défilement…"
        className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-y"
      />
      <p className={`text-right text-xs ${promptManquant > 0 ? "text-[var(--text-faint)]" : "text-[var(--accent)]"}`}>
        {promptSite.trim().length} caractère{promptSite.trim().length > 1 ? "s" : ""}
        {promptManquant > 0 ? ` — encore ${promptManquant} minimum` : ""}
      </p>
    </div>
  );
  // Raison affichée sous le bouton quand le prompt est trop court (bouton désactivé).
  const raisonPrompt =
    promptManquant > 0 ? (
      <p className="text-xs text-[var(--danger)]">
        Le bouton est désactivé : ton prompt doit faire au moins {PROMPT_MIN_CARACTERES} caractères (encore{" "}
        {promptManquant}). C&apos;est lui qui guide toute la génération.
      </p>
    ) : null;

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text-primary)] font-sans px-4 py-16">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[var(--accent)] text-xs font-medium tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />
            Site Builder
          </div>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-3">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">
                Générateur de Landing Page
              </h1>
              <p className="text-[var(--text-muted)] text-sm max-w-md mt-3">
                Génère une landing page HTML complète pour ton produit dropshipping
                en quelques secondes grâce à l&apos;IA.
              </p>
            </div>
            <Link
              href="/site-builder/boutique"
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
            >
              Mode boutique
            </Link>
          </div>
        </div>

        {/* Bannière + édition mode boutique — rendues une seule fois, partagées entre les
            modes IA et Éditeur de templates ci-dessous (tous deux consomment le même
            boutiqueDraft en lecture pour leur génération respective). */}
        {brouillonIntrouvable && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-[var(--warning)]">
            Le brouillon de la boutique est introuvable dans cet onglet. Retourne sur la page de ta boutique et relance « Créer mon site ».
          </div>
        )}
        {boutiqueDraft && (
          <>
            <div className="mb-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-4 text-sm text-[var(--text-primary)]">
              🏪 Mode boutique — <strong>{boutiqueDraft.nomBoutique}</strong> : {boutiqueDraft.produits.length} produit
              {boutiqueDraft.produits.length > 1 ? "s" : ""} importé{boutiqueDraft.produits.length > 1 ? "s" : ""}
              {boutiqueDraft.totalProduitsBoutique > boutiqueDraft.produits.length
                ? ` sur ${boutiqueDraft.totalProduitsBoutique} au total.`
                : "."}
            </div>
            {/* Liste repliée par défaut : avec tous les produits de la boutique, l'éditeur
                pousserait le reste du formulaire très bas. */}
            <details className="mb-4">
              <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--text-primary)]">
                {boutiqueDraft.produits.length} produit{boutiqueDraft.produits.length > 1 ? "s" : ""} importé
                {boutiqueDraft.produits.length > 1 ? "s" : ""}
              </summary>
              <div className="mt-3">
                <BoutiqueProduitsEditor draft={boutiqueDraft} onChange={setBoutiqueDraft} />
              </div>
            </details>
          </>
        )}

        {/* Mode toggle — l'onglet « Éditeur de templates » (ancien mode, antérieur à la
            génération IA) est masqué derrière SHOW_LEGACY_TEMPLATES, à false par défaut :
            les nouveaux utilisateurs n'ont plus qu'un seul chemin de création. Rien n'est
            supprimé pour autant — TemplateEditor.tsx et lib/site-templates.ts restent en
            place, et le mode reste joignable par ?mode=template. Dans ce cas l'onglet
            réapparaît (mode === "template"), sans quoi l'utilisateur arrivé par un lien
            existant n'aurait plus aucun moyen de revenir à la génération IA.
            Le sélecteur disparaît entièrement quand il ne reste qu'un seul mode : un
            interrupteur à une seule position n'a rien à offrir. */}
        {modesVisibles.length > 1 && (
          <div className="flex justify-center mb-10">
            <div className="inline-flex gap-1 p-1 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
              {modesVisibles.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    mode === m.id
                      ? "bg-violet-600 text-white"
                      : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "template" && <TemplateEditor boutiqueDraft={boutiqueDraft} canExport={canExport} />}

        {mode === "ia" && (
        <>
        {/* Step indicators */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {([1, 2, 3] as Step[]).map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border transition-all ${
                  step === s
                    ? "bg-violet-600 border-violet-500 text-white"
                    : step > s
                    ? "bg-violet-600/30 border-violet-500/40 text-[var(--accent)]"
                    : "bg-transparent border-[var(--border-strong)] text-[var(--text-faint)]"
                }`}
              >
                {step > s ? "✓" : s}
              </div>
              <span className={`text-xs font-medium ${step >= s ? "text-[var(--text-muted)]" : "text-[var(--text-faint)]"}`}>
                {s === 1 ? "Infos produit" : s === 2 ? "Génération" : "Résultat"}
              </span>
              {s < 3 && (
                <div className={`w-8 h-px ml-1 ${step > s ? "bg-violet-500/50" : "bg-[var(--border-strong)]"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Format d'export — placé au-dessus du formulaire parce qu'il vaut pour les deux
            variantes de l'étape 1 (mode produit unique et mode boutique). Purement
            déclaratif à ce stade : la génération est identique dans les deux cas, seul le
            fichier produit à l'étape 3 change. */}
        {step === 1 && (
          <div className="mb-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-6 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--text-muted)]">Format d&apos;export</span>
              <span className="text-xs text-[var(--text-faint)]">
                Modifiable à tout moment depuis « Mes sites » — la page générée, elle, reste la même.
              </span>
            </div>
            <div className="inline-flex gap-1 p-1 rounded-xl bg-[var(--bg)] border border-[var(--border-strong)] self-start sm:self-auto">
              {(
                [
                  { id: "html", label: "📄 HTML" },
                  { id: "liquid", label: "🛍 Liquid (Shopify)" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFormatExport(f.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    formatExport === f.id
                      ? "bg-violet-600 text-white"
                      : "text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1 (mode boutique) : les produits s'éditent au-dessus (BoutiqueProduitsEditor,
            partagé avec le mode Éditeur) — ici juste l'erreur éventuelle + génération directe.
            Pas de bouton "génération automatique" : style="auto" n'est pas supporté pour ce
            mode côté API (voir app/api/generate-site/route.ts). */}
        {step === 1 && boutiqueDraft && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-8 flex flex-col gap-6">
            {error && (
              <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">
                {error}
              </div>
            )}
            {champPrompt}
            <InspirationStyle fiche={ficheStyle} onChange={setFicheStyle} />
            <button
              onClick={() => handleGenerate(false)}
              disabled={!canGenerate}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition-all duration-200 shadow-lg shadow-violet-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Générer la landing page avec l&apos;IA
            </button>
            {raisonPrompt}
          </div>
        )}

        {/* Step 1: Product info form */}
        {step === 1 && !boutiqueDraft && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-8 flex flex-col gap-6">
            {error && (
              <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">
                {error}
              </div>
            )}

            {regenerating && (
              <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-[var(--accent)] text-sm">
                Chargement des données du site à régénérer…
              </div>
            )}
            {regenerateError && (
              <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">
                {regenerateError}
              </div>
            )}

            {champPrompt}

            {/* AliExpress import */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-muted)]">
                Importer depuis AliExpress{" "}
                <span className="text-[var(--text-faint)] font-normal">(optionnel)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={aliexpressUrl}
                  onChange={(e) => { setAliexpressUrl(e.target.value); setAliexpressError(null); }}
                  placeholder="https://www.aliexpress.com/item/123456789.html"
                  className="flex-1 bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                />
                <button
                  type="button"
                  onClick={handleImportAliexpress}
                  disabled={!aliexpressUrl.trim() || aliexpressLoading}
                  className="px-4 py-3 rounded-xl bg-violet-600/20 border border-violet-500/30 text-[var(--accent)] text-sm font-semibold hover:bg-violet-600/30 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {aliexpressLoading ? "…" : "Importer"}
                </button>
              </div>
              {aliexpressError && (
                <p className="text-xs text-[var(--danger)]">{aliexpressError}</p>
              )}
            </div>

            <div className="border-t border-[var(--border)]" />

            {/* Product name */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-[var(--text-muted)]">Nom du produit</label>
                <button
                  type="button"
                  onClick={handleReformulerNom}
                  disabled={!productName.trim() || reformulatingNom}
                  className="shrink-0 rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                >
                  {reformulatingNom ? "…" : "✨ Reformuler"}
                </button>
              </div>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="ex: Ceinture Chauffante Lombaire Pro"
                className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-medium text-[var(--text-muted)]">Description courte</label>
                <button
                  type="button"
                  onClick={handleGenererDescription}
                  disabled={!productName.trim() || generatingDescription}
                  className="shrink-0 rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                  title={!productName.trim() ? "Renseigne d'abord un nom de produit" : undefined}
                >
                  {generatingDescription ? "…" : "✨ Générer une description"}
                </button>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="ex: Soulage les douleurs lombaires grâce à la chaleur infrarouge. Idéal pour le bureau et le sport. Batterie longue durée 8h."
                className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none"
              />
              {texteIaError ? <p className="text-xs text-[var(--danger)]">{texteIaError}</p> : null}
            </div>

            {/* Image URL */}
            <div className="flex flex-col gap-2">
              <div className="rounded-xl bg-amber-500/[0.08] border border-amber-500/20 px-4 py-3 flex gap-2.5 items-start">
                <span className="shrink-0">📷</span>
                <p className="text-xs text-[var(--warning)] leading-relaxed">
                  Ajoute l&apos;URL d&apos;une photo de ton produit ci-dessous. Sans image, ta landing page
                  n&apos;affichera <strong>aucune vraie photo produit</strong> — juste un visuel décoratif
                  générique (dégradé ou icône) à la place.
                </p>
              </div>
              <label className="text-sm font-medium text-[var(--text-muted)]">
                URL de l&apos;image produit{" "}
                <span className="text-[var(--text-faint)] font-normal">(optionnel)</span>
              </label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://exemple.com/image-produit.jpg"
                className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
              />
              {imageUrl.trim() && (
                <div className="mt-1 rounded-xl overflow-hidden border border-[var(--border-strong)] bg-[var(--bg)] h-32 flex items-center justify-center">
                  {/* <img> volontairement conservé (pas next/image) : aperçu en direct d'une URL
                      externe arbitraire tapée par l'utilisateur, jamais un domaine connu à l'avance
                      — un remotePattern en wildcard ferait proxier n'importe quelle URL par le
                      serveur (risque SSRF/bande passante non bornée) pour un gain d'optimisation nul
                      sur un aperçu de validation ponctuel. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
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
                <label className="text-sm font-medium text-[var(--text-muted)]">
                  Prix de vente <span className="text-[var(--danger)]">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={salePrice}
                    onChange={(e) => setSalePrice(e.target.value)}
                    placeholder="29.99"
                    className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl pl-4 pr-10 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)] text-sm">€</span>
                </div>
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <label className="text-sm font-medium text-[var(--text-muted)]">
                  Prix barré <span className="text-[var(--text-faint)] font-normal">(optionnel)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder="59.99"
                    className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl pl-4 pr-10 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)] text-sm">€</span>
                </div>
              </div>
            </div>

            {/* Style chooser */}
            {!autoMode && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-[var(--text-muted)]">Style de la page</label>

                {/* Trigger button */}
                <button
                  type="button"
                  onClick={() => { setStyleDrawerOpen((o) => !o); setEditingStyleId(null); }}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all border ${
                    styleDrawerOpen
                      ? "border-violet-500/50 bg-violet-500/5"
                      : "border-[var(--border-strong)] bg-[var(--bg)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {/* Aperçu de la palette choisie par l'utilisateur pour SA landing page —
                      couleurs dynamiques réelles, sans rapport avec le thème de l'app : reste
                      volontairement en inline style, jamais en tokens. */}
                  <div className="flex rounded-lg overflow-hidden shrink-0 w-7 h-7">
                    <div className="flex-1" style={{ background: palette.primary }} />
                    <div className="flex-1" style={{ background: palette.secondary }} />
                    <div className="flex-1" style={{ background: palette.accent }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">
                      {selectedStyle.icon} {selectedStyle.label}
                    </p>
                    <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{selectedStyle.desc}</p>
                  </div>
                  <span className="text-[var(--text-faint)] text-xs">{styleDrawerOpen ? "▲" : "▼"}</span>
                </button>

                {/* Drawer */}
                {styleDrawerOpen && (
                  <div className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] overflow-hidden">
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
                                sel ? "bg-violet-500/10 ring-1 ring-violet-500/40" : "hover:bg-[var(--surface-2)]"
                              }`}
                            >
                              {/* Dégradé de prévisualisation du style — couleurs figées propres
                                  à chaque style prédéfini (pas le thème de l'app), reste en
                                  inline style volontairement. */}
                              <div className="w-8 h-8 rounded-lg shrink-0" style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[var(--text-primary)]">{s.icon} {s.label}</p>
                                <p className="text-[11px] text-[var(--text-faint)] mt-0.5">{s.desc}</p>
                              </div>
                              <span className="text-[var(--text-faint)] text-xs shrink-0">Personnaliser →</span>
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
                            <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-[var(--border)]">
                              <button
                                type="button"
                                onClick={() => setEditingStyleId(null)}
                                className="text-[var(--text-faint)] hover:text-[var(--text-primary)] transition text-sm"
                              >
                                ← Retour
                              </button>
                              <div className="w-px h-4 bg-[var(--border-strong)]" />
                              <span className="text-sm font-semibold text-[var(--text-primary)]">{editingStyle.icon} {editingStyle.label}</span>
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
                                    {/* Couleur choisie par l'utilisateur pour sa landing page —
                                        inline style volontaire, valeur dynamique arbitraire. */}
                                    <div
                                      className="absolute inset-0 rounded-xl ring-1 ring-white/10 pointer-events-none"
                                      style={{ background: draftPalette[key] }}
                                    />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
                                    <p className="text-[10px] text-[var(--text-faint)] mt-0.5">{hint} · <span className="font-mono">{draftPalette[key]}</span></p>
                                  </div>
                                </div>
                              ))}

                              {/* Preview strip — couleurs dynamiques utilisateur, inline style volontaire */}
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

            {/* Corrections d'un audit précédent — pré-rempli automatiquement lors d'une
                régénération si un audit est lié à ce site (voir useEffect plus haut), sinon
                vide et éditable librement. Pris en compte dans le prompt si non vide. */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-[var(--text-muted)]">
                Corrections à prendre en compte{" "}
                <span className="text-[var(--text-faint)] font-normal">(optionnel)</span>
              </label>
              <textarea
                value={corrections}
                onChange={(e) => setCorrections(e.target.value)}
                placeholder="Colle ici les points faibles d'un audit précédent (une correction par ligne) — l'IA en tiendra compte pour cette génération."
                rows={4}
                className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-y"
              />
            </div>

            <InspirationStyle fiche={ficheStyle} onChange={setFicheStyle} />

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
                className="w-full py-3 rounded-xl border border-[var(--border-strong)] text-[var(--text-muted)] text-sm font-semibold hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span>🤖</span>
                Génération automatique — l&apos;IA choisit le style
              </button>
              {raisonPrompt}
            </div>
          </div>
        )}

        {/* Step 2: Loading */}
        {step === 2 && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-16 flex flex-col items-center gap-6 text-center">
            <div className="relative">
              <div className="w-16 h-16 rounded-full border-2 border-violet-500/20 border-t-violet-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">✨</span>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-[var(--text-primary)] font-semibold">L&apos;IA génère votre landing page…</p>
              <p className="text-[var(--text-faint)] text-sm">Création du hero, bénéfices, preuve sociale et CTA</p>
            </div>
          </div>
        )}

        {/* Step 3: Result */}
        {step === 3 && (
          <div className="flex flex-col gap-4">
            {saveWarning && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-[var(--warning)] text-sm">
                ⚠️ {saveWarning}
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-sm text-[var(--text-muted)]">
                Landing page générée pour{" "}
                <span className="text-[var(--text-primary)] font-medium">
                  {boutiqueDraft ? boutiqueDraft.nomBoutique : productName}
                </span>
              </p>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-muted)] text-xs font-medium hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition"
                >
                  Recommencer
                </button>
                {canExport ? (
                  <>
                    {/* Le format choisi à l'étape 1 devient le bouton principal ; l'autre
                        reste accessible en secondaire. Les deux partent du même HTML — la
                        conversion Liquid est faite à la demande, au clic. */}
                    <button
                      onClick={formatExport === "liquid" ? handleDownload : handleDownloadLiquid}
                      className="px-4 py-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-[var(--success)] text-xs font-semibold hover:bg-emerald-500/20 transition"
                    >
                      {formatExport === "liquid" ? "⬇ Fichier .html" : "⬇ Fichier .liquid"}
                    </button>
                    <button
                      onClick={formatExport === "liquid" ? handleDownloadLiquid : handleDownload}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40"
                    >
                      {formatExport === "liquid" ? "⬇ Télécharger le .liquid" : "⬇ Télécharger le HTML"}
                    </button>
                  </>
                ) : (
                  <Link
                    href="/#pricing"
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40"
                  >
                    🔒 Passe au plan Pro pour télécharger ton site
                  </Link>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-strong)] overflow-hidden">
              <div className="flex items-center gap-1.5 px-4 py-3 bg-[var(--surface)] border-b border-[var(--border)]">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                <span className="ml-3 text-xs text-[var(--text-faint)] font-mono">
                  {(boutiqueDraft ? boutiqueDraft.nomBoutique : productName).replace(/\s+/g, "-").toLowerCase()}-landing.html
                </span>
              </div>
              {/* L'aperçu est toujours rendu sur fond blanc (background: "#fff") quel que
                  soit le thème de l'app : c'est un aperçu fidèle de la landing page générée
                  telle qu'elle apparaîtra réellement, pas un élément de chrome de l'app. */}
              {generatedPages ? (
                <ApercuPages pages={generatedPages} />
              ) : (
                <iframe
                  srcDoc={generatedHtml}
                  title="Landing page preview"
                  className="w-full"
                  style={{ height: "70vh", border: "none", background: "#fff" }}
                  sandbox="allow-same-origin"
                />
              )}
            </div>

            <div className="mt-6">
              <ColorTokenPanel
                html={generatedHtml}
                onTokenChange={(name, value) => {
                  setGeneratedHtml((prev) => applyTokenValue(prev, name, value));
                  setColorsDirty(true);
                }}
                onSave={handleSaveColors}
                saving={savingColors}
                saveError={colorSaveError}
                saveSuccess={colorSaveSuccess}
              />
            </div>

            {/* Publication Shopify */}
            <div className="mt-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-base">🛍️</div>
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">Publier sur Shopify</h2>
                  <p className="text-xs text-[var(--text-faint)] mt-0.5">
                    {shopifyConnected ? `Connecté à ${shopifyDomain}` : "Connecte ta boutique pour publier en un clic"}
                  </p>
                </div>
              </div>

              {colorsDirty ? (
                <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-[var(--warning)] text-xs">
                  ⚠️ Couleurs modifiées non enregistrées — clique « Enregistrer ces couleurs » ci-dessus avant de publier, sinon Shopify recevra l&apos;ancienne version.
                </div>
              ) : null}

              {!canExport ? (
                <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-xs text-[var(--text-muted)]">
                  🔒 La publication sur Shopify est réservée aux plans Pro et Agency.{" "}
                  <Link href="/#pricing" className="text-[var(--accent)] font-semibold hover:underline">
                    Passe au plan Pro →
                  </Link>
                </div>
              ) : shopifyConnected === null ? (
                <p className="text-xs text-[var(--text-faint)]">Vérification de la connexion…</p>
              ) : !shopifyConnected ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-[var(--text-faint)]">
                    Renseigne le domaine de ta boutique pour la connecter — tu n&apos;auras plus jamais besoin de copier-coller de code.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shopifyDomainInput}
                      onChange={(e) => setShopifyDomainInput(e.target.value)}
                      placeholder="ma-boutique.myshopify.com"
                      className="flex-1 bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                    />
                    <button
                      type="button"
                      onClick={handleConnectShopify}
                      disabled={!shopifyDomainInput.trim()}
                      className="px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      Connecter ma boutique Shopify
                    </button>
                  </div>
                  {/* Fallback manuel, gardé pour ceux qui ne veulent pas connecter leur boutique */}
                  <p className="text-[11px] text-[var(--text-faint)] mt-1">
                    Tu préfères le faire toi-même ? Télécharge le HTML ou le fichier .liquid ci-dessus et colle-le dans ton admin Shopify.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handlePushToShopify("html")}
                      disabled={shopifyPushingMode !== null || !savedSiteId}
                      className="rounded-xl border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-left transition hover:bg-blue-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">📄 Page HTML standalone</p>
                      <p className="text-[11px] text-[var(--text-faint)] mt-1">Idéal pour les pubs Facebook/TikTok</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePushToShopify("liquid")}
                      disabled={shopifyPushingMode !== null || !savedSiteId}
                      className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-left transition hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">💧 Section Liquid du thème</p>
                      <p className="text-[11px] text-[var(--text-faint)] mt-1">S&apos;intègre à ton thème existant</p>
                    </button>
                  </div>

                  {!savedSiteId && (
                    <p className="text-[11px] text-[var(--warning)]">
                      En attente de la sauvegarde de la page — réessaie dans un instant si les boutons restent grisés.
                    </p>
                  )}

                  {shopifyPushingMode && (
                    <p className="text-xs text-[var(--text-muted)]">Publication en cours ({shopifyPushingMode})…</p>
                  )}

                  {shopifyPushError && (
                    <div className="rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
                      {shopifyPushError}
                    </div>
                  )}

                  {shopifyPushResult && (
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 flex flex-col gap-2">
                      <p className="text-sm font-semibold text-[var(--success)]">
                        {shopifyPushResult.mode === "liquid" && shopifyPushResult.autoAttached === false
                          ? "Section publiée — une étape manuelle reste à faire"
                          : "Publié sur Shopify 🎉"}
                      </p>
                      {shopifyPushResult.message && (
                        <p className="text-xs text-[var(--text-muted)]">{shopifyPushResult.message}</p>
                      )}
                      <div className="flex gap-3 mt-1">
                        <a
                          href={shopifyPushResult.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[var(--success)] hover:opacity-80 underline"
                        >
                          Voir la page →
                        </a>
                        <a
                          href={shopifyPushResult.admin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
                        >
                          Ouvrir dans l&apos;admin Shopify →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        </>
        )}
      </div>

      <ToastHost toast={toast} onClose={fermer} />
    </div>
  );
}

export default function SiteBuilderPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center text-[var(--text-faint)] text-sm">
        Chargement…
      </div>
    }>
      <SiteBuilderContent />
    </Suspense>
  );
}
