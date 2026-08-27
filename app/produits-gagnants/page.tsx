"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { slugify } from "@/lib/slugify";
import ProduitsSuggeres from "@/components/ProduitsSuggeres";
// Simplifie un titre produit AliExpress (souvent long et bruité) en mot-clé exploitable sur Google Trends
function simplifierMotCle(nom: string): string {
  const mots = nom
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  return mots.slice(0, 4).join(" ");
}

const NICHES = [
  { id: "all", label: "Voir tout", emoji: "🗂️", desc: "Toutes les niches confondues" },
  { id: "fitness", label: "Fitness", emoji: "💪", desc: "Sport & musculation" },
  { id: "beaute", label: "Beauté", emoji: "💄", desc: "Soins & maquillage" },
  { id: "animaux", label: "Animaux", emoji: "🐾", desc: "Accessoires pets" },
  { id: "gaming", label: "Gaming", emoji: "🎮", desc: "Jeux & accessoires" },
  { id: "bureau", label: "Home Office", emoji: "🖥️", desc: "Bureau & setup" },
  { id: "cuisine", label: "Cuisine", emoji: "🍳", desc: "Ustensiles & gadgets" },
  { id: "bebe", label: "Bébé", emoji: "👶", desc: "Puériculture" },
  { id: "voiture", label: "Voiture", emoji: "🚗", desc: "Auto & moto" },
  { id: "jardin", label: "Jardinage", emoji: "🌱", desc: "Plantes & outils" },
  { id: "yoga", label: "Bien-être", emoji: "🧘", desc: "Yoga & méditation" },
  { id: "tech", label: "Tech", emoji: "📱", desc: "Gadgets & électronique" },
  { id: "led", label: "LED & Déco", emoji: "💡", desc: "Lumières & ambiance" },
  { id: "outdoor", label: "Outdoor", emoji: "🏕️", desc: "Camping & randonnée" },
  { id: "mode", label: "Mode", emoji: "👗", desc: "Accessoires & bijoux" },
  { id: "maison", label: "Maison", emoji: "🏠", desc: "Déco intérieure" },
  { id: "voyage", label: "Voyage", emoji: "✈️", desc: "Bagages & accessoires" },
  { id: "sport", label: "Sport", emoji: "⚽", desc: "Équipements sportifs" },
  { id: "ecologie", label: "Écologie", emoji: "♻️", desc: "Produits durables" },
  { id: "photo", label: "Photo", emoji: "📸", desc: "Accessoires photo/vidéo" },
  { id: "selfcare", label: "Self-care", emoji: "🛁", desc: "Bien-être personnel" },
];

type Produit = {
  id: string;
  nom: string;
  image: string;
  prixFournisseur: number;
  prixVente: number;
  prixOriginal?: number;
  marge: number;
  commandes: number;
  note: number | null;
  commission: string;
  lienAliExpress: string;
  niche: string;
};

// Plage par défaut du "sweet spot" : ni invendable (trop peu de commandes), ni déjà saturé
const SWEET_SPOT_DEFAUT = { min: 500, max: 5000 };

