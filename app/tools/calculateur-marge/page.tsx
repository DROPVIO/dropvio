"use client";

import { useState, useEffect } from "react";

export default function CalculateurMarge() {
  const [prixFournisseur, setPrixFournisseur] = useState("");
  const [fraisLivraison, setFraisLivraison] = useState("");
  const [prixVente, setPrixVente] = useState("");
  const [fraisShopify, setFraisShopify] = useState("2");
  const [budgetPub, setBudgetPub] = useState("");
  const [resultats, setResultats] = useState<{
    margeNette: number;
    margePct: number;
    roi: number;
    breakEven: number;
    coutTotal: number;
  } | null>(null);

  useEffect(() => {
    const vente = parseFloat(prixVente);
    const fournisseur = parseFloat(prixFournisseur);
    const livraison = parseFloat(fraisLivraison) || 0;
    const shopify = parseFloat(fraisShopify) || 0;
    const pub = parseFloat(budgetPub) || 0;

    if (!vente || !fournisseur) {
      setResultats(null);
      return;
    }

    const fraisTransaction = (shopify / 100) * vente;
    const coutTotal = fournisseur + livraison + fraisTransaction + pub;
    const margeNette = vente - coutTotal;
    const margePct = (margeNette / vente) * 100;
    const roi = coutTotal > 0 ? (margeNette / coutTotal) * 100 : 0;
    const breakEven = coutTotal;

    setResultats({ margeNette, margePct, roi, breakEven, coutTotal });
  }, [prixFournisseur, fraisLivraison, prixVente, fraisShopify, budgetPub]);

  const getMargeColor = (pct: number) => {
    if (pct >= 40) return "#22c55e";
    if (pct >= 20) return "#f59e0b";
    return "#ef4444";
  };

  const getMargeLabel = (pct: number) => {
    if (pct >= 40) return "Excellente";
    if (pct >= 20) return "Correcte";
    return "Trop faible";
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0f0f0f",
      color: "#f1f1f1",
      fontFamily: "'Inter', -apple-system, sans-serif",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 680, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
         
          <h1 style={{
            fontSize: 32,
            fontWeight: 700,
            margin: 0,
            lineHeight: 1.2,
            color: "#ffffff",
          }}>
            Calculateur de marge
          </h1>
          <p style={{ color: "#888", marginTop: 10, fontSize: 15 }}>
            Calcule ta rentabilité avant de lancer un produit.
          </p>
        </div>

        {/* Formulaire */}
        <div style={{
          background: "#1a1a1a",
          borderRadius: 16,
          padding: 32,
          border: "1px solid #2a2a2a",
          marginBottom: 24,
        }}>
          <div style={{ display: "grid", gap: 20 }}>

            <InputField
              label="Prix fournisseur (€)"
              placeholder="ex: 8.50"
              value={prixFournisseur}
              onChange={setPrixFournisseur}
              required
            />
            <InputField
              label="Frais de livraison (€)"
              placeholder="ex: 2.00"
              value={fraisLivraison}
              onChange={setFraisLivraison}
            />
            <InputField
              label="Prix de vente (€)"
              placeholder="ex: 29.99"
              value={prixVente}
              onChange={setPrixVente}
              required
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <InputField
                label="Frais Shopify / transaction (%)"
                placeholder="ex: 2"
                value={fraisShopify}
                onChange={setFraisShopify}
              />
              <InputField
                label="Budget pub par vente (€)"
                placeholder="ex: 5.00"
                value={budgetPub}
                onChange={setBudgetPub}
              />
            </div>
          </div>
        </div>

        {/* Résultats */}
        {resultats ? (
          <div style={{
            background: "#1a1a1a",
            borderRadius: 16,
            padding: 32,
            border: "1px solid #2a2a2a",
          }}>
            <h2 style={{ margin: "0 0 24px", fontSize: 16, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Résultats
            </h2>

            {/* Marge principale */}
            <div style={{
              background: "#111",
              borderRadius: 12,
              padding: "24px 28px",
              marginBottom: 20,
              border: `1px solid ${getMargeColor(resultats.margePct)}33`,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: 13, color: "#666", marginBottom: 4 }}>Marge nette par vente</div>
                <div style={{ fontSize: 36, fontWeight: 700, color: getMargeColor(resultats.margePct) }}>
                  {resultats.margeNette >= 0 ? "+" : ""}{resultats.margeNette.toFixed(2)} €
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: getMargeColor(resultats.margePct),
                }}>
                  {resultats.margePct.toFixed(1)}%
                </div>
                <div style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: getMargeColor(resultats.margePct),
                  marginTop: 4,
                }}>
                  {getMargeLabel(resultats.margePct)}
                </div>
              </div>
            </div>

            {/* Stats secondaires */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <StatCard label="Coût total" value={`${resultats.coutTotal.toFixed(2)} €`} />
              <StatCard label="ROI" value={`${resultats.roi.toFixed(0)}%`} />
              <StatCard label="Break-even" value={`${resultats.breakEven.toFixed(2)} €`} />
            </div>

            {/* Conseil */}
            {resultats.margePct < 20 && (
              <div style={{
                marginTop: 20,
                padding: "14px 18px",
                background: "#1f1010",
                borderRadius: 10,
                border: "1px solid #ef444433",
                fontSize: 13,
                color: "#fca5a5",
                lineHeight: 1.5,
              }}>
                ⚠️ Marge trop faible pour absorber les imprévus. Essaie de négocier le prix fournisseur ou d'augmenter le prix de vente.
              </div>
            )}
            {resultats.margePct >= 40 && (
              <div style={{
                marginTop: 20,
                padding: "14px 18px",
                background: "#0f1f10",
                borderRadius: 10,
                border: "1px solid #22c55e33",
                fontSize: 13,
                color: "#86efac",
                lineHeight: 1.5,
              }}>
                ✅ Bonne marge ! Ce produit peut absorber les coûts pubs et les retours.
              </div>
            )}
          </div>
        ) : (
          <div style={{
            background: "#1a1a1a",
            borderRadius: 16,
            padding: 40,
            border: "1px solid #2a2a2a",
            textAlign: "center",
            color: "#444",
            fontSize: 14,
          }}>
            Remplis le prix fournisseur et le prix de vente pour voir les résultats.
          </div>
        )}
      </div>
    </div>
  );
}

function InputField({
  label,
  placeholder,
  value,
  onChange,
  required,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label style={{
        display: "block",
        fontSize: 13,
        fontWeight: 500,
        color: "#aaa",
        marginBottom: 8,
      }}>
        {label} {required && <span style={{ color: "#6366f1" }}>*</span>}
      </label>
      <input
        type="number"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "#111",
          border: "1px solid #2e2e2e",
          borderRadius: 8,
          padding: "12px 14px",
          color: "#f1f1f1",
          fontSize: 15,
          outline: "none",
          boxSizing: "border-box",
          transition: "border-color 0.2s",
        }}
        onFocus={(e) => (e.target.style.borderColor = "#6366f1")}
        onBlur={(e) => (e.target.style.borderColor = "#2e2e2e")}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      background: "#111",
      borderRadius: 10,
      padding: "16px 18px",
      border: "1px solid #222",
    }}>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color: "#e5e5e5" }}>
        {value}
      </div>
    </div>
  );
}
