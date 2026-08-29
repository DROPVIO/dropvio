"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { getBoutiquePublicUrl } from "@/lib/boutique-subdomains";
import { slugify } from "@/lib/slugify";
import ProduitsSuggeres from "@/components/ProduitsSuggeres";
import { BOUTIQUE_PRODUITS_CAP, writeBoutiqueDraft } from "@/lib/site-builder-handoff";

type Boutique = {
  id: string;
  nom: string;
  slug: string;
  description: string | null;
  theme: string | null;
  settings: Record<string, unknown> | null;
  mentions_legales: string | null;
  est_publique: boolean;
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
  stock: number;
  stock_status: string;
  category_id?: string | null;
  boutique_categories?: { nom: string; slug: string } | null;
  position: number;
  created_at: string;
  updated_at: string;
};

const DEFAULT_PAGE_SIZE = 20;

function formatPrice(value: number | null | undefined) {
  return value == null ? "" : `${value.toFixed(2)}€`;
}

export default function BoutiqueBuilderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [boutique, setBoutique] = useState<Boutique | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [products, setProducts] = useState<BoutiqueProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Total réel de produits (indépendant de la pagination) — détermine le mode du Site
  // Builder au clic sur "Créer un site" : un seul produit garde le comportement existant,
  // plusieurs déclenchent le hand-off multi-produits (voir lib/site-builder-handoff.ts).
  const [totalProduits, setTotalProduits] = useState(0);
  const [creatingSite, setCreatingSite] = useState(false);
  const [creatingSiteError, setCreatingSiteError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [productCategoryFilter, setProductCategoryFilter] = useState<string>("");

  const [categories, setCategories] = useState<BoutiqueCategory[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState("");

  const [importUrl, setImportUrl] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const [productFormError, setProductFormError] = useState<string | null>(null);
  const [productFormSuccess, setProductFormSuccess] = useState<string | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productSlug, setProductSlug] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [productPrixVente, setProductPrixVente] = useState("");
  const [productPrixOriginal, setProductPrixOriginal] = useState("");
  const [productStock, setProductStock] = useState("0");
  const [productStockStatus, setProductStockStatus] = useState("in_stock");
  const [productCategoryId, setProductCategoryId] = useState<string>("");
  const [savingProduct, setSavingProduct] = useState(false);
  // Rempli quand le formulaire vient d'un import AliExpress réussi (product-from-url
  // renvoie l'id catalogue) — permet de relier le produit boutique au catalogue via
  // source_produit_id, exploité par les suggestions de produits complémentaires.
  const [importedSourceId, setImportedSourceId] = useState<string | null>(null);
  const [suggestionsRefreshKey, setSuggestionsRefreshKey] = useState(0);

  const [reorderLoading, setReorderLoading] = useState(false);
  const [togglingPublic, setTogglingPublic] = useState(false);

  const [mentionsLegales, setMentionsLegales] = useState("");
  const [savingMentions, setSavingMentions] = useState(false);
  const [mentionsError, setMentionsError] = useState<string | null>(null);
  const [mentionsSuccess, setMentionsSuccess] = useState(false);

  const [shopifyConnected, setShopifyConnected] = useState<boolean | null>(null);
  const [shopifyDomain, setShopifyDomain] = useState<string | null>(null);
  const [shopifyPushing, setShopifyPushing] = useState(false);
  const [shopifyPushError, setShopifyPushError] = useState<string | null>(null);
  const [shopifyPushResult, setShopifyPushResult] = useState<{
    status: "success" | "partial" | "error";
    categories: { id: string; nom: string; status: string; error?: string }[];
    products: { id: string; nom: string; status: string; error?: string }[];
  } | null>(null);

  const categoryOptions = useMemo(
    () => [{ id: "", nom: "Aucune catégorie", slug: "" }, ...categories],
    [categories]
  );

  // Préremplit le Site Builder avec le nom/la description de la boutique — les boutiques
  // n'ayant pas de champ image propre, l'image du premier produit sert de visuel par défaut
  // s'il y en a un. boutique_id relie ensuite le site généré à cette boutique (sites_generes).
  function buildSiteBuilderPrefillUrl(mode: "ia" | "template"): string {
    const p = new URLSearchParams();
    p.set("mode", mode);
    if (typeof params?.id === "string") p.set("boutiqueId", params.id);
    if (boutique?.nom) p.set("name", boutique.nom);
    p.set("description", boutique?.description || `Découvrez les produits de la boutique ${boutique?.nom ?? ""}.`);
    const firstImage = products.find((prod) => prod.image_urls?.[0])?.image_urls?.[0];
    if (firstImage) p.set("image", firstImage);
    return `/site-builder?${p.toString()}`;
  }

  useEffect(() => {
    if (!params?.id) return;
    void fetchBoutique();
    void fetchCategories();
    void fetchProducts(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id]);

  useEffect(() => {
    fetch("/api/shopify/status")
      .then((res) => res.json())
      .then((json) => {
        setShopifyConnected(Boolean(json.connected));
        setShopifyDomain(json.shop_domain ?? null);
      })
      .catch(() => setShopifyConnected(false));
  }, []);

  async function handlePushShopify() {
    if (!params?.id) return;
    setShopifyPushing(true);
    setShopifyPushError(null);
    setShopifyPushResult(null);
    try {
      const response = await fetch(`/api/boutiques/${params.id}/shopify-push`, { method: "POST" });
      const json = await response.json();
      if (!response.ok) {
        setShopifyPushError(json.error || "Impossible de pousser la boutique vers Shopify.");
        return;
      }
      setShopifyPushResult(json);
    } catch {
      setShopifyPushError("Impossible de contacter le serveur.");
    } finally {
      setShopifyPushing(false);
    }
  }

  async function fetchBoutique() {
    setGlobalError(null);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}`);
      const json = await response.json();
      if (!response.ok) {
        setGlobalError(json.error || "Impossible de charger la boutique.");
        setBoutique(null);
        return;
      }
      setBoutique(json.boutique ?? null);
      setMentionsLegales(json.boutique?.mentions_legales ?? "");
    } catch {
      setGlobalError("Impossible de contacter le serveur.");
      setBoutique(null);
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
        setMentionsError(json.error || "Impossible d'enregistrer les mentions légales.");
        return;
      }
      setBoutique((prev) => (prev ? { ...prev, mentions_legales: mentionsLegales } : prev));
      setMentionsSuccess(true);
      window.setTimeout(() => setMentionsSuccess(false), 2500);
    } catch {
      setMentionsError("Impossible de contacter le serveur.");
    } finally {
      setSavingMentions(false);
    }
  }

  async function toggleEstPublique() {
    if (!boutique) return;
    setTogglingPublic(true);
    setGlobalError(null);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ est_publique: !boutique.est_publique }),
      });
      const json = await response.json();
      if (!response.ok) {
        setGlobalError(json.error || "Impossible de changer la visibilité de la boutique.");
        return;
      }
      setBoutique({ ...boutique, est_publique: !boutique.est_publique });
    } catch {
      setGlobalError("Impossible de contacter le serveur.");
    } finally {
      setTogglingPublic(false);
    }
  }

  async function fetchCategories() {
    setCategoriesLoading(true);
    setCategoriesError(null);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/categories`);
      const json = await response.json();
      if (!response.ok) {
        setCategoriesError(json.error || "Impossible de charger les catégories.");
        setCategories([]);
        return;
      }
      setCategories(json.categories ?? []);
    } catch {
      setCategoriesError("Impossible de contacter le serveur.");
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
        setProductsError(json.error || "Impossible de charger les produits.");
        setProducts([]);
        setTotalPages(1);
        return;
      }
      setProducts(json.products ?? []);
      setTotalPages(json.totalPages ?? 1);
      setTotalProduits(json.total ?? 0);
      setProductPage(page);
    } catch {
      setProductsError("Impossible de contacter le serveur.");
      setProducts([]);
      setTotalPages(1);
    } finally {
      setProductsLoading(false);
    }
  }

  // Mode boutique (>1 produit) : récupère jusqu'à BOUTIQUE_PRODUITS_CAP produits en un seul
  // appel (l'API renvoie le total réel indépendamment de ce plafond), les transmet au Site
  // Builder via sessionStorage, puis navigue. Le mode produit unique (<=1 produit) n'est pas
  // modifié : il continue à passer par buildSiteBuilderPrefillUrl ci-dessous.
  async function handleCreerSiteBoutique(mode: "ia" | "template") {
    if (typeof params?.id !== "string") return;
    setCreatingSite(true);
    setCreatingSiteError(null);
    try {
      const res = await fetch(`/api/boutiques/${params.id}/produits?limit=${BOUTIQUE_PRODUITS_CAP}`);
      const json = await res.json();
      if (!res.ok) {
        setCreatingSiteError(json.error ?? "Impossible de charger les produits de la boutique.");
        return;
      }
      const produitsList = (json.products as BoutiqueProduct[] ?? []).map((p) => ({
        nom: p.nom,
        description: p.description ?? "",
        image: p.image_urls?.[0] ?? null,
        prixVente: String(p.prix_vente ?? ""),
        prixOriginal: p.prix_original != null ? String(p.prix_original) : "",
      }));
      writeBoutiqueDraft({
        boutiqueId: params.id,
        nomBoutique: boutique?.nom ?? "",
        descriptionBoutique:
          boutique?.description || `Découvrez les produits de la boutique ${boutique?.nom ?? ""}.`,
        produits: produitsList,
        totalProduitsBoutique: json.total ?? produitsList.length,
      });
      const p = new URLSearchParams();
      p.set("mode", mode);
      p.set("boutiqueId", params.id);
      p.set("multi", "1");
      router.push(`/site-builder?${p.toString()}`);
    } catch {
      setCreatingSiteError("Impossible de contacter le serveur.");
    } finally {
      setCreatingSite(false);
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
    setProductStock("0");
    setProductStockStatus("in_stock");
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
    setProductStock(product.stock.toString());
    setProductStockStatus(product.stock_status);
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
        setImportError(json.error || "Impossible de récupérer le produit.");
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
      setImportError("Impossible de contacter le serveur.");
    } finally {
      setImportLoading(false);
    }
  }

  async function handleSubmitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProductFormError(null);
    setProductFormSuccess(null);
    if (!productName.trim() || !productSlug.trim() || !productPrixVente.trim()) {
      setProductFormError("Nom, slug et prix de vente sont requis.");
      return;
    }

    const prixVente = Number(productPrixVente);
    const prixOriginal = productPrixOriginal.trim() ? Number(productPrixOriginal) : null;
    const stock = Number(productStock) || 0;
    if (Number.isNaN(prixVente) || prixVente <= 0) {
      setProductFormError("Le prix de vente doit être un nombre valide.");
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
        stock,
        stock_status: productStockStatus,
        category_id: productCategoryId || null,
        // Uniquement sur création : relie le produit boutique au catalogue quand il vient
        // d'un import AliExpress réussi, exploité par les suggestions de produits
        // complémentaires (voir components/ProduitsSuggeres.tsx).
        ...(editingProductId ? {} : { source_produit_id: importedSourceId }),
        meta: {},
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
        setProductFormError(json.error || "Impossible d'enregistrer le produit.");
        return;
      }
      setProductFormSuccess(editingProductId ? "Produit mis à jour." : "Produit ajouté avec succès.");
      resetProductForm();
      await fetchProducts(1);
      setSuggestionsRefreshKey((k) => k + 1);
    } catch {
      setProductFormError("Impossible de contacter le serveur.");
    } finally {
      setSavingProduct(false);
    }
  }

  async function handleDeleteProduct(productId: string) {
    if (!confirm("Supprimer ce produit ? Cette action est irréversible.")) return;
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/produits/${productId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        setProductsError(json.error || "Impossible de supprimer le produit.");
        return;
      }
      await fetchProducts(productPage);
    } catch {
      setProductsError("Impossible de contacter le serveur.");
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
        setProductsError("Impossible de réordonner les produits.");
      } else {
        await fetchProducts(productPage);
      }
    } catch {
      setProductsError("Impossible de contacter le serveur.");
    } finally {
      setReorderLoading(false);
    }
  }

  async function handleCreateCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategoriesError(null);
    if (!categoryName.trim()) {
      setCategoriesError("Le nom de catégorie est requis.");
      return;
    }
    const slug = slugify(categorySlug.trim() || categoryName);
    if (!slug) {
      setCategoriesError("Le slug de catégorie est invalide.");
      return;
    }
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: categoryName.trim(), slug, position: categories.length }),
      });
      const json = await response.json();
      if (!response.ok) {
        setCategoriesError(json.error || "Impossible de créer la catégorie.");
        return;
      }
      setCategoryName("");
      setCategorySlug("");
      await fetchCategories();
    } catch {
      setCategoriesError("Impossible de contacter le serveur.");
    }
  }

  async function handleRenameCategory(categoryId: string, newName: string) {
    if (!newName.trim()) return;
    const slug = slugify(newName);
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nom: newName.trim(), slug }),
      });
      const json = await response.json();
      if (!response.ok) {
        setCategoriesError(json.error || "Impossible de renommer la catégorie.");
        return;
      }
      setEditingCategoryId(null);
      setEditingCategoryName("");
      await fetchCategories();
    } catch {
      setCategoriesError("Impossible de contacter le serveur.");
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!confirm("Supprimer cette catégorie ? Les produits resteront sans catégorie.")) return;
    try {
      const response = await fetch(`/api/boutiques/${params?.id}/categories/${categoryId}`, {
        method: "DELETE",
      });
      const json = await response.json();
      if (!response.ok) {
        setCategoriesError(json.error || "Impossible de supprimer la catégorie.");
        return;
      }
      if (productCategoryFilter === categoryId) setProductCategoryFilter("");
      await fetchCategories();
    } catch {
      setCategoriesError("Impossible de contacter le serveur.");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-14 text-[var(--text-primary)]">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-violet-400">Mode Boutique</p>
            <h1 className="mt-3 text-3xl font-bold">Gestion de la boutique</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
              Ajoute des produits, organise des catégories et prépare ta boutique publique.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={toggleEstPublique}
              disabled={!boutique || togglingPublic}
              className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition disabled:opacity-50 ${
                boutique?.est_publique
                  ? "border-emerald-500/40 bg-emerald-500/10 text-[var(--success)] hover:bg-emerald-500/20"
                  : "border-[var(--border)] bg-[var(--surface-2)] text-[var(--text-primary)] hover:border-violet-500/40 hover:bg-violet-500/10"
              }`}
            >
              {togglingPublic
                ? "…"
                : boutique?.est_publique
                ? "🟢 Publique — rendre privée"
                : "⚪ Privée — rendre publique"}
            </button>
            <Link
              href="/site-builder/boutique"
              className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
            >
              Retour aux boutiques
            </Link>
          </div>
        </div>

        {globalError ? (
          <div className="rounded-3xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 p-6 text-sm text-[var(--danger)]">
            {globalError}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.9fr_0.55fr]">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-violet-400">Boutique</p>
                <h2 className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{boutique?.nom || "Chargement..."}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[var(--text-faint)]">
                  {boutique ? (
                    <a
                      href={getBoutiquePublicUrl(boutique.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
                    >
                      Ouvrir la boutique publique ↗
                    </a>
                  ) : (
                    "..."
                  )}
                  {boutique ? (
                    boutique.est_publique ? (
                      <span className="text-[var(--success)]">— accessible à tous</span>
                    ) : (
                      <span className="text-[var(--warning)]">— privée, non accessible tant qu&apos;elle n&apos;est pas publiée</span>
                    )
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Mentions légales</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Affichées sur la page publique /mentions-legales de cette boutique.
              </p>
              <textarea
                value={mentionsLegales}
                onChange={(e) => setMentionsLegales(e.target.value)}
                rows={5}
                placeholder="Raison sociale, adresse, SIRET, hébergeur..."
                className="mt-3 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveMentionsLegales}
                  disabled={!boutique || savingMentions}
                  className="rounded-2xl bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                >
                  {savingMentions ? "Enregistrement..." : "Enregistrer"}
                </button>
                {mentionsSuccess ? <span className="text-sm text-[var(--success)]">Enregistré.</span> : null}
                {mentionsError ? <span className="text-sm text-[var(--danger)]">{mentionsError}</span> : null}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Thème</p>
                <p className="mt-2 text-sm text-[var(--text-primary)]">{boutique?.theme || "Standard"}</p>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Produits affichés</p>
                <p className="mt-2 text-sm text-[var(--text-primary)]">{products.length} / {DEFAULT_PAGE_SIZE} par page</p>
              </div>
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">Catégories</p>
                <p className="mt-2 text-sm text-[var(--text-primary)]">{categories.length}</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">Filtrer les produits</h3>
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-sm text-[var(--text-muted)]">Recherche</label>
                <input
                  type="search"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void fetchProducts(1);
                  }}
                  placeholder="Rechercher par nom ou description"
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                />
              </div>
              <div>
                <label className="text-sm text-[var(--text-muted)]">Catégorie</label>
                <select
                  value={productCategoryFilter}
                  onChange={(event) => {
                    setProductCategoryFilter(event.target.value);
                    void fetchProducts(1);
                  }}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                >
                  <option value="">Toutes les catégories</option>
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
                Appliquer
              </button>
            </div>
          </section>
        </div>

        {/* Créer un site pour cette boutique */}
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <p className="text-xs uppercase tracking-[0.3em] text-violet-400">Site Builder</p>
          <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Créer un site pour cette boutique</h3>
          {totalProduits > 1 ? (
            <p className="mt-1 text-sm text-[var(--text-faint)]">
              Cette boutique a {totalProduits} produits — génère un site multi-produits (jusqu&apos;à{" "}
              {BOUTIQUE_PRODUITS_CAP} importés) avec l&apos;IA ou l&apos;éditeur de templates.
            </p>
          ) : (
            <p className="mt-1 text-sm text-[var(--text-faint)]">
              Génère une landing page prérempli avec le nom et la description de la boutique — au choix, avec l&apos;IA ou l&apos;éditeur de templates.
            </p>
          )}
          {creatingSiteError && (
            <p className="mt-2 text-sm text-[var(--danger)]">{creatingSiteError}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            {totalProduits > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleCreerSiteBoutique("ia")}
                  disabled={creatingSite}
                  className="rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingSite ? "Préparation…" : "🤖 Génération IA"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreerSiteBoutique("template")}
                  disabled={creatingSite}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creatingSite ? "Préparation…" : "🎨 Éditeur de templates"}
                </button>
              </>
            ) : (
              <>
                <Link
                  href={buildSiteBuilderPrefillUrl("ia")}
                  className="rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-blue-500"
                >
                  🤖 Génération IA
                </Link>
                <Link
                  href={buildSiteBuilderPrefillUrl("template")}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40 hover:bg-violet-500/10"
                >
                  🎨 Éditeur de templates
                </Link>
              </>
            )}
          </div>
        </section>

        {/* Push Shopify */}
        <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-violet-400">Shopify</p>
              <h3 className="mt-2 text-lg font-semibold text-[var(--text-primary)]">Pousser vers Shopify</h3>
              <p className="mt-1 text-sm text-[var(--text-faint)]">
                {shopifyConnected === null
                  ? "Vérification de la connexion…"
                  : shopifyConnected
                  ? `Envoie les produits et catégories de cette boutique vers ${shopifyDomain}.`
                  : "Connecte ta boutique Shopify dans les paramètres pour activer cette action."}
              </p>
            </div>
            <button
              type="button"
              onClick={handlePushShopify}
              disabled={!shopifyConnected || shopifyPushing}
              className="shrink-0 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:from-violet-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {shopifyPushing ? "Envoi en cours…" : "Pousser produits & collections"}
            </button>
          </div>

          {shopifyPushError && (
            <div className="mt-4 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
              {shopifyPushError}
            </div>
          )}

          {shopifyPushResult && (
            <div className="mt-4 flex flex-col gap-3">
              <div
                className={`rounded-xl border px-4 py-3 text-sm ${
                  shopifyPushResult.status === "success"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-[var(--success)]"
                    : shopifyPushResult.status === "partial"
                    ? "border-amber-500/20 bg-amber-500/10 text-[var(--warning)]"
                    : "border-[var(--danger)]/20 bg-[var(--danger)]/10 text-[var(--danger)]"
                }`}
              >
                {shopifyPushResult.status === "success"
                  ? "Tout a été poussé avec succès sur Shopify."
                  : shopifyPushResult.status === "partial"
                  ? "Push terminé avec quelques erreurs — voir le détail ci-dessous."
                  : "Le push a échoué."}
              </div>
              {[...shopifyPushResult.categories, ...shopifyPushResult.products]
                .filter((item) => item.status === "error")
                .map((item) => (
                  <div key={item.id} className="rounded-lg border border-[var(--danger)]/10 bg-[var(--danger)]/[0.04] px-3 py-2 text-xs text-[var(--danger)]">
                    <span className="font-semibold">{item.nom}</span> : {item.error}
                  </div>
                ))}
            </div>
          )}
        </section>

        {typeof params?.id === "string" && (
          <ProduitsSuggeres
            boutiqueId={params.id}
            refreshKey={suggestionsRefreshKey}
            onAdded={() => {
              void fetchProducts(productPage);
              setSuggestionsRefreshKey((k) => k + 1);
            }}
          />
        )}

        <div className="grid gap-6 xl:grid-cols-[0.9fr_0.55fr]">
          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">Produits</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">Liste des produits et gestion rapide.</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-[var(--text-faint)]">
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">Max Free: 10</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">Max Pro/Agency: 200</span>
              </div>
            </div>

            <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              {productsLoading ? (
                <p className="text-sm text-[var(--text-muted)]">Chargement des produits...</p>
              ) : productsError ? (
                <p className="text-sm text-[var(--danger)]">{productsError}</p>
              ) : products.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">Aucun produit trouvé pour le moment.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[var(--text-muted)]">
                        <th className="px-4 py-3">Produit</th>
                        <th className="px-4 py-3">Catégorie</th>
                        <th className="px-4 py-3">Prix</th>
                        <th className="px-4 py-3">Stock</th>
                        <th className="px-4 py-3">Actions</th>
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
                            {product.boutique_categories?.nom || "Aucune"}
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-[var(--text-primary)]">
                            {formatPrice(product.prix_vente)}{product.prix_original ? ` · ${formatPrice(product.prix_original)}` : ""}
                          </td>
                          <td className="px-4 py-3 align-top text-sm text-[var(--text-muted)]">
                            {product.stock} / {product.stock_status === "in_stock" ? "En stock" : "Rupture"}
                          </td>
                          <td className="px-4 py-3 align-top space-y-2">
                            <button
                              type="button"
                              onClick={() => populateProductForm(product)}
                              className="rounded-xl bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-3)]"
                            >
                              Éditer
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteProduct(product.id)}
                              className="rounded-xl bg-[var(--danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20"
                            >
                              Supprimer
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
              <span>Page {productPage} / {totalPages}</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={productPage <= 1 || productsLoading}
                  onClick={() => void fetchProducts(productPage - 1)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-xs transition hover:border-violet-500/40 disabled:opacity-40"
                >
                  Précédent
                </button>
                <button
                  type="button"
                  disabled={productPage >= totalPages || productsLoading}
                  onClick={() => void fetchProducts(productPage + 1)}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-xs transition hover:border-violet-500/40 disabled:opacity-40"
                >
                  Suivant
                </button>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">Ajouter / éditer un produit</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Utilise l&apos;import AliExpress ou remplis le formulaire manuellement.
            </p>
            <form onSubmit={handleSubmitProduct} className="mt-6 space-y-4">
              <div className="space-y-3 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <label className="text-sm font-medium text-[var(--text-muted)]">Importer depuis AliExpress</label>
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
                    {importLoading ? "Importation..." : "Importer"}
                  </button>
                </div>
                {importError ? <p className="text-xs text-[var(--danger)]">{importError}</p> : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-[var(--text-muted)]">
                  Nom du produit
                  <input
                    type="text"
                    value={productName}
                    onChange={(event) => setProductName(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    placeholder="Titre du produit"
                  />
                </label>
                <label className="block text-sm text-[var(--text-muted)]">
                  Slug du produit
                  <input
                    type="text"
                    value={productSlug}
                    onChange={(event) => setProductSlug(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                    placeholder="nom-du-produit"
                  />
                </label>
              </div>

              <label className="block text-sm text-[var(--text-muted)]">
                Description
                <textarea
                  value={productDescription}
                  onChange={(event) => setProductDescription(event.target.value)}
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none"
                  placeholder="Description du produit"
                />
              </label>

              <label className="block text-sm text-[var(--text-muted)]">
                Image principale (URL)
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
                  Prix de vente
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
                  Prix original
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

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-[var(--text-muted)]">
                  Stock
                  <input
                    type="number"
                    min="0"
                    value={productStock}
                    onChange={(event) => setProductStock(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  />
                </label>
                <label className="block text-sm text-[var(--text-muted)]">
                  Statut de stock
                  <select
                    value={productStockStatus}
                    onChange={(event) => setProductStockStatus(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="in_stock">En stock</option>
                    <option value="out_of_stock">Rupture</option>
                  </select>
                </label>
              </div>

              <label className="block text-sm text-[var(--text-muted)]">
                Catégorie
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
                  disabled={savingProduct}
                  className="rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400 disabled:opacity-50"
                >
                  {editingProductId ? "Mettre à jour" : "Ajouter le produit"}
                </button>
                <button
                  type="button"
                  onClick={resetProductForm}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40"
                >
                  Réinitialiser
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-[var(--text-primary)]">Catégories</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">Crée, renomme ou supprime des catégories.</p>
              </div>
            </div>

            <form onSubmit={handleCreateCategory} className="mt-6 space-y-4 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <label className="block text-sm text-[var(--text-muted)]">
                Nom de la catégorie
                <input
                  type="text"
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
                  placeholder="Ex: Fitness"
                />
              </label>
              <label className="block text-sm text-[var(--text-muted)]">
                Slug de la catégorie
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
                className="w-full rounded-2xl bg-violet-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-400"
              >
                Créer la catégorie
              </button>
            </form>

            {categoriesLoading ? (
              <p className="mt-6 text-sm text-[var(--text-muted)]">Chargement des catégories...</p>
            ) : categoriesError ? (
              <p className="mt-6 text-sm text-[var(--danger)]">{categoriesError}</p>
            ) : categories.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--text-muted)]">Aucune catégorie créée.</p>
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
                          className="rounded-2xl bg-[var(--surface-3)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-3)]"
                        >
                          Renommer
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteCategory(category.id)}
                          className="rounded-2xl bg-[var(--danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--danger)] transition hover:bg-[var(--danger)]/20"
                        >
                          Supprimer
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
                            className="rounded-2xl bg-violet-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-400"
                          >
                            Enregistrer
                          </button>
                          <button
                            type="button"
                            onClick={() => { setEditingCategoryId(null); setEditingCategoryName(""); }}
                            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] transition hover:border-violet-500/40"
                          >
                            Annuler
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
