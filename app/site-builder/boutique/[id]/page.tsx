"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { slugify } from "@/lib/slugify";
import ProduitsSuggeres from "@/components/ProduitsSuggeres";
import { NICHES } from "@/lib/niches";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";
import PaletteEditor, { type Palette } from "@/app/components/PaletteEditor";
import { writeBoutiqueDraft, type ProduitBoutiqueDraft } from "@/lib/site-builder-handoff";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import BoutiqueReglages from "@/components/site-builder/BoutiqueReglages";
import BoutiqueShopifyPush from "@/components/site-builder/BoutiqueShopifyPush";
import TriCollectionsIA from "@/components/site-builder/TriCollectionsIA";
import ActionProduitsIA from "@/components/site-builder/ActionProduitsIA";
import { AlerteLimiteProduits, BandeauDepassementProduits, CompteurProduits, limiteProduitsAtteinte } from "@/components/site-builder/LimiteProduitsBoutique";
import { useApiErrorMessage } from "@/lib/use-api-error";
import type { AppLocale } from "@/lib/locale";
import { formatPrix } from "@/lib/boutique-format";

type Boutique = {
  id: string;
  nom: string;
  slug: string;
  description: string | null;
  settings: Record<string, unknown> | null;
  mentions_legales: string | null;
  est_publique: boolean;
  langue: AppLocale;
};

type BoutiqueCategory = {
  id: string;
  nom: string;
  slug: string;
  position: number;
};

type BoutiqueProduct = {
  id: string;
  nom: string;
  slug: string;
  description?: string | null;
  image_urls: string[];
  prix_vente: number;
  prix_original?: number | null;
  category_id?: string | null;
  // prix_avant_ajustement : prix d'avant le dernier ajustement IA (route ajuster-prix).
  meta?: { prix_avant_ajustement?: number } & Record<string, unknown>;
  boutique_categories?: { nom: string; slug: string } | null;
  position: number;
  created_at: string;
  updated_at: string;
};

const DEFAULT_PAGE_SIZE = 20;
// Taille de page du chargement complet (loadAllProduits) — sans rapport avec la liste affichée.
const CHARGEMENT_COMPLET_PAGE_SIZE = 100;

function formatPrice(value: number | null | undefined, langue: AppLocale) {
  return value == null ? "" : formatPrix(value, langue);
}

// Produit de la boutique → format du brouillon Site Builder (ProduitBoutique). Prix en
// chaînes à 2 décimales, affichées telles quelles par la grille ; prix_vente à 0 (défaut en
// base) donne "" — pas de prix ni de paiement sur la carte. Prix barré seulement s'il
// dépasse le prix de vente.
function toProduitBoutique(prod: BoutiqueProduct): ProduitBoutiqueDraft {
  const vente = Number(prod.prix_vente) || 0;
  const original = prod.prix_original == null ? null : Number(prod.prix_original);
  return {
    nom: prod.nom,
    description: prod.description ?? "",
    image: prod.image_urls?.[0] ?? null,
    prixVente: vente > 0 ? vente.toFixed(2) : "",
    prixOriginal: original != null && original > vente ? original.toFixed(2) : "",
    categorieId: prod.category_id ?? null,
  };
}

