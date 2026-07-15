"use client";

import { useState, useMemo } from "react";

type Category = "électronique" | "maison" | "sport" | "beauté" | "cuisine" | "animaux";
type PriceRange = "0-10" | "10-30" | "30-50" | "50+";
type BrandStatus = "sans-marque" | "avec-marque";

interface Product {
  id: number;
  name: string;
  category: Category;
  price: number;
  orders: number;
  rating: number;
  brandStatus: BrandStatus;
  imageId: number;
}

const PRODUCTS: Product[] = [
  // Électronique
  { id: 1, name: "Lampe LED Gaming RGB", category: "électronique", price: 24.99, orders: 18420, rating: 4.7, brandStatus: "sans-marque", imageId: 21 },
  { id: 2, name: "Chargeur sans fil 15W Qi", category: "électronique", price: 12.99, orders: 31050, rating: 4.5, brandStatus: "sans-marque", imageId: 26 },
  { id: 3, name: "Écouteurs TWS intra-auriculaires", category: "électronique", price: 18.50, orders: 24300, rating: 4.3, brandStatus: "sans-marque", imageId: 3 },
  { id: 4, name: "Support magnétique voiture 360°", category: "électronique", price: 8.99, orders: 47800, rating: 4.6, brandStatus: "sans-marque", imageId: 48 },
  { id: 5, name: "Câble USB-C tressé 2m", category: "électronique", price: 6.99, orders: 62100, rating: 4.4, brandStatus: "avec-marque", imageId: 60 },
  { id: 6, name: "Mini ventilateur USB pliable", category: "électronique", price: 9.50, orders: 19800, rating: 4.2, brandStatus: "sans-marque", imageId: 11 },
  // Maison
  { id: 7, name: "Organisateur tiroir en bambou", category: "maison", price: 14.99, orders: 15600, rating: 4.8, brandStatus: "sans-marque", imageId: 15 },
  { id: 8, name: "Diffuseur huiles essentielles 300ml", category: "maison", price: 22.90, orders: 27400, rating: 4.6, brandStatus: "sans-marque", imageId: 42 },
  { id: 9, name: "Filet rangement siège voiture", category: "maison", price: 9.50, orders: 33100, rating: 4.3, brandStatus: "sans-marque", imageId: 17 },
  { id: 10, name: "Veilleuse LED tactile rechargeable", category: "maison", price: 11.50, orders: 41200, rating: 4.5, brandStatus: "sans-marque", imageId: 29 },
  { id: 11, name: "Distributeur savon mural 500ml", category: "maison", price: 16.99, orders: 22800, rating: 4.4, brandStatus: "avec-marque", imageId: 67 },
  // Sport
  { id: 12, name: "Corde à sauter numérique LCD", category: "sport", price: 16.99, orders: 28500, rating: 4.6, brandStatus: "sans-marque", imageId: 35 },
  { id: 13, name: "Bandes élastiques musculation (lot 5)", category: "sport", price: 13.50, orders: 54700, rating: 4.7, brandStatus: "sans-marque", imageId: 40 },
  { id: 14, name: "Bouteille isotherme acier 1L", category: "sport", price: 19.99, orders: 38900, rating: 4.8, brandStatus: "sans-marque", imageId: 50 },
  { id: 15, name: "Tapis de yoga antidérapant 6mm", category: "sport", price: 27.90, orders: 21300, rating: 4.5, brandStatus: "avec-marque", imageId: 54 },
  { id: 16, name: "Gants de musculation grip max", category: "sport", price: 14.99, orders: 17600, rating: 4.4, brandStatus: "sans-marque", imageId: 63 },
  // Beauté
  { id: 17, name: "Rouleau de jade visage anti-âge", category: "beauté", price: 15.50, orders: 36700, rating: 4.6, brandStatus: "sans-marque", imageId: 7 },
  { id: 18, name: "Brosse nettoyante visage électrique", category: "beauté", price: 23.99, orders: 19200, rating: 4.3, brandStatus: "sans-marque", imageId: 9 },
  { id: 19, name: "Peigne lisseur vapeur portable", category: "beauté", price: 31.90, orders: 12800, rating: 4.4, brandStatus: "avec-marque", imageId: 25 },
  { id: 20, name: "Éponge konjac nettoyante (lot 3)", category: "beauté", price: 7.99, orders: 44500, rating: 4.7, brandStatus: "sans-marque", imageId: 34 },
  // Cuisine
  { id: 21, name: "Mandoline coupe-légumes 3-en-1", category: "cuisine", price: 18.99, orders: 29800, rating: 4.5, brandStatus: "sans-marque", imageId: 43 },
  { id: 22, name: "Moule silicone glaçons géant", category: "cuisine", price: 9.99, orders: 51200, rating: 4.6, brandStatus: "sans-marque", imageId: 57 },
  { id: 23, name: "Pince à spaghetti inox", category: "cuisine", price: 6.50, orders: 38400, rating: 4.4, brandStatus: "sans-marque", imageId: 20 },
  { id: 24, name: "Fouet électrique mini rechargeable", category: "cuisine", price: 11.99, orders: 23600, rating: 4.3, brandStatus: "avec-marque", imageId: 30 },
  // Animaux
  { id: 25, name: "Fontaine à eau filtrante chat 2L", category: "animaux", price: 28.90, orders: 16800, rating: 4.7, brandStatus: "sans-marque", imageId: 58 },
  { id: 26, name: "Jouet plume interactif chat", category: "animaux", price: 8.99, orders: 49300, rating: 4.5, brandStatus: "sans-marque", imageId: 68 },
  { id: 27, name: "Gamelle antidérapante chien inox", category: "animaux", price: 12.50, orders: 31700, rating: 4.6, brandStatus: "sans-marque", imageId: 75 },
];

