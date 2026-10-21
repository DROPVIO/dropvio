"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TemplateEditor from "./TemplateEditor";
import BoutiqueProduitsEditor from "@/components/site-builder/BoutiqueProduitsEditor";
import ColorTokenPanel from "@/components/site-builder/ColorTokenPanel";
import ComposerSite, { type ActionMenu, type PieceJointe } from "@/components/site-builder/ComposerSite";
import ApercuPages from "@/components/site-builder/ApercuPages";
import ModifierSiteIA from "@/components/site-builder/ModifierSiteIA";
import { pagesSiMultiples } from "@/lib/site-builder-pages";
import type { FicheStyle } from "@/lib/style-fiche";
import { applyTokenValue } from "@/lib/color-tokens";
import { htmlToLiquidSection } from "@/lib/html-to-liquid";
import { SHOW_LEGACY_TEMPLATES } from "@/lib/flags";
import { useBoutiqueDraft } from "@/lib/site-builder-handoff";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { slugFichier, telechargerTexte } from "@/lib/audit-download";
import { telechargerPageSeule, telechargerSiteMultiPages } from "@/lib/telechargement-site";
import { ToastHost, useToast } from "@/components/Toast";
import { LIEN_CHANGER_DE_PLAN } from "@/lib/plan-links";
import { useTranslations } from "next-intl";
import { isAppLocale, type AppLocale } from "@/lib/locale";
import { useApiErrorMessage } from "@/lib/use-api-error";

type Step = 1 | 2 | 3;

type Palette = { primary: string; secondary: string; accent: string };

// Styles reconnus par /api/generate-site. Plus de choix dans l'interface : un nouveau site
// part du style par défaut (le premier) avec la palette reçue de la page boutique, sinon
// DEFAULT_PALETTE ; une régénération garde le style et la palette enregistrés avec le site.
const STYLE_IDS = ["premium", "nature", "mainstream", "retro", "minimal", "tech"];
const DEFAULT_PALETTE: Palette = { primary: "#7c3aed", secondary: "#1a0533", accent: "#f59e0b" };


// Longueur minimale du prompt du site — même seuil que PROMPT_MIN_CARACTERES côté serveur
// (app/api/generate-site/route.ts), qui refuse aussi la génération en dessous.
const PROMPT_MIN_CARACTERES = 20;