export default function BoutiqueBuilderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const apiErrorMessage = useApiErrorMessage();
  const t = useTranslations("siteBuilder.boutique.gestion");
  const tNiches = useTranslations("niches");
  const locale = useLocale() as AppLocale;
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  // Compteurs non filtrés renvoyés par GET /api/boutiques/[id] (réglages, limite du plan).
  const [produitsCount, setProduitsCount] = useState(0);
  const [sitesCount, setSitesCount] = useState(0);
  const [langueDisponible, setLangueDisponible] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [products, setProducts] = useState<BoutiqueProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Total réel de produits (indépendant de la pagination) — détermine ce que propose la
  // section "Créer un site" : un seul produit garde le Site Builder mono-page existant,
  // plusieurs déclenchent la préparation de contenu boutique ci-dessous (pas de génération
  // séparée, /boutiques/[slug] est déjà le site multi-page).
  const [totalProduits, setTotalProduits] = useState(0);
  // Revue du contenu généré pour une boutique multi-produits (description + palette) avant
  // application définitive — jamais sauvegardé automatiquement, voir handleGenererContenu /
  // handleConfirmerContenu ci-dessous.
  const [generatingContenu, setGeneratingContenu] = useState(false);
  const [contenuError, setContenuError] = useState<string | null>(null);
  const [reviewDescription, setReviewDescription] = useState<string | null>(null);
  const [reviewPalette, setReviewPalette] = useState<Palette | null>(null);
  const [confirmingContenu, setConfirmingContenu] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>("");

  const [categories, setCategories] = useState<BoutiqueCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [categoryActionId, setCategoryActionId] = useState<string | null>(null);

  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [productFormSuccess, setProductFormSuccess] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [reformulatingNom, setReformulatingNom] = useState(false);
  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productPrixVente, setProductPrixVente] = useState("");
  const [productPrixOriginal, setProductPrixOriginal] = useState("");
  const [productCategoryId, setProductCategoryId] = useState<string>("");
  const [savingProduct, setSavingProduct] = useState(false);
  // Rempli quand le formulaire vient d'un import AliExpress réussi (product-from-url
  // renvoie l'id catalogue) — permet de relier le produit boutique au catalogue via
  // source_produit_id, exploité par les suggestions de produits complémentaires.
  const [importedSourceId, setImportedSourceId] = useState<string | null>(null);
  const [suggestionsRefreshKey, setSuggestionsRefreshKey] = useState(0);

  const [reorderLoading, setReorderLoading] = useState(false);
  const [savingColorMode, setSavingColorMode] = useState(false);
  const [savingNiche, setSavingNiche] = useState(false);

  const [mentionsLegales, setMentionsLegales] = useState("");
  const [savingMentions, setSavingMentions] = useState(false);
  const [mentionsError, setMentionsError] = useState<string | null>(null);
  const [mentionsSuccess, setMentionsSuccess] = useState(false);

  const [bandeauTexte, setBandeauTexte] = useState("");
  const [bandeauVideos, setBandeauVideos] = useState<string[]>([]);
  const [savingBandeau, setSavingBandeau] = useState(false);
  const [bandeauError, setBandeauError] = useState<string | null>(null);
  const [bandeauSuccess, setBandeauSuccess] = useState(false);


  const categoryOptions = useMemo(
    () => [{ id: "", nom: t("aucuneCategorie"), slug: "" }, ...categories],
    [categories, t]
  );

  // Préremplit le Site Builder avec UN même produit : le premier qui a une image ET un prix
  // (prix_vente vaut 0 par défaut en base) — son nom, sa description (repli sur celle de la
  // boutique), son image, son prix et son prix barré, pour que la page générée ne mélange
  // jamais deux produits. Sans produit complet : nom et description de la boutique, sans
  // image ni prix. boutique_id relie ensuite le site généré à cette boutique (sites_generes).
  // overrides : description et palette tout juste enregistrées par handleCreerMonSite — l'état
  // `boutique` n'est pas encore à jour dans ce même clic. La palette part en colorPrimary/
  // colorSecondary/colorAccent, lus par app/site-builder/page.tsx comme palette initiale.
  function buildSiteBuilderPrefillUrl(
    mode: "ia" | "template",
    overrides?: { description?: string | null; palette?: Palette }
  ): string {
    const p = new URLSearchParams();
    p.set("mode", mode);
    if (typeof params?.id === "string") p.set("boutiqueId", params.id);
    // Langue du contenu du site généré : celle de la boutique.
    if (boutique?.langue) p.set("langue", boutique.langue);
    const boutiqueDescription = overrides?.description !== undefined ? overrides.description : boutique?.description;
    const produitVedette = products.find((prod) => prod.image_urls?.[0] && prod.prix_vente > 0);
    if (produitVedette) {
      p.set("name", produitVedette.nom);
      p.set(
        "description",
        produitVedette.description || boutiqueDescription || t("descriptionParDefaut", { nom: boutique?.nom ?? "" })
      );
      p.set("image", produitVedette.image_urls[0]);
      p.set("prixVente", String(produitVedette.prix_vente));
      if (produitVedette.prix_original != null && produitVedette.prix_original > produitVedette.prix_vente) {
        p.set("prixOriginal", String(produitVedette.prix_original));
      }
    } else {
      if (boutique?.nom) p.set("name", boutique.nom);
      p.set("description", boutiqueDescription || t("descriptionParDefaut", { nom: boutique?.nom ?? "" }));
    }
    if (overrides?.palette) {
      p.set("colorPrimary", overrides.palette.primary);
      p.set("colorSecondary", overrides.palette.secondary);
      p.set("colorAccent", overrides.palette.accent);
    }
    return `/site-builder?${p.toString()}`;
  }

  useEffect(() => {
    if (!params?.id) return;
    void fetchBoutique();
    void fetchCategories();
    void fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  // Restriction plan free — export HTML boutique et publication Shopify réservés à
  // Pro/Agency (voir diagnostic "restriction export Site Builder", même règle que
  // app/site-builder/page.tsx). plan démarre à null tant que /api/plan n'a pas répondu.
  const [plan, setPlan] = useState<"free" | "pro" | "agency" | null>(null);
  useEffect(() => {
    fetch("/api/plan")
      .then((res) => res.json())
      .then((json) => setPlan(json.plan ?? "free"))
      .catch(() => setPlan("free"));
  }, []);
  const canExport = plan === "pro" || plan === "agency";
  // plan vaut null tant que /api/plan n'a pas répondu (succès ou erreur, l'erreur donnant
  // "free") — « Créer mon site » attend cette réponse pour ne jamais transmettre au builder
  // la limite Free par défaut à un compte Pro/Agency.
  const planCharge = plan !== null;
  // Limite d'ajout de produits dans le brouillon du builder (null = illimité) — même plan
  // (profils.plan via /api/plan) et même valeur que le plafond serveur de
  // POST /api/boutiques/[id]/produits. Plan pas encore connu : "free", comme le repli ci-dessus.
  const limiteProduitsPlan = PLAN_LIMITS[plan ?? "free"].produitsBoutiqueMax;
  // Ajout bloqué à la limite du plan (ou au-delà après un passage à un plan inférieur) ;
  // l'édition des produits existants reste possible.
  const ajoutBloque = plan !== null && limiteProduitsAtteinte(plan, produitsCount);

  async function fetchBoutique() {
    setGlobalError(null);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}`);
      const json = await response.json();
      if (!response.ok) {
        setGlobalError(apiErrorMessage(json, t("erreurs.chargementBoutique")));
        setBoutique(null);
        return;
      }
      setBoutique(json.boutique ?? null);
      setProduitsCount(json.produitsCount ?? 0);
      setSitesCount(json.sitesCount ?? 0);
      setLangueDisponible(json.langueDisponible !== false);
      setMentionsLegales(json.boutique?.mentions_legales ?? "");
      setBandeauTexte(json.boutique?.settings?.bandeauTexte ?? "");
      setBandeauVideos(json.boutique?.settings?.bandeauVideos ?? []);
    } catch {
      setGlobalError(apiErrorMessage({ code: "network" }));
      setBoutique(null);
    }
  }

  // Recharge seulement les compteurs, sans écraser les champs en cours d'édition.
  async function rafraichirCompteurs() {
    try {
      const response = await fetch(`/api/boutiques/${params?.id}`);
      if (!response.ok) return;
      const json = await response.json();
      setProduitsCount(json.produitsCount ?? 0);
    } catch {
      // compteur indicatif : le serveur reste la référence
    }
  }

  async function handleSaveMentionsLegales() {
    if (!params?.id) return;
    setSavingMentions(true);
    setMentionsError(null);
    setMentionsSuccess(false);
    try {
      const response = await fetch(`/api/boutiques/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mentions_legales: mentionsLegales }),
      });
      const json = await response.json();
      if (!response.ok) {
        setMentionsError(apiErrorMessage(json, t("erreurs.mentions")));
        return;
      }
      setBoutique((prev) => (prev ? { ...prev, mentions_legales: mentionsLegales } : prev));
      setMentionsSuccess(true);
      window.setTimeout(() => setMentionsSuccess(false), 2500);
    } catch {
      setMentionsError(apiErrorMessage({ code: "network" }));
    } finally {
      setSavingMentions(false);
    }
  }

  async function handleSaveBandeau() {
    if (!params?.id || !boutique) return;
    setSavingBandeau(true);
    setBandeauError(null);
    setBandeauSuccess(false);
    const videos = bandeauVideos.map((v) => v.trim()).filter(Boolean);
    const nextSettings = { ...(boutique.settings ?? {}), bandeauTexte, bandeauVideos: videos };
    try {
      const response = await fetch(`/api/boutiques/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const json = await response.json();
      if (!response.ok) {
        setBandeauError(apiErrorMessage(json, t("erreurs.bandeau")));
        return;
      }
      setBoutique({ ...boutique, settings: nextSettings });
      setBandeauSuccess(true);
      window.setTimeout(() => setBandeauSuccess(false), 2500);
    } catch {
      setBandeauError(apiErrorMessage({ code: "network" }));
    } finally {
      setSavingBandeau(false);
    }
  }

  async function handleSetColorMode(colorMode: "light" | "dark") {
    if (!boutique) return;
    const nextSettings = { ...(boutique.settings ?? {}), colorMode };
    setSavingColorMode(true);
    setGlobalError(null);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const json = await response.json();
      if (!response.ok) {
        setGlobalError(apiErrorMessage(json, t("erreurs.theme")));
        return;
      }
      setBoutique({ ...boutique, settings: nextSettings });
    } catch {
      setGlobalError(apiErrorMessage({ code: "network" }));
    } finally {
      setSavingColorMode(false);
    }
  }

  async function handleSetNiche(niche: string) {
    if (!boutique) return;
    const nextSettings = { ...(boutique.settings ?? {}) };
    if (niche) nextSettings.niche = niche;
    else delete nextSettings.niche;
    setSavingNiche(true);
    setGlobalError(null);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: nextSettings }),
      });
      const json = await response.json();
      if (!response.ok) {
        setGlobalError(apiErrorMessage(json, t("erreurs.niche")));
        return;
      }
      setBoutique({ ...boutique, settings: nextSettings });
    } catch {
      setGlobalError(apiErrorMessage({ code: "network" }));
    } finally {
      setSavingNiche(false);
    }
  }

  async function fetchCategories() {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/categories`);
      const json = await response.json();
      if (!response.ok) {
        setCategoriesError(apiErrorMessage(json, t("erreurs.chargementCategories")));
        setCategories([]);
        return;
      }
      setCategories(json.categories ?? []);
    } catch {
      setCategoriesError(apiErrorMessage({ code: "network" }));
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  }

  async function fetchProducts(page: number) {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const paramsList = new URLSearchParams();
      paramsList.set("page", String(page));
      paramsList.set("limit", String(DEFAULT_PAGE_SIZE));
      if (productSearch.trim()) paramsList.set("search", productSearch.trim());
      if (productCategoryFilter) paramsList.set("categoryId", productCategoryFilter);
      const response = await fetch(`/api/boutiques/${params?.id}/produits?${paramsList.toString()}`);
      const json = await response.json();
      if (!response.ok) {
        setProductsError(apiErrorMessage(json, t("erreurs.chargementProduits")));
        setProducts([]);
        setTotalPages(1);
        return;
      }
      setProducts(json.products ?? []);
      setTotalPages(json.totalPages ?? 1);
      setTotalProduits(json.total ?? 0);
      setProductPage(page);
    } catch {
      setProductsError(apiErrorMessage({ code: "network" }));
      setProducts([]);
      setTotalPages(1);
    } finally {
      setProductsLoading(false);
    }
  }

  // Boutique multi-produits : pas de génération d'artefact séparé — la boutique
  // /boutiques/[slug] EST déjà le site multi-page (toujours synchronisée avec les vrais
  // produits, contrairement à un export figé). Le générateur se limite à proposer une
  // description enrichie (si l'actuelle est vide/courte) et une palette de couleurs, que
  // l'utilisateur revoit et ajuste avant application (voir handleConfirmerContenu) — jamais
  // sauvegardé automatiquement.
  async function handleGenererContenu() {
    if (typeof params?.id !== "string") return;
    setGeneratingContenu(true);
    setContenuError(null);
    try {
      const res = await fetch(`/api/boutiques/${params.id}/generer-contenu`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setContenuError(apiErrorMessage(json, t("erreurs.genererContenu")));
        return;
      }
      setReviewDescription(json.description ?? boutique?.description ?? "");
      setReviewPalette(json.palette);
    } catch {
      setContenuError(apiErrorMessage({ code: "network" }));
    } finally {
      setGeneratingContenu(false);
    }
  }

  // Enregistre la description/palette de la boutique (PATCH) et met l'état local à jour —
  // partagé par handleConfirmerContenu et handleCreerMonSite. Renvoie false si le serveur
  // refuse (erreur déjà affichée) ; une erreur réseau remonte à l'appelant.
  async function enregistrerContenuBoutique(description: string | null, palette: Palette): Promise<boolean> {
    if (typeof params?.id !== "string" || !boutique) return false;
    const res = await fetch(`/api/boutiques/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description,
        settings: { ...(boutique.settings ?? {}), palette },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      setContenuError(apiErrorMessage(json, t("erreurs.enregistrerContenu")));
      return false;
    }
    setBoutique((prev) =>
      prev
        ? { ...prev, description, settings: { ...(prev.settings ?? {}), palette } }
        : prev
    );
    return true;
  }

  // Tous les produits de la boutique, page après page — indépendant de la pagination
  // affichée (products/totalPages restent inchangés). Appelé seulement au clic sur
  // « Créer mon site » pour une boutique multi-produits, jamais au chargement. Lève une
  // erreur dès que la liste ne peut pas être complète (page en échec, page incomplète alors
  // qu'il en reste, nombre final différent du total de la 1re page) : jamais de liste partielle.
  async function loadAllProduits(): Promise<{ produits: BoutiqueProduct[]; total: number }> {
    const tous: BoutiqueProduct[] = [];
    let total = 0;
    let page = 1;
    let totalPagesApi = 1;
    do {
      const response = await fetch(`/api/boutiques/${params?.id}/produits?page=${page}&limit=${CHARGEMENT_COMPLET_PAGE_SIZE}`);
      const json = await response.json();
      if (!response.ok) throw new Error(apiErrorMessage(json, t("erreurs.chargementProduits")));
      const recus = (json.products ?? []) as BoutiqueProduct[];
      if (page === 1) total = json.total ?? 0;
      totalPagesApi = json.totalPages ?? 1;
      if (page < totalPagesApi && recus.length < CHARGEMENT_COMPLET_PAGE_SIZE) {
        throw new Error(
          `page ${page} incomplète : ${recus.length} produits reçus sur ${CHARGEMENT_COMPLET_PAGE_SIZE} demandés, alors qu'il reste des pages.`
        );
      }
      tous.push(...recus);
      page += 1;
    } while (page <= totalPagesApi);
    if (tous.length !== total) {
      throw new Error(`${tous.length} reçus sur ${total} attendus.`);
    }
    return { produits: tous, total };
  }

  // « Créer mon site » : enregistre description + palette, puis ouvre le Site Builder en mode
  // IA prérempli avec ces valeurs — sans export HTML, sans ajout à « Mes sites », sans aperçu.
  // Boutique multi-produits (total réel, voir loadAllProduits) : tous les produits partent
  // dans le brouillon sessionStorage (writeBoutiqueDraft) et le builder s'ouvre en mode
  // boutique (multi=1). Un seul produit ou aucun : mode produit unique prérempli, comme avant.
  async function handleCreerMonSite() {
    if (!planCharge) return;
    if (typeof params?.id !== "string" || !reviewPalette || !boutique) return;
    setConfirmingContenu(true);
    setContenuError(null);
    try {
      const description = reviewDescription?.trim() ? reviewDescription : boutique.description;
      const palette = reviewPalette;
      if (!(await enregistrerContenuBoutique(description, palette))) return;
      // Chargement complet AVANT de choisir le mode : totalProduits (liste affichée) devient
      // le total filtré dès qu'une recherche ou une catégorie est active, alors que
      // loadAllProduits n'envoie aucun filtre et renvoie le total réel de la boutique.
      let produits: BoutiqueProduct[];
      let totalReel: number;
      try {
        ({ produits, total: totalReel } = await loadAllProduits());
      } catch (err) {
        console.warn("[boutique] Chargement complet des produits échoué :", err);
        setContenuError(t("erreurs.chargementComplet"));
        return;
      }
      if (totalReel <= 1) {
        router.push(buildSiteBuilderPrefillUrl("ia", { description, palette }));
        return;
      }
      const brouillonEcrit = writeBoutiqueDraft({
        boutiqueId: params.id,
        nomBoutique: boutique.nom,
        descriptionBoutique: description ?? "",
        produits: produits.map(toProduitBoutique),
        totalProduitsBoutique: totalReel,
        limiteProduits: limiteProduitsPlan,
        // Catégories déjà chargées par cette page (fetchCategories) — aucun appel en plus.
        categories: categories.map((c) => ({ id: c.id, nom: c.nom, slug: c.slug })),
        langue: boutique.langue,
      });
      if (!brouillonEcrit) {
        setContenuError(t("erreurs.transmission"));
        return;
      }
      const p = new URLSearchParams();
      p.set("mode", "ia");
      p.set("multi", "1");
      p.set("boutiqueId", params.id);
      p.set("colorPrimary", palette.primary);
      p.set("colorSecondary", palette.secondary);
      p.set("colorAccent", palette.accent);
      router.push(`/site-builder?${p.toString()}`);
    } catch {
      setContenuError(apiErrorMessage({ code: "network" }));
    } finally {
      setConfirmingContenu(false);
    }
  }

  // Applique la description/palette revues par l'utilisateur, puis ouvre l'aperçu
  // propriétaire (getBoutiquePublicUrl) — jamais rendu public automatiquement, la
  // boutique reste régie par est_publique comme partout ailleurs.
  async function handleConfirmerContenu() {
    if (typeof params?.id !== "string" || !reviewPalette || !boutique) return;
    setConfirmingContenu(true);
    setContenuError(null);
    try {
      if (!(await enregistrerContenuBoutique(reviewDescription, reviewPalette))) return;
      setReviewDescription(null);
      setReviewPalette(null);

      // Capture le vrai rendu de la boutique (déjà à jour avec la description/palette
      // qu'on vient d'enregistrer) et le sauvegarde comme un vrai site dans "Mes sites" —
      // via /api/sites-generes (pas un insert à part) pour que sitesParMoisMax soit
      // décompté normalement, puisque c'est cette fois un vrai fichier généré. Un échec
      // ici (export ou quota atteint) n'annule pas la sauvegarde de la boutique déjà
      // réussie — juste un avertissement, pas une erreur bloquante.
      // Plan free : l'export HTML (et donc son ajout à "Mes sites") est réservé à Pro/Agency
      // côté serveur (/api/boutiques/[id]/export-html) — on évite l'appel inutile et on
      // l'explique directement plutôt que de laisser passer un 403 générique.
      if (!canExport) {
        setContenuError(t("erreurs.exportReservePro"));
      } else {
        try {
          const exportRes = await fetch(`/api/boutiques/${params.id}/export-html`, { method: "POST" });
          const exportJson = await exportRes.json();
          if (exportRes.ok) {
            const saveRes = await fetch("/api/sites-generes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                nom_produit: exportJson.nom ?? boutique.nom,
                html_content: exportJson.html,
                boutique_id: params.id,
              }),
            });
            if (!saveRes.ok) {
              const saveJson = await saveRes.json().catch(() => ({}));
              setContenuError(apiErrorMessage(saveJson, t("erreurs.exportSauvegarde")));
            }
          } else {
            setContenuError(apiErrorMessage(exportJson, t("erreurs.exportEchec")));
          }
        } catch {
          setContenuError(t("erreurs.exportReseau"));
        }
      }

      window.open(getBoutiquePublicUrl(boutique.slug), "_blank", "noopener,noreferrer");
    } catch {
      setContenuError(apiErrorMessage({ code: "network" }));
    } finally {
      setConfirmingContenu(false);
    }
  }

  function resetProductForm() {
    setEditingProductId(null);
    setProductName("");
    setProductSlug("");
    setProductDescription("");
    setProductImageUrl("");
    setProductPrixVente("");
    setProductPrixOriginal("");
    setProductCategoryId("");
    setProductFormError(null);
    setProductFormSuccess(null);
    setImportedSourceId(null);
  }

  function populateProductForm(product: BoutiqueProduct) {
    setEditingProductId(product.id);
    setProductName(product.nom);
    setProductSlug(product.slug);
    setProductDescription(product.description ?? "");
    setProductImageUrl(product.image_urls?.[0] ?? "");
    setProductPrixVente(product.prix_vente.toString());
    setProductPrixOriginal(product.prix_original?.toString() ?? "");
    setProductCategoryId(product.category_id ?? "");
    setProductFormError(null);
    setProductFormSuccess(null);
  }

  async function handleImportAliexpress() {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setImportError(null);
    try {
      const response = await fetch("/api/aliexpress/product-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const json = await response.json();
      if (!response.ok) {
        setImportError(apiErrorMessage(json, t("erreurs.importProduit")));
        return;
      }
      setProductName(json.nom ?? "");
      setProductDescription(json.description ?? "");
      setProductImageUrl(json.image ?? "");
      if (typeof json.prix_vente === "number") {
        setProductPrixVente(String(json.prix_vente));
      }
      setProductPrixOriginal("");
      setProductSlug(slugify(json.nom ?? ""));
      setImportedSourceId(json.id ?? null);
      setImportUrl("");
      setProductFormError(null);
    } catch {
      setImportError(apiErrorMessage({ code: "network" }));
    } finally {
      setImportLoading(false);
    }
  }

  async function handleReformulerNom() {
    if (!productName.trim()) return;
    setReformulatingNom(true);
    setProductFormError(null);
    try {
      const response = await fetch("/api/generer-texte-produit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ champ: "nom", titre: productName }),
      });
      const json = await response.json();
      if (!response.ok) {
        setProductFormError(apiErrorMessage(json, t("erreurs.reformuler")));
        return;
      }
      setProductName(json.texte);
    } catch {
      setProductFormError(apiErrorMessage({ code: "network" }));
    } finally {
      setReformulatingNom(false);
    }
  }

  async function handleGenererDescription() {
    if (!productName.trim()) return;
    setGeneratingDescription(true);
    setProductFormError(null);
    try {
      const response = await fetch("/api/generer-texte-produit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ champ: "description", titre: productName }),
      });
      const json = await response.json();
      if (!response.ok) {
        setProductFormError(apiErrorMessage(json, t("erreurs.genererDescription")));
        return;
      }
      setProductDescription(json.texte);
    } catch {
      setProductFormError(apiErrorMessage({ code: "network" }));
    } finally {
      setGeneratingDescription(false);
    }
  }

  async function handleSubmitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProductFormError(null);
    setProductFormSuccess(null);
    if (!productName.trim() || !productSlug.trim() || !productPrixVente.trim()) {
      setProductFormError(t("erreurs.champsRequis"));
      return;
    }

    const prixVente = Number(productPrixVente);
    const prixOriginal = productPrixOriginal.trim() ? Number(productPrixOriginal) : null;
    if (Number.isNaN(prixVente) || prixVente <= 0) {
      setProductFormError(t("erreurs.prixInvalide"));
      return;
    }

    setSavingProduct(true);
    try {
      const payload = {
        nom: productName.trim(),
        slug: slugify(productSlug.trim()),
        description: productDescription.trim(),
        image_urls: productImageUrl.trim() ? [productImageUrl.trim()] : [],
        prix_vente: prixVente,
        prix_original: prixOriginal,
        category_id: productCategoryId || null,
        // Uniquement sur création : relie le produit boutique au catalogue quand il vient
        // d'un import AliExpress réussi, exploité par les suggestions de produits
        // complémentaires (voir components/ProduitsSuggeres.tsx).
        // meta n'est envoyé qu'à la création : il porte aussi l'état de synchronisation Shopify
        // (variant, images, collection poussés), qu'une modification ne doit pas effacer.
        ...(editingProductId ? {} : { source_produit_id: importedSourceId, meta: {} }),
      };

      const url = editingProductId
        ? `/api/boutiques/${params?.id}/produits/${editingProductId}`
        : `/api/boutiques/${params?.id}/produits`;
      const method = editingProductId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) {
        setProductFormError(apiErrorMessage(json, t("erreurs.enregistrerProduit")));
        if (json.code?.startsWith("boutique_product_limit")) void rafraichirCompteurs();
        return;
      }
      setProductFormSuccess(editingProductId ? t("produitMisAJour") : t("produitAjoute"));
      resetProductForm();
      await fetchProducts(1);
      void rafraichirCompteurs();
      setSuggestionsRefreshKey((k) => k + 1);
    } catch {
      setProductFormError(apiErrorMessage({ code: "network" }));
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleDeleteProduct(productId: string) {
    if (deletingProductId) return;
    if (!confirm(t("confirmerSupprimerProduit"))) return;
    setDeletingProductId(productId);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/produits/${productId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        setProductsError(apiErrorMessage(json, t("erreurs.supprimerProduit")));
        return;
      }
      await fetchProducts(productPage);
      void rafraichirCompteurs();
    } catch {
      setProductsError(apiErrorMessage({ code: "network" }));
    } finally {
      setDeletingProductId(null);
    }
  }

  async function handleMoveProduct(product: BoutiqueProduct, direction: -1 | 1) {
    if (reorderLoading) return;
    const currentIndex = products.findIndex((item) => item.id === product.id);
    if (currentIndex === -1) return;
    const swapIndex = currentIndex + direction;
    if (swapIndex < 0 || swapIndex >= products.length) return;
    const swapProduct = products[swapIndex];
    setReorderLoading(true);
    try {
      const updateOne = fetch(`/api/boutiques/${params?.id}/produits/${product.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: swapProduct.position }),
      });
      const updateTwo = fetch(`/api/boutiques/${params?.id}/produits/${swapProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position: product.position }),
      });
      const [resOne, resTwo] = await Promise.all([updateOne, updateTwo]);
      if (!resOne.ok || !resTwo.ok) {
        setProductsError(t("erreurs.reordonner"));
      } else {
        await fetchProducts(productPage);
      }
    } catch {
      setProductsError(apiErrorMessage({ code: "network" }));
    } finally {
      setReorderLoading(false);
    }
  }

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingCategory) return;
    setCategoriesError(null);
    if (!categoryName.trim()) {
      setCategoriesError(t("erreurs.nomCategorieRequis"));
      return;
    }
    const slug = slugify(categorySlug.trim() || categoryName);
    if (!slug) {
      setCategoriesError(t("erreurs.slugCategorieInvalide"));
      return;
    }
    setCreatingCategory(true);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: categoryName.trim(), slug, position: categories.length }),
      });
      const json = await response.json();
      if (!response.ok) {
        setCategoriesError(apiErrorMessage(json, t("erreurs.creerCategorie")));
        return;
      }
      setCategoryName("");
      setCategorySlug("");
      await fetchCategories();
    } catch {
      setCategoriesError(apiErrorMessage({ code: "network" }));
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleRenameCategory(categoryId: string, newName: string) {
    if (!newName.trim() || categoryActionId) return;
    const slug = slugify(newName);
    setCategoryActionId(categoryId);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: newName.trim(), slug }),
      });
      const json = await response.json();
      if (!response.ok) {
        setCategoriesError(apiErrorMessage(json, t("erreurs.renommerCategorie")));
        return;
      }
      setEditingCategoryId(null);
      setEditingCategoryName("");
      await fetchCategories();
    } catch {
      setCategoriesError(apiErrorMessage({ code: "network" }));
    } finally {
      setCategoryActionId(null);
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (categoryActionId) return;
    if (!confirm(t("confirmerSupprimerCategorie"))) return;
    setCategoryActionId(categoryId);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/categories/${categoryId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        setCategoriesError(apiErrorMessage(json, t("erreurs.supprimerCategorie")));
        return;
      }
      if (productCategoryFilter === categoryId) setProductCategoryFilter("");
      await fetchCategories();
    } catch {
      setCategoriesError(apiErrorMessage({ code: "network" }));
    } finally {
      setCategoryActionId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-14 text-[var(--text-primary)]">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-violet-400">{t("surtitre")}</p>
            <h1 className="mt-3 text-3xl font-bold">{t("titre")}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
              {t("intro")}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {boutique ? (
              <a
                href={getBoutiquePublicUrl(boutique.slug)}
                target="_blank"
                rel="noopener noreferrer"
                title={boutique.est_publique ? t("apercuPublique") : t("apercuPrivee")}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
              >
                {t("apercu")}
              </a>
            ) : null}
            <Link
              href="/site-builder/boutique"
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
            >
              {t("retourBoutiques")}
            </Link>
          </div>
        </div>

        {globalError ? (
          <div className="rounded-3xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 p-6 text-sm text-[var(--danger)]">
            {globalError}
          </div>
        ) : null}

        {plan !== null ? <BandeauDepassementProduits plan={plan} count={produitsCount} /> : null}

        <div className="grid gap-6 xl:grid-cols-[0.9fr_0.55fr]">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-violet-400">{t("boutique")}</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{boutique?.nom || t("chargement")}</h2>
              </div>
            </div>

            {boutique ? (
              <BoutiqueReglages
                boutique={boutique}
                produitsCount={produitsCount}
                categoriesCount={categories.length}
                sitesCount={sitesCount}
                langueDisponible={langueDisponible}
                onUpdated={(patch) => setBoutique((prev) => (prev ? { ...prev, ...patch } : prev))}
                onDeleted={() => router.push("/site-builder/boutique")}
              />
            ) : null}

            <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("mentions.titre")}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t("mentions.aide")}
              </p>
              <textarea
                value={mentionsLegales}
                onChange={(e) => setMentionsLegales(e.target.value)}
                rows={5}
                placeholder={t("mentions.placeholder")}
                className="mt-3 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveMentionsLegales}
                  disabled={!boutique || savingMentions}
                  className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                >
                  {savingMentions ? t("enregistrement") : t("enregistrer")}
                </button>
                {mentionsSuccess ? <span className="text-sm text-[var(--success)]">{t("enregistre")}</span> : null}
                {mentionsError ? <span className="text-sm text-[var(--danger)]">{mentionsError}</span> : null}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("bandeau.titre")}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t("bandeau.aide")}
              </p>
              <textarea
                value={bandeauTexte}
                onChange={(e) => setBandeauTexte(e.target.value)}
                rows={2}
                placeholder={t("bandeau.placeholder")}
                className="mt-3 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              <div className="mt-3 space-y-2">
                {bandeauVideos.map((url, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      value={url}
                      onChange={(e) =>
                        setBandeauVideos((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
                      }
                      placeholder={t("bandeau.videoPlaceholder")}
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    />
                    <button
                      type="button"
                      onClick={() => setBandeauVideos((prev) => prev.filter((_, i) => i !== index))}
                      aria-label={t("bandeau.retirerVideo")}
                      className="shrink-0 rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-faint)] transition hover:border-[var(--danger)]/40 hover:text-[var(--danger)]"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setBandeauVideos((prev) => [...prev, ""])}
                  className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] transition hover:border-violet-400/60 hover:text-[var(--text-primary)]"
                >
                  {t("bandeau.ajouterVideo")}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveBandeau}
                  disabled={!boutique || savingBandeau}
                  className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                >
                  {savingBandeau ? t("enregistrement") : t("enregistrer")}
                </button>
                {bandeauSuccess ? <span className="text-sm text-[var(--success)]">{t("enregistre")}</span> : null}
                {bandeauError ? <span className="text-sm text-[var(--danger)]">{bandeauError}</span> : null}
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t("parametres.titre")}</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {t("parametres.modeAide")}
              </p>
              <div className="mt-3 inline-flex rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-1">
                {(["light", "dark"] as const).map((mode) => {
                  const currentMode = (boutique?.settings?.colorMode as string | undefined) ?? "dark";
                  const active = currentMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => handleSetColorMode(mode)}
                      disabled={!boutique || savingColorMode}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition disabled:opacity-50 ${
                        active
                          ? "bg-violet-500 text-white"
                          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {mode === "light" ? t("parametres.clair") : t("parametres.sombre")}
                    </button>
                  );
                })}
              </div>

              <p className="mt-4 text-xs text-[var(--text-muted)]">
                {t("parametres.nicheAide")}
              </p>
              <select
                value={(boutique?.settings?.niche as string | undefined) ?? ""}
                onChange={(event) => handleSetNiche(event.target.value)}
                disabled={!boutique || savingNiche}
                className="mt-3 w-full max-w-xs rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50"
              >
                <option value="">{t("parametres.aucuneNiche")}</option>
                {NICHES.map((n) => (
                  <option key={n.id} value={n.id}>{n.emoji} {tNiches.has(`${n.id}.label`) ? tNiches(`${n.id}.label`) : n.label}</option>
                ))}
              </select>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("stats.produitsAffiches")}</p>
                <p className="mt-2 text-sm text-[var(--text-primary)]">{t("stats.parPage", { count: products.length, max: DEFAULT_PAGE_SIZE })}</p>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">{t("categories.titre")}</p>
                <p className="mt-2 text-sm text-[var(--text-primary)]">{categories.length}</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t("filtres.titre")}</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t("filtres.recherche")}</label>
                <input
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void fetchProducts(1);
                  }}
                  placeholder={t("filtres.recherchePlaceholder")}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">{t("formulaire.categorie")}</label>
                <select
                  value={productCategoryFilter}
                  onChange={(event) => {
                    setProductCategoryFilter(event.target.value);
                    void fetchProducts(1);
                  }}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">{t("filtres.toutesCategories")}</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.nom}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => void fetchProducts(1)}
                className="w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
              >
                {t("filtres.appliquer")}
              </button>
            </div>
          </section>
        </div>

        {/* Créer un site pour cette boutique */}
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-violet-400">Site Builder</p>
          {totalProduits > 1 ? (
            <>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{t("site.preparerTitre")}</h3>
              <p className="mt-1 text-sm text-[var(--text-faint)]">
                {t("site.preparerAide")}
              </p>
              {contenuError && (
                <p className="mt-2 text-sm text-[var(--danger)]">{contenuError}</p>
              )}
              {reviewPalette === null ? (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => void handleGenererContenu()}
                    disabled={generatingContenu}
                    className="rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generatingContenu ? t("site.generation") : t("site.preparer")}
                  </button>
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-[var(--text-muted)]">{t("site.description")}</label>
                    <textarea
                      value={reviewDescription ?? ""}
                      onChange={(e) => setReviewDescription(e.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none"
                    />
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-medium text-[var(--text-muted)]">{t("site.palette")}</p>
                    <PaletteEditor palette={reviewPalette} onChange={setReviewPalette} />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleCreerMonSite()}
                      disabled={!planCharge || confirmingContenu}
                      className="rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {!planCharge ? t("chargement") : confirmingContenu ? t("enregistrement") : t("site.creerMonSite")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReviewDescription(null);
                        setReviewPalette(null);
                      }}
                      disabled={confirmingContenu}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t("annuler")}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{t("site.creerTitre")}</h3>
              <p className="mt-1 text-sm text-[var(--text-faint)]">
                {t("site.creerAide")}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {/* Le lien préremplit le Site Builder (mode produit unique) avec le nom, la description et l'image du premier produit de la boutique. */}
                <Link
                  href={buildSiteBuilderPrefillUrl("ia")}
                  className="rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  {t("site.generationIa")}
                </Link>
                <Link
                  href={buildSiteBuilderPrefillUrl("template")}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
                >
                  {t("site.editeurTemplates")}
                </Link>
              </div>
            </>
          )}
        </section>

        {typeof params?.id === "string" ? <BoutiqueShopifyPush boutiqueId={params.id} canExport={canExport} /> : null}

        {typeof params?.id === "string" && (
          <ProduitsSuggeres
            boutiqueId={params.id}
            refreshKey={suggestionsRefreshKey}
            onAdded={() => {
              void fetchProducts(productPage);
              void rafraichirCompteurs();
              setSuggestionsRefreshKey((k) => k + 1);
            }}
          />
        )}

        <div className="grid gap-6 xl:grid-cols-[0.9fr_0.55fr]">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">{t("produits.titre")}</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">{t("produits.aide")}</p>
                <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                  {t("produits.total", { count: totalProduits })}
                </p>
              </div>
              {plan !== null ? <CompteurProduits plan={plan} count={produitsCount} /> : null}
            </div>

            {params?.id ? (
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
                {(["reecrire-produits", "ajuster-prix"] as const).map((action) => (
                  <ActionProduitsIA
                    key={action}
                    action={action}
                    boutiqueId={String(params.id)}
                    produitsCount={totalProduits}
                    onTermine={() => fetchProducts(productPage)}
                  />
                ))}
              </div>
            ) : null}

            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              {productsLoading ? (
                <p className="text-sm text-[var(--text-muted)]">{t("produits.chargement")}</p>
              ) : productsError ? (
                <p className="text-sm text-[var(--danger)]">{productsError}</p>
              ) : products.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t("produits.vide")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                        <th className="px-4 py-3">{t("produits.colProduit")}</th>
                        <th className="px-4 py-3">{t("formulaire.categorie")}</th>
                        <th className="px-4 py-3">{t("produits.colPrix")}</th>
                        <th className="px-4 py-3">{t("produits.colActions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((product, index) => (
                        <tr key={product.id} className="border-b border-[var(--border)]">
                          <td className="px-4 py-3 align-top">
                            <div className="font-semibold text-[var(--text-primary)]">{product.nom}</div>
                            <div className="text-xs text-[var(--text-faint)]">{product.slug}</div>
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-[var(--text-muted)]">
                            {product.boutique_categories?.nom || t("produits.sansCategorie")}
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-[var(--text-primary)]">
                            {formatPrice(product.prix_vente, locale)}{product.prix_original ? ` · ${formatPrice(product.prix_original, locale)}` : ""}
                            {typeof product.meta?.prix_avant_ajustement === "number" && product.meta.prix_avant_ajustement !== Number(product.prix_vente) ? (
                              <div className="mt-1 text-xs text-[var(--text-faint)]">
                                {t("prix.ancienPrix", { prix: formatPrice(product.meta.prix_avant_ajustement, locale) })}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 align-top space-y-2">
                            <button
                              type="button"
                              onClick={() => populateProductForm(product)}
                              className="w-full rounded-xl bg-violet-500 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-400"
                            >
                              {t("produits.editer")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteProduct(product.id)}
                              disabled={deletingProductId === product.id}
                              className="rounded-xl bg-[var(--danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {deletingProductId === product.id ? "…" : t("supprimer")}
                            </button>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={index === 0 || reorderLoading}
                                onClick={() => void handleMoveProduct(product, -1)}
                                className="rounded-xl bg-[var(--surface-2)] px-2 py-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-3)] disabled:opacity-40"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                disabled={index === products.length - 1 || reorderLoading}
                                onClick={() => void handleMoveProduct(product, 1)}
                                className="rounded-xl bg-[var(--surface-2)] px-2 py-2 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-3)] disabled:opacity-40"
                              >
                                ↓
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--text-muted)]">
              <span>{t("pagination.page", { page: productPage, total: totalPages })}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={productPage <= 1 || productsLoading}
                  onClick={() => void fetchProducts(productPage - 1)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-xs transition hover:border-violet-500/40 disabled:opacity-40"
                >
                  {t("pagination.precedent")}
                </button>
                <button
                  type="button"
                  disabled={productPage >= totalPages || productsLoading}
                  onClick={() => void fetchProducts(productPage + 1)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-xs transition hover:border-violet-500/40 disabled:opacity-40"
                >
                  {t("pagination.suivant")}
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">{t("formulaire.titre")}</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              {t("formulaire.aide")}
            </p>
            {plan !== null ? (
              <div className="mt-4 flex flex-col items-start gap-3">
                <CompteurProduits plan={plan} count={produitsCount} />
                <AlerteLimiteProduits plan={plan} count={produitsCount} />
              </div>
            ) : null}
            <form onSubmit={handleSubmitProduct} className="mt-6 space-y-4">
              <div className="space-y-3 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <label className="text-sm font-medium text-[var(--text-muted)]">{t("formulaire.importer")}</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(event) => setImportUrl(event.target.value)}
                    placeholder="https://www.aliexpress.com/item/123456789.html"
                    className="flex-1 rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                  <button
                    type="button"
                    onClick={handleImportAliexpress}
                    disabled={importLoading || !importUrl.trim()}
                    className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                  >
                    {importLoading ? t("formulaire.importation") : t("formulaire.importerBouton")}
                  </button>
                </div>
                {importError ? <p className="text-xs text-[var(--danger)]">{importError}</p> : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-[var(--text-muted)]">
                  <div className="flex items-center justify-between gap-2">
                    <span>{t("formulaire.nom")}</span>
                    <button
                      type="button"
                      onClick={handleReformulerNom}
                      disabled={!productName.trim() || reformulatingNom}
                      className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                    >
                      {reformulatingNom ? "…" : t("formulaire.reformuler")}
                    </button>
                  </div>
                  <input
                    type="text"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    placeholder={t("formulaire.nomPlaceholder")}
                  />
                </label>
                <label className="block text-sm text-[var(--text-muted)]">
                  {t("formulaire.slug")}
                  <input
                    type="text"
                    value={productSlug}
                    onChange={(event) => setProductSlug(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    placeholder={t("formulaire.slugPlaceholder")}
                  />
                </label>
              </div>

              <label className="block text-sm text-[var(--text-muted)]">
                <div className="flex items-center justify-between gap-2">
                  <span>{t("formulaire.description")}</span>
                  <button
                    type="button"
                    onClick={handleGenererDescription}
                    disabled={!productName.trim() || generatingDescription}
                    className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50"
                    title={!productName.trim() ? t("formulaire.nomDabord") : undefined}
                  >
                    {generatingDescription ? "…" : t("formulaire.genererDescription")}
                  </button>
                </div>
                <textarea
                  value={productDescription}
                  onChange={(event) => setProductDescription(event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none"
                  placeholder={t("formulaire.descriptionPlaceholder")}
                />
              </label>

              <label className="block text-sm text-[var(--text-muted)]">
                {t("formulaire.image")}
                <input
                  type="url"
                  value={productImageUrl}
                  onChange={(event) => setProductImageUrl(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder="https://..."
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-[var(--text-muted)]">
                  {t("formulaire.prixVente")}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productPrixVente}
                    onChange={(event) => setProductPrixVente(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    placeholder="29.99"
                  />
                </label>
                <label className="block text-sm text-[var(--text-muted)]">
                  {t("formulaire.prixOriginal")}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={productPrixOriginal}
                    onChange={(event) => setProductPrixOriginal(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    placeholder="59.99"
                  />
                </label>
              </div>

              <label className="block text-sm text-[var(--text-muted)]">
                {t("formulaire.categorie")}
                <select
                  value={productCategoryId}
                  onChange={(event) => setProductCategoryId(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                >
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>{category.nom}</option>
                  ))}
                </select>
              </label>

              {productFormError ? (
                <p className="text-sm text-[var(--danger)]">{productFormError}</p>
              ) : productFormSuccess ? (
                <p className="text-sm text-[var(--success)]">{productFormSuccess}</p>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={savingProduct || (!editingProductId && ajoutBloque)}
                  className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                >
                  {editingProductId ? t("formulaire.mettreAJour") : t("formulaire.ajouter")}
                </button>
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40"
                >
                  {t("formulaire.reinitialiser")}
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">{t("categories.titre")}</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">{t("categories.aide")}</p>
              </div>
            </div>

            <form onSubmit={handleCreateCategory} className="mt-6 space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <label className="block text-sm text-[var(--text-muted)]">
                {t("categories.nom")}
                <input
                  type="text"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder={t("categories.nomPlaceholder")}
                />
              </label>
              <label className="block text-sm text-[var(--text-muted)]">
                {t("categories.slug")}
                <input
                  type="text"
                  value={categorySlug}
                  onChange={(event) => setCategorySlug(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder="fitness"
                />
              </label>
              <button
                type="submit"
                disabled={creatingCategory}
                className="w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {creatingCategory ? t("categories.creation") : t("categories.creer")}
              </button>
            </form>

            {params?.id ? (
              <TriCollectionsIA
                boutiqueId={String(params.id)}
                categories={categories}
                onTermine={async () => {
                  await Promise.all([fetchCategories(), fetchProducts(1)]);
                }}
              />
            ) : null}

            {categoriesLoading ? (
              <p className="mt-6 text-sm text-[var(--text-muted)]">{t("categories.chargement")}</p>
            ) : categoriesError ? (
              <p className="mt-6 text-sm text-[var(--danger)]">{categoriesError}</p>
            ) : categories.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--text-muted)]">{t("categories.vide")}</p>
            ) : (
              <div className="mt-6 space-y-3">
                {categories.map((category) => (
                  <div key={category.id} className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[var(--text-primary)]">{category.nom}</p>
                        <p className="text-xs text-[var(--text-faint)]">/{category.slug}</p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCategoryId(category.id);
                            setEditingCategoryName(category.nom);
                          }}
                          disabled={categoryActionId === category.id}
                          className="rounded-2xl bg-[var(--surface-3)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-3)] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {t("categories.renommer")}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(category.id)}
                          disabled={categoryActionId === category.id}
                          className="rounded-2xl bg-[var(--danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {categoryActionId === category.id ? "…" : t("supprimer")}
                        </button>
                      </div>
                    </div>
                    {editingCategoryId === category.id ? (
                      <div className="mt-4 space-y-3">
                        <input
                          type="text"
                          value={editingCategoryName}
                          onChange={(event) => setEditingCategoryName(event.target.value)}
                          className="w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void handleRenameCategory(category.id, editingCategoryName)}
                            disabled={categoryActionId === category.id}
                            className="rounded-2xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {categoryActionId === category.id ? t("enregistrement") : t("enregistrer")}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingCategoryId(null); setEditingCategoryName(""); }}
                            disabled={categoryActionId === category.id}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {t("annuler")}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