const CATEGORY_LABELS: Record<Category, string> = {
  "électronique": "Électronique",
  "maison": "Maison",
  "sport": "Sport",
  "beauté": "Beauté",
  "cuisine": "Cuisine",
  "animaux": "Animaux",
};

const PRICE_LABELS: Record<PriceRange, string> = {
  "0-10": "0 – 10 €",
  "10-30": "10 – 30 €",
  "30-50": "30 – 50 €",
  "50+": "50 € +",
};

function inPriceRange(price: number, range: PriceRange): boolean {
  if (range === "0-10") return price < 10;
  if (range === "10-30") return price >= 10 && price < 30;
  if (range === "30-50") return price >= 30 && price < 50;
  return price >= 50;
}

function formatOrders(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} viewBox="0 0 20 20" className={`w-3 h-3 ${i < full ? "text-yellow-400" : half && i === full ? "text-yellow-400/60" : "text-zinc-700"}`} fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
      <span className="ml-1 text-xs text-zinc-400">{rating.toFixed(1)}</span>
    </span>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 border ${
        active
          ? "bg-violet-600/20 border-violet-500/50 text-violet-300"
          : "bg-white/[0.03] border-white/8 text-zinc-400 hover:border-white/15 hover:text-zinc-200"
      }`}
    >
      {children}
    </button>
  );
}

function ProductCard({ product }: { product: Product }) {
  const isBrandFree = product.brandStatus === "sans-marque";
  return (
    <div className="group rounded-2xl bg-[#13131f] border border-white/5 overflow-hidden hover:border-violet-500/30 transition-all duration-200 hover:shadow-lg hover:shadow-violet-900/20 flex flex-col">
      {/* Image */}
      <div className="relative overflow-hidden bg-[#0d0d14] h-48">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://picsum.photos/seed/${product.id}/320/200`}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {/* Badge */}
        <span
          className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
            isBrandFree
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
              : "bg-amber-500/15 border-amber-500/30 text-amber-400"
          }`}
        >
          {isBrandFree ? "✅ Sans marque" : "⚠️ Avec marque"}
        </span>
        {/* Category */}
        <span className="absolute top-2 left-2 text-[10px] font-medium px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-sm text-zinc-300 border border-white/10 capitalize">
          {product.category}
        </span>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
          {product.name}
        </h3>

        <div className="flex items-center justify-between">
          <span className="text-lg font-bold bg-gradient-to-r from-violet-300 to-blue-300 bg-clip-text text-transparent">
            {product.price.toFixed(2)} €
          </span>
          <StarRating rating={product.rating} />
        </div>

        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-zinc-600">
            <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
          </svg>
          <span>{formatOrders(product.orders)} commandes AliExpress</span>
        </div>

        <button className="mt-auto w-full py-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white text-xs font-semibold hover:from-violet-500 hover:to-blue-500 transition-all duration-200 shadow-sm shadow-violet-900/30">
          Voir le produit
        </button>
      </div>
    </div>
  );
}

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(new Set());
  const [activePrices, setActivePrices] = useState<Set<PriceRange>>(new Set());
  const [activeStatuses, setActiveStatuses] = useState<Set<BrandStatus>>(new Set());

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const filtered = useMemo(() => {
    return PRODUCTS.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (activeCategories.size > 0 && !activeCategories.has(p.category)) return false;
      if (activePrices.size > 0 && ![...activePrices].some((r) => inPriceRange(p.price, r))) return false;
      if (activeStatuses.size > 0 && !activeStatuses.has(p.brandStatus)) return false;
      return true;
    });
  }, [search, activeCategories, activePrices, activeStatuses]);

  const hasFilters =
    search || activeCategories.size > 0 || activePrices.size > 0 || activeStatuses.size > 0;

  function resetFilters() {
    setSearch("");
    setActiveCategories(new Set());
    setActivePrices(new Set());
    setActiveStatuses(new Set());
  }

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white font-sans px-4 py-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-medium tracking-widest uppercase">
            Dropshipping sans marque
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent mb-2">
                Bibliothèque de produits
              </h1>
              <p className="text-zinc-400 text-base">
                {filtered.length} produit{filtered.length !== 1 ? "s" : ""} trouvé{filtered.length !== 1 ? "s" : ""}
              </p>
            </div>
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
              >
                Réinitialiser les filtres
              </button>
            )}
          </div>
        </div>

        {/* Search + Filters */}
        <div className="rounded-2xl bg-[#13131f] border border-white/5 p-5 mb-8 shadow-xl shadow-black/30 space-y-5">
          {/* Search bar */}
          <div className="relative">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un produit…"
              className="w-full bg-[#0d0d14] border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition"
            />
          </div>

          {/* Filters row */}
          <div className="flex flex-col gap-4">
            {/* Category */}
            <div>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Catégorie
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((cat) => (
                  <FilterPill
                    key={cat}
                    active={activeCategories.has(cat)}
                    onClick={() => setActiveCategories(toggleSet(activeCategories, cat))}
                  >
                    {CATEGORY_LABELS[cat]}
                  </FilterPill>
                ))}
              </div>
            </div>

            {/* Price */}
            <div>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Prix
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(PRICE_LABELS) as PriceRange[]).map((range) => (
                  <FilterPill
                    key={range}
                    active={activePrices.has(range)}
                    onClick={() => setActivePrices(toggleSet(activePrices, range))}
                  >
                    {PRICE_LABELS[range]}
                  </FilterPill>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <p className="text-[11px] font-semibold text-zinc-500 uppercase tracking-widest mb-2">
                Statut
              </p>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  active={activeStatuses.has("sans-marque")}
                  onClick={() => setActiveStatuses(toggleSet(activeStatuses, "sans-marque"))}
                >
                  ✅ Sans marque
                </FilterPill>
                <FilterPill
                  active={activeStatuses.has("avec-marque")}
                  onClick={() => setActiveStatuses(toggleSet(activeStatuses, "avec-marque"))}
                >
                  ⚠️ Avec marque
                </FilterPill>
              </div>
            </div>
          </div>
        </div>

        {/* Grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/8 flex items-center justify-center mb-4">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" className="w-7 h-7 text-zinc-600">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
              </svg>
            </div>
            <p className="text-zinc-400 font-medium mb-1">Aucun produit trouvé</p>
            <p className="text-zinc-600 text-sm">Essayez de modifier vos filtres ou votre recherche</p>
          </div>
        )}
      </div>
    </div>
  );
}
