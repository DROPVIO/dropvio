"use client";

import { useState, useEffect, useCallback } from "react";

const NICHES = [
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
  note: number;
  commission: string;
  lienAliExpress: string;
  niche: string;
};

export default function ProduitsGagnants() {
  const [nicheActive, setNicheActive] = useState<string>("fitness");
  const [tiroirOpen, setTiroirOpen] = useState(false);
  const [filtresPrix, setFiltresPrix] = useState<string>("tous");
  const [filtreMarge, setFiltreMarge] = useState<number>(0);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [loading, setLoading] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const chargerProduits = useCallback(async () => {
    setLoading(true);
    setErreur(null);

    try {
      let url = `/api/aliexpress/products?niche=${nicheActive}`;
      if (filtresPrix === "0-20") url += "&priceMax=20";
      else if (filtresPrix === "20-50") url += "&priceMin=20&priceMax=50";
      else if (filtresPrix === "50+") url += "&priceMin=50";

      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        setErreur(data.error);
        setProduits([]);
      } else {
        let resultat = data.products || [];
        if (filtreMarge > 0) resultat = resultat.filter((p: Produit) => p.marge >= filtreMarge);
        setProduits(resultat);
      }
    } catch {
      setErreur("Impossible de charger les produits. Vérifie ta connexion.");
    } finally {
      setLoading(false);
    }
  }, [nicheActive, filtresPrix, filtreMarge]);

  useEffect(() => {
    chargerProduits();
  }, [chargerProduits]);

  const nicheSelectionnee = NICHES.find(n => n.id === nicheActive);

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
                  onClick={() => { setNicheActive(niche.id); setTiroirOpen(false); }}
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
              onClick={() => setFiltresPrix(f.val)}
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
              onClick={() => setFiltreMarge(f.val)}
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

        {/* Résultats */}
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
              {produits.length} produit{produits.length > 1 ? "s" : ""} trouvé{produits.length > 1 ? "s" : ""}
              {nicheSelectionnee && ` dans ${nicheSelectionnee.emoji} ${nicheSelectionnee.label}`}
            </div>

            {produits.length === 0 ? (
              <div style={{ textAlign: "center", padding: 60, color: "#444", fontSize: 15 }}>
                Aucun produit pour ces filtres. Essaie de les élargir.
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
                  {produits.map(p => (
                    <CarteProduit key={p.id} produit={p} />
                  ))}
                </div>

              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CarteProduit({ produit }: { produit: Produit }) {
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

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#666", marginBottom: 14 }}>
          <span>⭐ {produit.note.toFixed(1)} · {produit.commandes > 1000 ? `${(produit.commandes / 1000).toFixed(0)}k` : produit.commandes} cmd</span>
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
            href={`/site-builder?name=${encodeURIComponent(produit.nom)}&description=${encodeURIComponent(produit.nom)}&image=${encodeURIComponent(produit.image ?? "")}&rating=${produit.note.toFixed(1)}&orders=${produit.commandes}`}
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
        </div>
      </div>
    </div>
  );
}