export default function ProduitsGagnants() {
  const [nicheActive, setNicheActive] = useState<string>("all");
  const [tiroirOpen, setTiroirOpen] = useState(false);
  const [filtresPrix, setFiltresPrix] = useState<string>("tous");
  const [filtreMarge, setFiltreMarge] = useState<number>(0);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Bloc 1 — filtres avancés
  const [commandesMin, setCommandesMin] = useState<string>("");
  const [noteMin, setNoteMin] = useState<number>(0);
  const [sweetSpotActif, setSweetSpotActif] = useState(false);
  const [sweetMin, setSweetMin] = useState<number>(SWEET_SPOT_DEFAUT.min);
  const [sweetMax, setSweetMax] = useState<number>(SWEET_SPOT_DEFAUT.max);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalProduits, setTotalProduits] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const resultatsRef = useRef<HTMLDivElement>(null);

  const chargerProduits = useCallback(async () => {
    setLoading(true);
    setErreur(null);

    try {
      const params = new URLSearchParams();
      if (nicheActive !== "all") params.set("niche", nicheActive);
      if (filtresPrix === "0-20") params.set("priceMax", "20");
      else if (filtresPrix === "20-50") { params.set("priceMin", "20"); params.set("priceMax", "50"); }
      else if (filtresPrix === "50+") params.set("priceMin", "50");

      const baseMin = parseInt(commandesMin) || 0;
      const effectiveMin = sweetSpotActif ? Math.max(baseMin, sweetMin) : baseMin;
      if (effectiveMin > 0) params.set("commandesMin", String(effectiveMin));
      if (sweetSpotActif) params.set("commandesMax", String(sweetMax));
      if (noteMin > 0) params.set("noteMin", String(noteMin));
      if (filtreMarge > 0) params.set("margeMin", String(filtreMarge));
      params.set("page", String(page));

      const url = `/api/aliexpress/products?${params.toString()}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        setErreur(data.error);
        setProduits([]);
        setTotalProduits(0);
        setTotalPages(1);
      } else {
        setProduits(data.products || []);
        setTotalProduits(data.total ?? 0);
        setTotalPages(data.totalPages ?? 1);
      }
    } catch {
      setErreur("Impossible de charger les produits. Vérifie ta connexion.");
    } finally {
      setLoading(false);
    }
  }, [nicheActive, filtresPrix, filtreMarge, commandesMin, noteMin, sweetSpotActif, sweetMin, sweetMax, page]);

  useEffect(() => {
    // Défère l'appel (donc ses setState internes) hors du corps synchrone de
    // l'effet — évite le rendu en cascade tout en gardant le déclenchement
    // immédiat au changement de dépendances.
    void Promise.resolve().then(() => chargerProduits());
  }, [chargerProduits]);

  function allerPage(nouvellePage: number) {
    setPage(nouvellePage);
    resultatsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Bloc 2 — score de croissance basé sur l'historique des snapshots quotidiens
  const [croissance, setCroissance] = useState<Record<string, number>>({});

  useEffect(() => {
    if (produits.length === 0) return;

    let annule = false;
    const supabase = createSupabaseBrowserClient();

    supabase
      .from("snapshots_produits")
      .select("product_id, volume_commandes, date")
      .in("product_id", produits.map((p) => p.id))
      .order("date", { ascending: true })
      .then(({ data, error }) => {
        if (annule || error || !data) return;

        const parProduit: Record<string, { volume_commandes: number; date: string }[]> = {};
        for (const row of data) {
          (parProduit[row.product_id] ??= []).push(row);
        }

        const resultat: Record<string, number> = {};
        for (const [id, points] of Object.entries(parProduit)) {
          if (points.length < 2) continue;
          const premier = points[0].volume_commandes;
          const dernier = points[points.length - 1].volume_commandes;
          if (!premier) continue;
          resultat[id] = ((dernier - premier) / premier) * 100;
        }
        setCroissance(resultat);
      });

    return () => { annule = true; };
  }, [produits]);

  const nicheSelectionnee = NICHES.find(n => n.id === nicheActive);

  // Bloc 3 — Google Trends
  const [trendsProduit, setTrendsProduit] = useState<Produit | null>(null);

  // Bloc 4 — Ajouter à une boutique
  const [ajouterBoutiqueProduit, setAjouterBoutiqueProduit] = useState<Produit | null>(null);

  // Bloc 5 — Alternatives fiables
  const [alternativesProduit, setAlternativesProduit] = useState<Produit | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f1f1f1", fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "#111", borderBottom: "1px solid #1f1f1f", padding: "24px 32px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#fff" }}>
              🏆 Produits Gagnants
            </h1>
            <p style={{ color: "#666", margin: "6px 0 0", fontSize: 14 }}>
              Les meilleurs produits AliExpress pour le dropshipping — sélectionnés par marge, avis et potentiel.
            </p>
          </div>
          {!loading && (
            <div style={{ background: "#6366f122", border: "1px solid #6366f144", borderRadius: 10, padding: "8px 16px", textAlign: "center", minWidth: 80 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#6366f1" }}>{produits.length}</div>
              <div style={{ fontSize: 11, color: "#888" }}>produits chargés</div>
            </div>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 24px" }}>

        {/* Bouton choisir niche */}
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={() => setTiroirOpen(!tiroirOpen)}
            style={{
              background: tiroirOpen ? "#6366f1" : "#1a1a1a",
              border: `1px solid ${tiroirOpen ? "#6366f1" : "#2e2e2e"}`,
              color: "#fff",
              padding: "14px 24px",
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 10,
              transition: "all 0.2s",
            }}
          >
            <span>🎯</span>
            {nicheSelectionnee ? `Niche : ${nicheSelectionnee.emoji} ${nicheSelectionnee.label}` : "Choisir une niche"}
            <span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.7 }}>{tiroirOpen ? "▲" : "▼"}</span>
          </button>

          {/* Tiroir niches */}
          {tiroirOpen && (
            <div style={{
              marginTop: 8,
              background: "#1a1a1a",
              border: "1px solid #2a2a2a",
              borderRadius: 16,
              padding: 24,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 10,
            }}>
              {NICHES.map(niche => (
                <button
                  key={niche.id}
                  onClick={() => { setNicheActive(niche.id); setTiroirOpen(false); setPage(1); }}
                  style={{
                    background: nicheActive === niche.id ? "#6366f1" : "#111",
                    border: `1px solid ${nicheActive === niche.id ? "#6366f1" : "#2e2e2e"}`,
                    color: "#fff",
                    padding: "12px 16px",
                    borderRadius: 10,
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "all 0.15s",
                  }}
                >
                  <div style={{ fontSize: 18, marginBottom: 4 }}>{niche.emoji}</div>
                  <div style={{ fontWeight: 600 }}>{niche.label}</div>
                  <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{niche.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Filtres */}
        <div style={{ display: "flex", gap: 12, marginBottom: 28, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#666" }}>Filtres :</span>

          {[
            { label: "Tous les prix", val: "tous" },
            { label: "0–20€", val: "0-20" },
            { label: "20–50€", val: "20-50" },
            { label: "50€+", val: "50+" },
          ].map(f => (
            <button
              key={f.val}
              onClick={() => { setFiltresPrix(f.val); setPage(1); }}
              style={{
                background: filtresPrix === f.val ? "#6366f1" : "#1a1a1a",
                border: `1px solid ${filtresPrix === f.val ? "#6366f1" : "#2e2e2e"}`,
                color: "#fff",
                padding: "7px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}

          {[
            { label: "Toute marge", val: 0 },
            { label: "Marge 50%+", val: 50 },
            { label: "Marge 70%+", val: 70 },
          ].map(f => (
            <button
              key={f.val}
              onClick={() => { setFiltreMarge(f.val); setPage(1); }}
              style={{
                background: filtreMarge === f.val ? "#22c55e" : "#1a1a1a",
                border: `1px solid ${filtreMarge === f.val ? "#22c55e" : "#2e2e2e"}`,
                color: "#fff",
                padding: "7px 14px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Filtres avancés */}
        <div style={{
          background: "#1a1a1a",
          border: "1px solid #2a2a2a",
          borderRadius: 14,
          padding: 20,
          marginBottom: 28,
          display: "grid",
          gap: 18,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Filtres avancés
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {/* Commandes minimum */}
            <div>
              <label style={{ display: "block", fontSize: 12.5, color: "#aaa", marginBottom: 8 }}>
                Volume de commandes minimum
              </label>
              <input
                type="number"
                min={0}
                placeholder="ex: 200"
                value={commandesMin}
                onChange={(e) => { setCommandesMin(e.target.value); setPage(1); }}
                style={{
                  width: "100%",
                  background: "#111",
                  border: "1px solid #2e2e2e",
                  borderRadius: 8,
                  padding: "9px 12px",
                  color: "#f1f1f1",
                  fontSize: 13.5,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Note minimum */}
            <div>
              <label style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#aaa", marginBottom: 8 }}>
                <span>Note minimum</span>
                <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                  {noteMin > 0 ? `⭐ ${noteMin.toFixed(1)}+` : "Toutes"}
                </span>
              </label>
              <input
                type="range"
                min={0}
                max={5}
                step={0.5}
                value={noteMin}
                onChange={(e) => { setNoteMin(parseFloat(e.target.value)); setPage(1); }}
                style={{ width: "100%", accentColor: "#fbbf24" }}
              />
            </div>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center" }}>
            {/* Sweet spot */}
            <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#ccc", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={sweetSpotActif}
                onChange={(e) => { setSweetSpotActif(e.target.checked); setPage(1); }}
                style={{ width: 16, height: 16, accentColor: "#22c55e" }}
              />
              🎯 Sweet spot saturation
            </label>
          </div>

          {sweetSpotActif && (
            <div style={{
              background: "#111",
              borderRadius: 10,
              padding: 16,
              border: "1px solid #22c55e33",
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 12, color: "#666" }}>
                Ni invendable, ni déjà saturé — commandes entre :
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="number"
                  min={0}
                  value={sweetMin}
                  onChange={(e) => { setSweetMin(parseInt(e.target.value) || 0); setPage(1); }}
                  style={{
                    width: 90, background: "#0a0a0a", border: "1px solid #2e2e2e", borderRadius: 7,
                    padding: "7px 10px", color: "#f1f1f1", fontSize: 13, outline: "none",
                  }}
                />
                <span style={{ color: "#555", fontSize: 12 }}>et</span>
                <input
                  type="number"
                  min={0}
                  value={sweetMax}
                  onChange={(e) => { setSweetMax(parseInt(e.target.value) || 0); setPage(1); }}
                  style={{
                    width: 90, background: "#0a0a0a", border: "1px solid #2e2e2e", borderRadius: 7,
                    padding: "7px 10px", color: "#f1f1f1", fontSize: 13, outline: "none",
                  }}
                />
                <span style={{ color: "#555", fontSize: 12 }}>commandes</span>
              </div>
              <button
                onClick={() => { setSweetMin(SWEET_SPOT_DEFAUT.min); setSweetMax(SWEET_SPOT_DEFAUT.max); setPage(1); }}
                style={{
                  marginLeft: "auto", background: "transparent", border: "1px solid #333",
                  color: "#888", padding: "6px 12px", borderRadius: 7, fontSize: 11.5, cursor: "pointer",
                }}
              >
                Réinitialiser (500–5000)
              </button>
            </div>
          )}
        </div>

        {/* Résultats */}
        <div ref={resultatsRef}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 80 }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⏳</div>
            <div style={{ color: "#666", fontSize: 15 }}>Chargement des produits AliExpress...</div>
          </div>
        ) : erreur ? (
          <div style={{
            background: "#1f1010",
            border: "1px solid #ef444433",
            borderRadius: 12,
            padding: 32,
            textAlign: "center",
            color: "#fca5a5",
          }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⚠️</div>
            <div style={{ fontSize: 14 }}>{erreur}</div>
            <button
              onClick={chargerProduits}
              style={{
                marginTop: 16,
                background: "#6366f1",
                color: "#fff",
                border: "none",
                padding: "10px 20px",
                borderRadius: 8,
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Réessayer
            </button>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>
              {totalProduits} produit{totalProduits > 1 ? "s" : ""} trouvé{totalProduits > 1 ? "s" : ""}
              {nicheSelectionnee && nicheActive !== "all" && ` dans ${nicheSelectionnee.emoji} ${nicheSelectionnee.label}`}
              {totalPages > 1 && ` · page ${page} sur ${totalPages}`}
            </div>

            {produits.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#444", fontSize: 15 }}>
                Aucun produit pour ces filtres. Essaie de les élargir.
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                  {produits.map(p => (
                    <CarteProduit
                      key={p.id}
                      produit={p}
                      croissancePct={croissance[p.id]}
                      onVoirTendance={() => setTrendsProduit(p)}
                      onAjouterBoutique={() => setAjouterBoutiqueProduit(p)}
                      onVoirAlternatives={() => setAlternativesProduit(p)}
                    />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 32 }}>
                    <button
                      onClick={() => allerPage(page - 1)}
                      disabled={page <= 1}
                      style={{
                        background: "#1a1a1a",
                        border: "1px solid #2e2e2e",
                        color: page <= 1 ? "#444" : "#fff",
                        padding: "9px 16px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: page <= 1 ? "not-allowed" : "pointer",
                        opacity: page <= 1 ? 0.5 : 1,
                      }}
                    >
                      ← Précédent
                    </button>

                    <span style={{ fontSize: 13, color: "#888", padding: "0 10px" }}>
                      Page {page} sur {totalPages}
                    </span>

                    <button
                      onClick={() => allerPage(page + 1)}
                      disabled={page >= totalPages}
                      style={{
                        background: "#1a1a1a",
                        border: "1px solid #2e2e2e",
                        color: page >= totalPages ? "#444" : "#fff",
                        padding: "9px 16px",
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: page >= totalPages ? "not-allowed" : "pointer",
                        opacity: page >= totalPages ? 0.5 : 1,
                      }}
                    >
                      Suivant →
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}
        </div>
      </div>

      {trendsProduit && (
        <TrendsModal produit={trendsProduit} onClose={() => setTrendsProduit(null)} />
      )}
      {ajouterBoutiqueProduit && (
        <AjouterBoutiqueModal produit={ajouterBoutiqueProduit} onClose={() => setAjouterBoutiqueProduit(null)} />
      )}
      {alternativesProduit && (
        <AlternativesModal produit={alternativesProduit} onClose={() => setAlternativesProduit(null)} />
      )}
    </div>
  );
}

function TrendsModal({ produit, onClose }: { produit: Produit; onClose: () => void }) {
  const [motCle, setMotCle] = useState(simplifierMotCle(produit.nom));

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "#000000cc", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 16,
          padding: 28, maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              📈 Tendance de recherche · Google Trends France
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: 0, lineHeight: 1.4 }}>
              {produit.nom}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "1px solid #333", color: "#888",
              width: 28, height: 28, borderRadius: 8, cursor: "pointer", flexShrink: 0, fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 11.5, color: "#666", marginBottom: 6 }}>
            Mot-clé recherché
          </label>
          <input
            type="text"
            value={motCle}
            onChange={(e) => setMotCle(e.target.value)}
            style={{
              width: "100%", background: "#111", border: "1px solid #2e2e2e", borderRadius: 8,
              padding: "9px 12px", color: "#f1f1f1", fontSize: 13, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        <p style={{ fontSize: 12.5, color: "#888", lineHeight: 1.6, marginBottom: 20 }}>
          Consulte l&apos;évolution de la recherche pour ce produit en France sur Google Trends.
        </p>

        <a
          href={`https://trends.google.com/trends/explore?geo=FR&q=${encodeURIComponent(motCle)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "block",
            width: "100%",
            textAlign: "center",
            background: "#6366f1",
            color: "#fff",
            padding: "14px 20px",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          Voir la tendance sur Google Trends ↗
        </a>
      </div>
    </div>
  );
}

function CarteProduit({
  produit,
  croissancePct,
  onVoirTendance,
  onAjouterBoutique,
  onVoirAlternatives,
}: {
  produit: Produit;
  croissancePct?: number;
  onVoirTendance: () => void;
  onAjouterBoutique: () => void;
  onVoirAlternatives: () => void;
}) {
  const hasPrixOriginal =
    produit.prixOriginal !== undefined && produit.prixOriginal > produit.prixFournisseur;

  return (
    <div
      style={{
        background: "#1a1a1a",
        border: "1px solid #2a2a2a",
        borderRadius: 14,
        overflow: "hidden",
        transition: "border-color 0.2s, transform 0.2s",
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#6366f1";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "#2a2a2a";
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
      }}
    >
      {/* Image */}
      <div style={{ height: 150, overflow: "hidden", background: "#111", position: "relative" }}>
        {produit.image ? (
          <img
            src={produit.image}
            alt={produit.nom}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", fontSize: 48 }}>🛍️</div>
        )}
        {produit.commission && (
          <span style={{
            position: "absolute",
            top: 10,
            right: 10,
            background: "#6366f1cc",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            padding: "3px 8px",
            borderRadius: 20,
          }}>
            💰 {produit.commission}% comm.
          </span>
        )}
      </div>

      <div style={{ padding: "11px 13px" }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, margin: "0 0 10px", color: "#e5e5e5", lineHeight: 1.4, height: 40, overflow: "hidden" }}>
          {produit.nom}
        </h3>

        {/* Pricing block */}
        <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 5 }}>
          {/* Prix AliExpress */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Prix AliExpress
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {hasPrixOriginal && (
                <span style={{ fontSize: 11, color: "#4a4a4a", textDecoration: "line-through" }}>
                  {produit.prixOriginal!.toFixed(2)}€
                </span>
              )}
              <span style={{ fontSize: 13, fontWeight: 600, color: "#a1a1aa" }}>
                {produit.prixFournisseur.toFixed(2)}€
              </span>
            </div>
          </div>

          {/* Prix de vente suggéré */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Prix de vente suggéré
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#a5b4fc" }}>
              {produit.prixVente.toFixed(2)}€
            </span>
          </div>
        </div>

        {/* Marge */}
        <div style={{ background: "#111", borderRadius: 8, padding: "7px 10px", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#555", textTransform: "uppercase", letterSpacing: "0.04em" }}>Marge est.</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#22c55e" }}>{produit.marge}%</span>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#666", marginBottom: 14 }}>
          <span>⭐ {(produit.note ?? 0).toFixed(1)} · {produit.commandes > 1000 ? `${(produit.commandes / 1000).toFixed(0)}k` : produit.commandes} cmd</span>
          {croissancePct !== undefined && (
            <span style={{
              fontSize: 11,
              fontWeight: 700,
              color: croissancePct >= 0 ? "#22c55e" : "#ef4444",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}>
              {croissancePct >= 0 ? "↑" : "↓"} {Math.abs(croissancePct).toFixed(0)}%
            </span>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <a
            href={produit.lienAliExpress}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              background: "#6366f1",
              color: "#fff",
              textAlign: "center",
              padding: "10px",
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Voir sur AliExpress →
          </a>
          <a
            href={`/site-builder?name=${encodeURIComponent(produit.nom)}&description=${encodeURIComponent(produit.nom)}&image=${encodeURIComponent(produit.image ?? "")}&rating=${(produit.note ?? 0).toFixed(1)}&orders=${produit.commandes}`}
            style={{
              display: "block",
              background: "#1a1a2e",
              border: "1px solid #6366f144",
              color: "#a5b4fc",
              textAlign: "center",
              padding: "9px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#2d2d4e";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "#6366f1";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#1a1a2e";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "#6366f144";
            }}
          >
            ✨ Créer une landing page
          </a>
          <a
            href={`/tools/calculateur-marge?cout=${produit.prixFournisseur.toFixed(2)}`}
            style={{
              display: "block",
              background: "transparent",
              border: "1px solid #2e2e2e",
              color: "#a1a1aa",
              textAlign: "center",
              padding: "9px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              textDecoration: "none",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "#1a1a1a";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "#444";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLAnchorElement).style.background = "transparent";
              (e.currentTarget as HTMLAnchorElement).style.borderColor = "#2e2e2e";
            }}
          >
            🧮 Calculer la marge
          </a>
          <button
            onClick={onAjouterBoutique}
            style={{
              display: "block",
              width: "100%",
              background: "#052e16",
              border: "1px solid #16653433",
              color: "#4ade80",
              textAlign: "center",
              padding: "9px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "#064e26";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#16a34a";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "#052e16";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#16653433";
            }}
          >
            🛍️ Ajouter à une boutique
          </button>
          <button
            onClick={onVoirTendance}
            style={{
              display: "block",
              width: "100%",
              background: "transparent",
              border: "1px solid #2e2e2e",
              color: "#a1a1aa",
              textAlign: "center",
              padding: "9px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#444";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2e2e2e";
            }}
          >
            📈 Tendance Google
          </button>
          <button
            onClick={onVoirAlternatives}
            style={{
              display: "block",
              width: "100%",
              background: "transparent",
              border: "1px solid #2e2e2e",
              color: "#a1a1aa",
              textAlign: "center",
              padding: "9px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s, border-color 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "#1a1a1a";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#444";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.borderColor = "#2e2e2e";
            }}
          >
            🔎 Alternatives fiables
          </button>
        </div>
      </div>
    </div>
  );
}

type Alternative = {
  productId: string;
  title: string;
  image: string;
  shopId: number | null;
  shopUrl: string | null;
  shopName: string | null;
  evaluateRate: string | null;
  orders: number;
  priceEUR: number;
  similarityScore: number;
  reliabilityScore: number;
  link: string | null;
};

function AlternativesModal({ produit, onClose }: { produit: Produit; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[] | null>(null);

  useEffect(() => {
    // Pas de setLoading(true)/setErreur(null) ici : le modal est démonté à la fermeture
    // (rendu conditionnel dans le parent), donc chaque ouverture est un montage neuf où
    // useState(true)/useState(null) ci-dessus jouent déjà ce rôle.
    let annule = false;

    fetch("/api/finder/alternatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: produit.id, nom: produit.nom }),
    })
      .then(async (res) => {
        const json = await res.json();
        if (annule) return;
        if (!res.ok) {
          setErreur(json.error ?? "Impossible de charger les alternatives.");
          return;
        }
        setAlternatives(json.alternatives ?? []);
      })
      .catch(() => {
        if (!annule) setErreur("Impossible de contacter le serveur.");
      })
      .finally(() => {
        if (!annule) setLoading(false);
      });

    return () => { annule = true; };
  }, [produit.id, produit.nom]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "#000000cc", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 16,
          padding: 28, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              🔎 Alternatives fiables · tout le catalogue AliExpress
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: 0, lineHeight: 1.4 }}>
              {produit.nom}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "1px solid #333", color: "#888",
              width: 28, height: 28, borderRadius: 8, cursor: "pointer", flexShrink: 0, fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#666", fontSize: 13.5 }}>
            ⏳ Recherche de vendeurs équivalents sur AliExpress...
          </div>
        ) : erreur ? (
          <div style={{ color: "#fca5a5", fontSize: 13, textAlign: "center", padding: 20 }}>
            ⚠️ {erreur}
          </div>
        ) : !alternatives || alternatives.length === 0 ? (
          <div style={{ color: "#a1a1aa", fontSize: 13, textAlign: "center", padding: 20, lineHeight: 1.6 }}>
            Aucune alternative fiable trouvée pour ce produit (même catégorie, prix comparable, note vendeur suffisante).
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {alternatives.map((alt) => (
              <a
                key={alt.productId}
                href={alt.link ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  gap: 12,
                  background: "#111",
                  border: "1px solid #2a2a2a",
                  borderRadius: 10,
                  padding: 12,
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                {alt.image ? (
                  <img
                    src={alt.image}
                    alt={alt.title}
                    style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#1a1a1a" }}
                  />
                ) : (
                  <div style={{ width: 56, height: 56, borderRadius: 8, background: "#1a1a1a", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: "#e5e5e5", fontWeight: 600, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {alt.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: "#888", marginBottom: 6 }}>
                    {alt.shopName ?? "Boutique AliExpress"}
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11.5, color: "#aaa" }}>
                    <span>💶 {alt.priceEUR.toFixed(2)}€</span>
                    <span>⭐ {alt.evaluateRate ?? "—"}</span>
                    <span>📦 {alt.orders > 1000 ? `${(alt.orders / 1000).toFixed(0)}k` : alt.orders} cmd</span>
                    <span style={{ color: "#6366f1" }}>🎯 {Math.round(alt.similarityScore * 100)}% similaire</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type BoutiqueOption = { id: string; nom: string };

function AjouterBoutiqueModal({ produit, onClose }: { produit: Produit; onClose: () => void }) {
  const [boutiques, setBoutiques] = useState<BoutiqueOption[] | null>(null);
  const [boutiquesError, setBoutiquesError] = useState<string | null>(null);
  const [selectedBoutiqueId, setSelectedBoutiqueId] = useState<string>("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    fetch("/api/boutiques")
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setBoutiquesError(json.error ?? "Impossible de charger tes boutiques.");
          return;
        }
        const list: BoutiqueOption[] = json.boutiques ?? [];
        setBoutiques(list);
        if (list.length > 0) setSelectedBoutiqueId(list[0].id);
      })
      .catch(() => setBoutiquesError("Impossible de contacter le serveur."));
  }, []);

  async function handleAdd() {
    if (!selectedBoutiqueId) return;
    setAdding(true);
    setAddError(null);
    try {
      const response = await fetch(`/api/boutiques/${selectedBoutiqueId}/produits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nom: produit.nom,
          slug: slugify(produit.nom),
          image_urls: produit.image ? [produit.image] : [],
          prix_vente: produit.prixVente,
          prix_original: null,
          stock: 0,
          stock_status: "in_stock",
          source_produit_id: produit.id,
          meta: {},
        }),
      });
      const json = await response.json();
      if (!response.ok) {
        setAddError(json.error ?? "Impossible d'ajouter ce produit.");
        return;
      }
      setAdded(true);
    } catch {
      setAddError("Impossible de contacter le serveur.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "#000000cc", zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 16,
          padding: 28, maxWidth: 560, width: "100%", maxHeight: "85vh", overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "#666", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
              🛍️ Ajouter à une boutique
            </div>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: "#e5e5e5", margin: 0, lineHeight: 1.4 }}>
              {produit.nom}
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent", border: "1px solid #333", color: "#888",
              width: 28, height: 28, borderRadius: 8, cursor: "pointer", flexShrink: 0, fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>

        {boutiquesError ? (
          <div style={{ color: "#fca5a5", fontSize: 13 }}>{boutiquesError}</div>
        ) : boutiques === null ? (
          <p style={{ fontSize: 13, color: "#888" }}>Chargement de tes boutiques…</p>
        ) : boutiques.length === 0 ? (
          <div style={{ fontSize: 13, color: "#a1a1aa", lineHeight: 1.6 }}>
            Tu n&apos;as pas encore de boutique.{" "}
            <Link href="/site-builder/boutique" style={{ color: "#a5b4fc" }}>Crée-en une →</Link>
          </div>
        ) : !added ? (
          <>
            <label style={{ display: "block", fontSize: 11.5, color: "#666", marginBottom: 6 }}>
              Boutique cible
            </label>
            <select
              value={selectedBoutiqueId}
              onChange={(e) => setSelectedBoutiqueId(e.target.value)}
              style={{
                width: "100%", background: "#111", border: "1px solid #2e2e2e", borderRadius: 8,
                padding: "9px 12px", color: "#f1f1f1", fontSize: 13, outline: "none", boxSizing: "border-box",
                marginBottom: 16,
              }}
            >
              {boutiques.map((b) => (
                <option key={b.id} value={b.id}>{b.nom}</option>
              ))}
            </select>

            {addError && (
              <div style={{ color: "#fca5a5", fontSize: 12.5, marginBottom: 12 }}>{addError}</div>
            )}

            <button
              onClick={handleAdd}
              disabled={adding}
              style={{
                display: "block", width: "100%", textAlign: "center",
                background: "#6366f1", color: "#fff", padding: "14px 20px", borderRadius: 10,
                fontSize: 14, fontWeight: 700, border: "none", cursor: adding ? "default" : "pointer",
                opacity: adding ? 0.6 : 1, boxSizing: "border-box",
              }}
            >
              {adding ? "Ajout…" : "Ajouter à cette boutique"}
            </button>
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{
              background: "#052e16", border: "1px solid #16653433", color: "#4ade80",
              borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 600,
            }}>
              ✓ Produit ajouté à la boutique.
            </div>
            <ProduitsSuggeres boutiqueId={selectedBoutiqueId} />
          </div>
        )}
      </div>
    </div>
  );
}