// Liens externes (http/https) ouverts dans un nouvel onglet. Les liens internes (#ancre,
// pages du site) restent tels quels : avec target="_blank", chaque clic sur « Commander » ou
// sur la navigation ouvrait un nouvel onglet dans le fichier téléchargé.
function addTargetBlank(html: string): string {
  return html.replace(/<a(\s[^>]*?\bhref=["']https?:)/gi, '<a target="_blank" rel="noopener noreferrer"$1');
}

// Palette initiale passée par « Créer mon site » (page boutique) via ?colorPrimary=…
// &colorSecondary=…&colorAccent=… — appliquée seulement si les trois sont en #RRGGBB,
// sinon on garde la palette par défaut.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
function initialPaletteFromParams(searchParams: Pick<URLSearchParams, "get">): Palette {
  const primary = searchParams.get("colorPrimary");
  const secondary = searchParams.get("colorSecondary");
  const accent = searchParams.get("colorAccent");
  if (primary && secondary && accent && HEX_COLOR.test(primary) && HEX_COLOR.test(secondary) && HEX_COLOR.test(accent)) {
    return { primary, secondary, accent };
  }
  return DEFAULT_PALETTE;
}

const PRIX_FORMAT = /^\d+(\.\d{1,2})?$/;
function prixFromParam(value: string | null): string {
  return value && PRIX_FORMAT.test(value) && Number(value) > 0 ? value : "";
}

function SiteBuilderContent() {
  const { toast, succes, fermer } = useToast();
  const t = useTranslations("siteBuilder.builder");
  const apiErrorMessage = useApiErrorMessage();
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
      { id: "ia", label: t("modes.ia") },
      { id: "template", label: t("modes.template") },
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
  // Un brouillon resté dans l'onglet pour une autre boutique n'est jamais repris.
  const boutiqueDraft = brouillonLu && (!boutiqueId || brouillonLu.boutiqueId === boutiqueId) ? brouillonLu : null;
  const brouillonIntrouvable = modeBoutique && brouillonLu !== undefined && boutiqueDraft === null;

  // Langue du contenu du site généré, envoyée à /api/generate-site et à l'éditeur de templates :
  // celle de la boutique quand le site en vient (brouillon ou ?langue= posé par la page
  // boutique), sinon le français. Plus de sélecteur dans l'interface.
  const langueParam = searchParams.get("langue");
  const langueImposee: AppLocale | null = boutiqueDraft?.langue ?? (isAppLocale(langueParam) ? langueParam : null);
  const langueSite: AppLocale = langueImposee ?? "fr";

  // Style & palette
  const [selectedStyleId, setSelectedStyleId] = useState(STYLE_IDS[0]);
  const [palette, setPalette] = useState<Palette>(() => initialPaletteFromParams(searchParams));
  const [autoMode, setAutoMode] = useState(false);
  // Panneaux ouverts depuis le « + » de la barre de saisie (ComposerSite) : fiche produit
  // (mode produit unique), corrections d'audit, liste des produits (mode boutique).
  const [produitOuvert, setProduitOuvert] = useState(false);
  const [correctionsOuvertes, setCorrectionsOuvertes] = useState(false);
  const [produitsBoutiqueOuverts, setProduitsBoutiqueOuverts] = useState(false);
  const produitsBoutiqueRef = useRef<HTMLDetailsElement>(null);

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
  // Fiche de style extraite des captures d'inspiration jointes dans la barre de saisie
  // (components/site-builder/ComposerSite.tsx, logique dans InspirationStyle.tsx),
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
          setRegenerateError(apiErrorMessage(json, t("erreurs.chargementSite")));
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
        } else if (typeof json.style_id === "string" && STYLE_IDS.includes(json.style_id)) {
          setSelectedStyleId(json.style_id);
        }
        if (json.couleur_primary && json.couleur_secondary && json.couleur_accent) {
          const restored: Palette = {
            primary: json.couleur_primary,
            secondary: json.couleur_secondary,
            accent: json.couleur_accent,
          };
          setPalette(restored);
        }
      })
      .catch(() => setRegenerateError(apiErrorMessage({ code: "network" })))
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

  // ?modifier=<id> (lien « Modifier » de Mes sites) : rouvre un site enregistré directement à
  // l'étape résultat, pour le modifier avec l'IA, changer ses couleurs ou le publier.
  const modifierId = searchParams.get("modifier") ?? undefined;
  const modifierLu = useRef(false);
  useEffect(() => {
    if (modifierLu.current || !modifierId) return;
    modifierLu.current = true;
    fetch(`/api/sites-generes/${modifierId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setError(apiErrorMessage(json, t("erreurs.chargementSite")));
          return;
        }
        // Plan Free : la route ne renvoie pas le HTML enregistré (voir sites-generes/[id]).
        if (typeof json.html_content !== "string" || !json.html_content) {
          setError(t("erreurs.modifierPlan"));
          return;
        }
        if (typeof json.nom_produit === "string") setProductName(json.nom_produit);
        setGeneratedHtml(json.html_content);
        setGeneratedPages(pagesSiMultiples(json.pages));
        setSavedSiteId(modifierId);
        setStep(3);
      })
      .catch(() => setError(apiErrorMessage({ code: "network" })));
  }, [modifierId, apiErrorMessage, t]);

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
    messageCode?: "liquidAttache" | "liquidManuel";
    sectionType?: string;
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
      setShopifyPushError(t("shopify.formatDomaine"));
      return;
    }
    const returnTo = window.location.pathname + window.location.search;
    window.location.href = `/api/shopify/connect?shop=${encodeURIComponent(shop)}&returnTo=${encodeURIComponent(returnTo)}`;
  }

  async function handlePushToShopify(mode: "html" | "liquid") {
    if (!savedSiteId) {
      setShopifyPushError(t("shopify.pasSauvegardee"));
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
        setShopifyPushError(apiErrorMessage(json, t("erreurs.shopify")));
        return;
      }
      setShopifyPushResult(json);
    } catch {
      setShopifyPushError(apiErrorMessage({ code: "network" }));
    } finally {
      setShopifyPushingMode(null);
    }
  }


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
        setAliexpressError(apiErrorMessage(json, t("erreurs.importProduit")));
      } else {
        if (json.nom) setProductName(json.nom);
        if (json.description) setDescription(json.description);
        if (json.image) setImageUrl(json.image);
        // aliexpressUrl n'est plus effacé ici (contrairement à avant) : il est conservé et
        // envoyé à la sauvegarde du site (lien_aliexpress) pour être restitué lors d'une
        // future régénération — voir le useEffect de pré-remplissage plus haut.
      }
    } catch {
      setAliexpressError(apiErrorMessage({ code: "network" }));
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
        setTexteIaError(apiErrorMessage(json, t("erreurs.reformuler")));
        return;
      }
      setProductName(json.texte);
    } catch {
      setTexteIaError(apiErrorMessage({ code: "network" }));
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
        setTexteIaError(apiErrorMessage(json, t("erreurs.genererDescription")));
        return;
      }
      setDescription(json.texte);
    } catch {
      setTexteIaError(apiErrorMessage({ code: "network" }));
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
            langue: langueSite,
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
            langue: langueSite,
          };
      const res = await fetch("/api/generate-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(json, t("erreurs.generation")));
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
            setSaveWarning(apiErrorMessage(data, t("erreurs.sauvegarde")));
            return;
          }
          // Publier sur Shopify (route /api/sites-generes/[id]/shopify-push) a besoin de
          // cet id — sans sauvegarde réussie, il n'y a rien à publier.
          setSavedSiteId(data.id ?? null);
        })
        .catch(() => setSaveWarning(t("erreurs.sauvegardeReseau")));
    } catch {
      setError(apiErrorMessage({ code: "network" }));
      setStep(1);
    }
  }

  function handleDownload() {
    const nom = boutiqueDraft ? boutiqueDraft.nomBoutique : productName;
    // Site multi-pages : un seul fichier HTML qui contient toutes les pages, pour que les
    // liens Accueil, Catalogue, collections et pages légales fonctionnent hors de Dropvio.
    if (generatedPages) {
      succes(t("siteCompletTelecharge", { fichier: telechargerSiteMultiPages(generatedPages, nom) }));
      return;
    }
    // slugFichier() : nom vient de l'utilisateur (nom de produit ou de boutique) et peut
    // contenir des accents, que l'ancien replace() sur les espaces laissait passer.
    const nomFichier = `${slugFichier(nom)}-landing.html`;
    telechargerPageSeule(generatedHtml, nomFichier);
    succes(t("fichierTelecharge", { fichier: nomFichier }));
  }

  function handleDownloadLiquid() {
    const nom = boutiqueDraft ? boutiqueDraft.nomBoutique : productName;
    const liquid = htmlToLiquidSection(generatedHtml, nom);
    const nomFichier = `${slugFichier(nom)}-section.liquid`;
    telechargerTexte(liquid, nomFichier, "text/plain;charset=utf-8");
    succes(t("fichierTelecharge", { fichier: nomFichier }));
  }

  async function handleSaveColors() {
    if (!savedSiteId) {
      setColorSaveError(t("erreurs.sauvegardeEnCours"));
      return;
    }
    setSavingColors(true);
    setColorSaveError(null);
    setColorSaveSuccess(false);
    try {
      const response = await fetch(`/api/sites-generes/${savedSiteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html_content: generatedHtml, ...(generatedPages && { pages: generatedPages }) }),
      });
      const json = await response.json();
      if (!response.ok) {
        setColorSaveError(apiErrorMessage(json, t("erreurs.couleurs")));
        return;
      }
      setColorSaveSuccess(true);
      setColorsDirty(false);
      window.setTimeout(() => setColorSaveSuccess(false), 2500);
    } catch {
      setColorSaveError(apiErrorMessage({ code: "network" }));
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

  const produitIncomplet = !productName.trim() || !description.trim() || !salePrice.trim();
  // Ce qui manque encore pour générer, affiché sous la barre de saisie.
  const aideComposer = boutiqueDraft
    ? boutiqueDraft.produits.length === 0
      ? t("composer.aideProduitsBoutique")
      : promptManquant > 0
        ? t("composer.aidePrompt", { min: PROMPT_MIN_CARACTERES, manquant: promptManquant })
        : null
    : produitIncomplet
      ? t("composer.aideProduit")
      : promptManquant > 0
        ? t("composer.aidePrompt", { min: PROMPT_MIN_CARACTERES, manquant: promptManquant })
        : null;

  const nbCorrections = correctionsList()?.length ?? 0;
  const actionCorrections: ActionMenu = {
    id: "corrections",
    icone: "📝",
    libelle: t("composer.corrections"),
    aide: t("composer.correctionsAide"),
    onClick: () => setCorrectionsOuvertes(true),
  };
  const pieceCorrections: PieceJointe[] =
    nbCorrections > 0
      ? [
          {
            id: "corrections",
            icone: "📝",
            titre: t("composer.corrections"),
            sousTitre: t("composer.correctionsCompte", { count: nbCorrections }),
            onClick: () => setCorrectionsOuvertes(true),
            onRetirer: () => setCorrections(""),
          },
        ]
      : [];

  // Mode produit unique : le produit est la pièce jointe principale du message.
  const piecesProduitUnique: PieceJointe[] = [
    productName.trim()
      ? {
          id: "produit",
          titre: productName.trim(),
          sousTitre: salePrice.trim() ? `${salePrice.trim()} €` : t("composer.prixManquant"),
          image: imageUrl.trim() || null,
          onClick: () => setProduitOuvert(true),
          onRetirer: () => {
            setProductName("");
            setDescription("");
            setImageUrl("");
            setSalePrice("");
            setOriginalPrice("");
            setAliexpressUrl("");
          },
        }
      : {
          id: "produit",
          icone: "＋",
          titre: t("composer.produitAttendu"),
          sousTitre: t("composer.produitAttenduAide"),
          attendue: true,
          onClick: () => setProduitOuvert(true),
        },
    ...pieceCorrections,
  ];
  const actionsProduitUnique: ActionMenu[] = [
    {
      id: "produit",
      icone: "📦",
      libelle: productName.trim() ? t("composer.modifierProduit") : t("composer.ajouterProduit"),
      aide: t("composer.ajouterProduitAide"),
      onClick: () => setProduitOuvert(true),
    },
    actionCorrections,
  ];

  // Mode boutique : « + » ajoute une fiche vide au brouillon (même limite de plan que
  // BoutiqueProduitsEditor) et déplie la liste des produits pour la remplir.
  const limiteBoutique = boutiqueDraft?.limiteProduits ?? null;
  const limiteBoutiqueAtteinte =
    limiteBoutique !== null && (boutiqueDraft?.produits.length ?? 0) >= limiteBoutique;
  function ouvrirProduitsBoutique() {
    setProduitsBoutiqueOuverts(true);
    requestAnimationFrame(() => produitsBoutiqueRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function ajouterProduitBoutique() {
    if (!boutiqueDraft || limiteBoutiqueAtteinte) return;
    setBoutiqueDraft({
      ...boutiqueDraft,
      produits: [...boutiqueDraft.produits, { nom: "", description: "", image: null, prixVente: "", prixOriginal: "" }],
    });
    ouvrirProduitsBoutique();
  }

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
                {t("titre")}
              </h1>
              <p className="text-[var(--text-muted)] text-sm max-w-md mt-3">
                {t("intro")}
              </p>
            </div>
            <Link
              href="/site-builder/boutique"
              className="inline-flex items-center justify-center rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
            >
              {t("modeBoutique")}
            </Link>
          </div>
        </div>

        {/* Bannière + édition mode boutique — rendues une seule fois, partagées entre les
            modes IA et Éditeur de templates ci-dessous (tous deux consomment le même
            boutiqueDraft en lecture pour leur génération respective). */}
        {brouillonIntrouvable && (
          <div className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-[var(--warning)]">
            {t("brouillon.introuvable")}
          </div>
        )}
        {boutiqueDraft && (
          <>
            <div className="mb-4 rounded-2xl border border-violet-500/30 bg-violet-500/10 px-5 py-4 text-sm text-[var(--text-primary)]">
              {t.rich(
                boutiqueDraft.totalProduitsBoutique > boutiqueDraft.produits.length
                  ? "brouillon.bandeauSurTotal"
                  : "brouillon.bandeau",
                {
                  nom: boutiqueDraft.nomBoutique,
                  count: boutiqueDraft.produits.length,
                  total: boutiqueDraft.totalProduitsBoutique,
                  strong: (chunks) => <strong>{chunks}</strong>,
                }
              )}
            </div>
            {/* Liste repliée par défaut : avec tous les produits de la boutique, l'éditeur
                pousserait le reste du formulaire très bas. */}
            <details
              ref={produitsBoutiqueRef}
              open={produitsBoutiqueOuverts}
              onToggle={(e) => setProduitsBoutiqueOuverts(e.currentTarget.open)}
              className="mb-4 scroll-mt-6"
            >
              <summary className="cursor-pointer select-none text-sm font-semibold text-[var(--text-primary)]">
                {t("brouillon.importes", { count: boutiqueDraft.produits.length })}
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

        {mode === "template" && <TemplateEditor boutiqueDraft={boutiqueDraft} canExport={canExport} langueSite={langueSite} />}

        {mode === "ia" && (
        <>
        {/* Format d'export — placé au-dessus du formulaire parce qu'il vaut pour les deux
            variantes de l'étape 1 (mode produit unique et mode boutique). Purement
            déclaratif à ce stade : la génération est identique dans les deux cas, seul le
            fichier produit à l'étape 3 change. */}
        {step === 1 && (
          <div className="mb-6 rounded-2xl bg-[var(--surface)] border border-[var(--border)] px-6 py-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-[var(--text-muted)]">{t("format.titre")}</span>
              <span className="text-xs text-[var(--text-faint)]">
                {t("format.aide")}
              </span>
            </div>
            <div className="inline-flex gap-1 p-1 rounded-xl bg-[var(--bg)] border border-[var(--border-strong)] self-start sm:self-auto">
              {(
                [
                  { id: "html", label: t("format.html") },
                  { id: "liquid", label: t("format.liquid") },
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
          <div className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">
                {error}
              </div>
            )}
            <ComposerSite
              prompt={promptSite}
              onPromptChange={setPromptSite}
              promptManquant={promptManquant}
              piecesJointes={[
                {
                  id: "produits",
                  icone: "🛍️",
                  titre: t("composer.produitsBoutique", { count: boutiqueDraft.produits.length }),
                  sousTitre: boutiqueDraft.nomBoutique,
                  onClick: ouvrirProduitsBoutique,
                },
              ]}
              actions={[
                {
                  id: "produit",
                  icone: "📦",
                  libelle: t("composer.ajouterProduit"),
                  aide: limiteBoutiqueAtteinte
                    ? t("composer.limiteAtteinte", { max: limiteBoutique ?? 0 })
                    : t("composer.ajouterProduitBoutiqueAide"),
                  disabled: limiteBoutiqueAtteinte,
                  onClick: ajouterProduitBoutique,
                },
              ]}
              fiche={ficheStyle}
              onFicheChange={setFicheStyle}
              peutEnvoyer={Boolean(canGenerate)}
              onEnvoyer={() => handleGenerate(false)}
              aide={aideComposer}
            />
          </div>
        )}

        {/* Step 1: Product info form */}
        {step === 1 && !boutiqueDraft && (
          <div className="flex flex-col gap-4">
            {error && (
              <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">
                {error}
              </div>
            )}

            {regenerating && (
              <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-[var(--accent)] text-sm">
                {t("chargementRegeneration")}
              </div>
            )}
            {regenerateError && (
              <div className="rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)]/20 px-4 py-3 text-[var(--danger)] text-sm">
                {regenerateError}
              </div>
            )}

            {/* Fiche produit, ouverte depuis le « + » ou la pièce jointe produit de la barre. */}
            {produitOuvert && (
              <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-6">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("composer.produitTitre")}</h2>
                  <button
                    type="button"
                    onClick={() => setProduitOuvert(false)}
                    className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]"
                  >
                    {t("composer.terminer")}
                  </button>
                </div>
                {/* AliExpress import */}
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-[var(--text-muted)]">
                    {t("formulaire.importer")}{" "}
                    <span className="text-[var(--text-faint)] font-normal">{t("facultatif")}</span>
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
                      {aliexpressLoading ? "…" : t("formulaire.importerBouton")}
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
                    <label className="text-sm font-medium text-[var(--text-muted)]">{t("formulaire.nom")}</label>
                    <button
                      type="button"
                      onClick={handleReformulerNom}
                      disabled={!productName.trim() || reformulatingNom}
                      className="shrink-0 rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {reformulatingNom ? "…" : t("formulaire.reformuler")}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder={t("formulaire.nomPlaceholder")}
                    className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                  />
                </div>

                {/* Description */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-[var(--text-muted)]">{t("formulaire.description")}</label>
                    <button
                      type="button"
                      onClick={handleGenererDescription}
                      disabled={!productName.trim() || generatingDescription}
                      className="shrink-0 rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                      title={!productName.trim() ? t("formulaire.nomDabord") : undefined}
                    >
                      {generatingDescription ? "…" : t("formulaire.genererDescription")}
                    </button>
                  </div>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    placeholder={t("formulaire.descriptionPlaceholder")}
                    className="bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-none"
                  />
                  {texteIaError ? <p className="text-xs text-[var(--danger)]">{texteIaError}</p> : null}
                </div>

                {/* Image URL */}
                <div className="flex flex-col gap-2">
                  <div className="rounded-xl bg-amber-500/[0.08] border border-amber-500/20 px-4 py-3 flex gap-2.5 items-start">
                    <span className="shrink-0">📷</span>
                    <p className="text-xs text-[var(--warning)] leading-relaxed">
                      {t.rich("formulaire.imageAvertissement", { strong: (chunks) => <strong>{chunks}</strong> })}
                    </p>
                  </div>
                  <label className="text-sm font-medium text-[var(--text-muted)]">
                    {t("formulaire.image")}{" "}
                    <span className="text-[var(--text-faint)] font-normal">{t("facultatif")}</span>
                  </label>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder={t("formulaire.imagePlaceholder")}
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
                        alt={t("formulaire.apercuImage")}
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
                      {t("formulaire.prixVente")} <span className="text-[var(--danger)]">*</span>
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
                      {t("formulaire.prixBarre")} <span className="text-[var(--text-faint)] font-normal">{t("facultatif")}</span>
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
              </div>
            )}

            {/* Corrections d'un audit précédent — pré-remplies automatiquement lors d'une
                régénération si un audit est lié à ce site (voir useEffect plus haut), sinon
                vides et éditables librement. Prises en compte dans le prompt si non vides. */}
            {correctionsOuvertes && (
              <div className="rounded-3xl bg-[var(--surface)] border border-[var(--border)] p-6 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("corrections.titre")}</h2>
                  <button
                    type="button"
                    onClick={() => setCorrectionsOuvertes(false)}
                    className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-2)]"
                  >
                    {t("composer.terminer")}
                  </button>
                </div>
                <textarea
                  value={corrections}
                  onChange={(e) => setCorrections(e.target.value)}
                  placeholder={t("corrections.placeholder")}
                  rows={4}
                  className="w-full bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition resize-y"
                />
              </div>
            )}

            <ComposerSite
              prompt={promptSite}
              onPromptChange={setPromptSite}
              promptManquant={promptManquant}
              piecesJointes={piecesProduitUnique}
              actions={actionsProduitUnique}
              fiche={ficheStyle}
              onFicheChange={setFicheStyle}
              autoMode={autoMode}
              onAutoModeChange={setAutoMode}
              peutEnvoyer={Boolean(canGenerate)}
              onEnvoyer={() => handleGenerate(false)}
              aide={aideComposer}
            />
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
              <p className="text-[var(--text-primary)] font-semibold">{t("generation.titre")}</p>
              <p className="text-[var(--text-faint)] text-sm">{t("generation.aide")}</p>
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
                {t("resultat.genereePour")}{" "}
                <span className="text-[var(--text-primary)] font-medium">
                  {boutiqueDraft ? boutiqueDraft.nomBoutique : productName}
                </span>
              </p>
              <div className="flex gap-2 flex-wrap justify-end">
                <button
                  onClick={handleReset}
                  className="px-4 py-2 rounded-xl border border-[var(--border-strong)] text-[var(--text-muted)] text-xs font-medium hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition"
                >
                  {t("resultat.recommencer")}
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
                      {formatExport === "liquid" ? t("resultat.fichierHtml") : t("resultat.fichierLiquid")}
                    </button>
                    <button
                      onClick={formatExport === "liquid" ? handleDownloadLiquid : handleDownload}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40"
                    >
                      {formatExport === "liquid" ? t("resultat.telechargerLiquid") : t("resultat.telechargerHtml")}
                    </button>
                  </>
                ) : (
                  <Link
                    href={LIEN_CHANGER_DE_PLAN}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all shadow-lg shadow-violet-900/40"
                  >
                    {t("resultat.passerPro")}
                  </Link>
                )}
              </div>
            </div>

            {/* Modifier le site sans le regénérer : en premier, au-dessus de l'aperçu, pour qu'il
                suffise de coller ce qu'on veut changer. */}
            <ModifierSiteIA
              html={generatedHtml}
              pages={generatedPages}
              siteId={savedSiteId}
              onChange={({ html, pages }) => {
                setGeneratedHtml(html);
                setGeneratedPages(pages);
              }}
            />

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
                  title={t("resultat.titreApercu")}
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
                  // Même couleur sur toutes les pages du site (téléchargement, aperçu).
                  setGeneratedPages((prev) =>
                    prev
                      ? Object.fromEntries(Object.entries(prev).map(([cle, html]) => [cle, applyTokenValue(html, name, value)]))
                      : prev
                  );
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
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">{t("shopify.titre")}</h2>
                  <p className="text-xs text-[var(--text-faint)] mt-0.5">
                    {shopifyConnected ? t("shopify.connecte", { domaine: shopifyDomain ?? "" }) : t("shopify.aConnecter")}
                  </p>
                </div>
              </div>

              {colorsDirty ? (
                <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-[var(--warning)] text-xs">
                  {t("shopify.couleursNonEnregistrees")}
                </div>
              ) : null}

              {!canExport ? (
                <div className="rounded-xl bg-violet-500/10 border border-violet-500/20 px-4 py-3 text-xs text-[var(--text-muted)]">
                  {t("shopify.reservePro")}{" "}
                  <Link href={LIEN_CHANGER_DE_PLAN} className="text-[var(--accent)] font-semibold hover:underline">
                    {t("shopify.passerPro")}
                  </Link>
                </div>
              ) : shopifyConnected === null ? (
                <p className="text-xs text-[var(--text-faint)]">{t("shopify.verification")}</p>
              ) : !shopifyConnected ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-[var(--text-faint)]">
                    {t("shopify.domaineAide")}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={shopifyDomainInput}
                      onChange={(e) => setShopifyDomainInput(e.target.value)}
                      placeholder={t("shopify.domainePlaceholder")}
                      className="flex-1 bg-[var(--bg)] border border-[var(--border-strong)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-faint)] focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
                    />
                    <button
                      type="button"
                      onClick={handleConnectShopify}
                      disabled={!shopifyDomainInput.trim()}
                      className="px-5 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-sm font-semibold hover:from-violet-500 hover:to-blue-500 transition disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {t("shopify.connecter")}
                    </button>
                  </div>
                  {/* Fallback manuel, gardé pour ceux qui ne veulent pas connecter leur boutique */}
                  <p className="text-[11px] text-[var(--text-faint)] mt-1">
                    {t("shopify.manuel")}
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
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{t("shopify.pageHtml")}</p>
                      <p className="text-[11px] text-[var(--text-faint)] mt-1">{t("shopify.pageHtmlAide")}</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePushToShopify("liquid")}
                      disabled={shopifyPushingMode !== null || !savedSiteId}
                      className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-left transition hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{t("shopify.sectionLiquid")}</p>
                      <p className="text-[11px] text-[var(--text-faint)] mt-1">{t("shopify.sectionLiquidAide")}</p>
                    </button>
                  </div>

                  {!savedSiteId && (
                    <p className="text-[11px] text-[var(--warning)]">
                      {t("shopify.attenteSauvegarde")}
                    </p>
                  )}

                  {shopifyPushingMode && (
                    <p className="text-xs text-[var(--text-muted)]">{t("shopify.publication", { mode: shopifyPushingMode })}</p>
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
                          ? t("shopify.etapeManuelle")
                          : t("shopify.publie")}
                      </p>
                      {shopifyPushResult.messageCode && (
                        <p className="text-xs text-[var(--text-muted)]">
                          {t(`shopify.${shopifyPushResult.messageCode}`, { section: shopifyPushResult.sectionType ?? "" })}
                        </p>
                      )}
                      <div className="flex gap-3 mt-1">
                        <a
                          href={shopifyPushResult.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[var(--success)] hover:opacity-80 underline"
                        >
                          {t("shopify.voirPage")}
                        </a>
                        <a
                          href={shopifyPushResult.admin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
                        >
                          {t("shopify.ouvrirAdmin")}
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

function ChargementSiteBuilder() {
  const t = useTranslations("siteBuilder.builder");
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center text-[var(--text-faint)] text-sm">
      {t("chargement")}
    </div>
  );
}

export default function SiteBuilderPage() {
  return (
    <Suspense fallback={<ChargementSiteBuilder />}>
      <SiteBuilderContent />
    </Suspense>
  );
}
