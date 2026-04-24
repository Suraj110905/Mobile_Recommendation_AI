// Results.js
// Shows top 5 phone recommendations.
// NEW: User can select up to 3 phones to compare side by side.
// Comparison table highlights the winner for each spec in green.

import { useState } from "react";

function Results({ results, handData, onRestart }) {

  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------
  // compareList = array of phone objects the user selected
  const [compareList, setCompareList] = useState([]);
  // showCompare = whether the comparison table is visible
  const [showCompare, setShowCompare] = useState(false);

  if (!results) return null;

  const top5 = results.top_5;
  const best = results.best_phone_details;

  // -------------------------------------------------------
  // COMPARE LOGIC
  // -------------------------------------------------------
  const MAX_COMPARE = 3;

  // Is this phone currently in the compare list?
  function isInCompare(phone) {
    return compareList.some(p => p.phone_model === phone.phone_model);
  }

  // Add or remove a phone from the compare list
  function toggleCompare(phone) {
    if (isInCompare(phone)) {
      // Remove it
      setCompareList(prev => prev.filter(p => p.phone_model !== phone.phone_model));
    } else {
      // Add it — max 3
      if (compareList.length >= MAX_COMPARE) return;
      setCompareList(prev => [...prev, phone]);
    }
  }

  // -------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------
  const formatPrice = (p) => `₹${Number(p).toLocaleString("en-IN")}`;

  const segmentColor = {
    "Budget":        { bg: "#dcfce7", text: "#15803d" },
    "Mid-Range":     { bg: "#dbeafe", text: "#1d4ed8" },
    "Mid-Premium":   { bg: "#ede9fe", text: "#6d28d9" },
    "Premium":       { bg: "#fef3c7", text: "#92400e" },
    "Ultra-Premium": { bg: "#fee2e2", text: "#991b1b" },
  };

  // The specs we show in the comparison table
  // Each spec has: label, key (field name), unit, higherIsBetter flag
  const SPECS = [
    { label: "Price",        key: "price_inr",    unit: "₹",   higherIsBetter: false },
    { label: "Screen",       key: "screen_inch",  unit: "\"",  higherIsBetter: true  },
    { label: "Camera",       key: "camera_mp",    unit: "MP",  higherIsBetter: true  },
    { label: "Battery",      key: "battery_mah",  unit: "mAh", higherIsBetter: true  },
    { label: "RAM",          key: "ram_gb",        unit: "GB",  higherIsBetter: true  },
    { label: "Refresh rate", key: "refresh_hz",   unit: "Hz",  higherIsBetter: true  },
    { label: "Weight",       key: "weight_g",     unit: "g",   higherIsBetter: false },
    { label: "Match score",  key: "score",        unit: "",    higherIsBetter: true  },
  ];

  // For a given spec, which phone has the best value?
  function getBestIndex(spec) {
    if (compareList.length === 0) return -1;
    const values = compareList.map(p => Number(p[spec.key]) || 0);
    const best = spec.higherIsBetter ? Math.max(...values) : Math.min(...values);
    return values.indexOf(best);
  }

  // Format a spec value for display
  function formatSpec(phone, spec) {
    const val = phone[spec.key];
    if (val === undefined || val === null) return "—";
    if (spec.key === "price_inr") return formatPrice(val);
    if (spec.key === "score") return Number(val).toFixed(1);
    return `${val}${spec.unit}`;
  }

  // -------------------------------------------------------
  // PHONE CARD (in the top-5 list)
  // -------------------------------------------------------
  function PhoneCard({ phone, rank }) {
    const isWinner   = rank === 1;
    const inCompare  = isInCompare(phone);
    const cantAdd    = !inCompare && compareList.length >= MAX_COMPARE;
    const seg        = segmentColor[phone.segment] || { bg: "#f3f4f6", text: "#374151" };

    return (
      <div style={{
        ...S.card,
        borderColor: isWinner ? "#6366f1" : inCompare ? "#10b981" : "#e5e7eb",
        borderWidth: (isWinner || inCompare) ? "2px" : "1px",
      }}>

        {/* Top row: rank badge + compare checkbox */}
        <div style={S.cardTop}>
          <div style={{
            ...S.rankBadge,
            background: isWinner ? "#6366f1" : "#e5e7eb",
            color:      isWinner ? "#fff"    : "#6b7280",
          }}>
            {isWinner ? "Best Pick" : `#${rank}`}
          </div>

          {/* Compare toggle button */}
          <button
            style={{
              ...S.compareToggle,
              background:   inCompare ? "#dcfce7" : cantAdd ? "#f9fafb" : "#f3f4f6",
              color:        inCompare ? "#15803d" : cantAdd ? "#d1d5db" : "#374151",
              borderColor:  inCompare ? "#86efac" : "#e5e7eb",
              cursor:       cantAdd ? "not-allowed" : "pointer",
            }}
            onClick={() => !cantAdd && toggleCompare(phone)}
            title={cantAdd ? "Max 3 phones for comparison" : inCompare ? "Remove from compare" : "Add to compare"}
          >
            {inCompare ? "✓ Added" : cantAdd ? "Max 3" : "+ Compare"}
          </button>
        </div>

        {/* Phone name */}
        <div style={S.phoneName}>
          <span style={S.brand}>{phone.brand}</span>
          <span style={S.model}>{phone.model}</span>
        </div>

        {/* Tags */}
        <div style={S.tags}>
          <span style={{ ...S.tag, background: seg.bg, color: seg.text }}>
            {phone.segment}
          </span>
          <span style={S.tag}>{phone.hand_size_fit} fit</span>
          <span style={S.tag}>{phone.one_hand_use} use</span>
        </div>

        {/* Price */}
        <div style={S.price}>{formatPrice(phone.price_inr)}</div>

        {/* Specs grid */}
        <div style={S.specsGrid}>
          {[
            { icon: "📱", val: `${phone.screen_inch}"`,   label: "Screen"   },
            { icon: "📷", val: `${phone.camera_mp}MP`,    label: "Camera"   },
            { icon: "🔋", val: `${phone.battery_mah}`,    label: "mAh"      },
            { icon: "💾", val: `${phone.ram_gb}GB`,       label: "RAM"      },
            { icon: "🖥️", val: `${phone.refresh_hz}Hz`,  label: "Display"  },
            { icon: "📶", val: phone.has_5g === "Yes" ? "5G" : "4G", label: "Network" },
          ].map(({ icon, val, label }) => (
            <div key={label} style={S.spec}>
              <span style={{ fontSize: "16px" }}>{icon}</span>
              <span style={S.specVal}>{val}</span>
              <span style={S.specLbl}>{label}</span>
            </div>
          ))}
        </div>

        {/* Score bar */}
        <div style={S.scoreRow}>
          <span style={S.scoreLbl}>Match</span>
          <div style={S.barBg}>
            <div style={{
              ...S.barFill,
              width: `${Math.min(100, phone.score)}%`,
              background: isWinner ? "#6366f1" : "#d1d5db",
            }} />
          </div>
          <span style={S.scoreNum}>{Number(phone.score).toFixed(1)}</span>
        </div>

      </div>
    );
  }

  // -------------------------------------------------------
  // COMPARISON TABLE
  // -------------------------------------------------------
  function CompareTable() {
    if (compareList.length < 2) return (
      <div style={S.comparePlaceholder}>
        <p style={{ color: "#6b7280", fontSize: "14px", margin: 0 }}>
          Select at least 2 phones above to compare them here.
        </p>
      </div>
    );

    return (
      <div style={S.tableWrap}>
        {/* Phone name headers */}
        <div style={{ ...S.tableRow, background: "#f8fafc", borderRadius: "10px 10px 0 0" }}>
          <div style={S.specCol}>Spec</div>
          {compareList.map(phone => (
            <div key={phone.phone_model} style={S.phoneCol}>
              <div style={{ fontSize: "11px", color: "#6b7280" }}>{phone.brand}</div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: "#1f2937" }}>
                {phone.model}
              </div>
              {/* Remove button */}
              <button
                style={S.removeBtn}
                onClick={() => toggleCompare(phone)}
              >
                ✕ Remove
              </button>
            </div>
          ))}
        </div>

        {/* One row per spec */}
        {SPECS.map((spec, si) => {
          const bestIdx = getBestIndex(spec);
          return (
            <div key={spec.key} style={{
              ...S.tableRow,
              background: si % 2 === 0 ? "#fff" : "#fafafa",
            }}>
              <div style={S.specCol}>
                <span style={{ fontSize: "13px", color: "#374151", fontWeight: "500" }}>
                  {spec.label}
                </span>
              </div>
              {compareList.map((phone, pi) => {
                const isWinner = pi === bestIdx;
                return (
                  <div key={phone.phone_model} style={{
                    ...S.phoneCol,
                    background:  isWinner ? "#f0fdf4" : "transparent",
                    borderRadius: isWinner ? "6px" : "0",
                  }}>
                    <span style={{
                      fontSize: "15px",
                      fontWeight: isWinner ? "700" : "400",
                      color: isWinner ? "#15803d" : "#1f2937",
                    }}>
                      {formatSpec(phone, spec)}
                    </span>
                    {/* Green crown for winner */}
                    {isWinner && compareList.length > 1 && (
                      <span style={{ fontSize: "12px", marginLeft: "4px" }}>👑</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Overall winner row */}
        {(() => {
          // Overall winner = highest score
          const scores   = compareList.map(p => p.score);
          const maxScore = Math.max(...scores);
          const winner   = compareList[scores.indexOf(maxScore)];
          return (
            <div style={{
              ...S.tableRow,
              background: "#eef2ff",
              borderRadius: "0 0 10px 10px",
              borderTop: "2px solid #6366f1",
            }}>
              <div style={{ ...S.specCol, fontWeight: "700", color: "#6366f1" }}>
                Overall winner
              </div>
              {compareList.map(phone => (
                <div key={phone.phone_model} style={{
                  ...S.phoneCol,
                  fontWeight: "700",
                  color: phone.phone_model === winner.phone_model ? "#6366f1" : "#9ca3af",
                  fontSize: "14px",
                }}>
                  {phone.phone_model === winner.phone_model ? "🏆 Winner" : "—"}
                </div>
              ))}
            </div>
          );
        })()}
      </div>
    );
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div>

      {/* Page header */}
      <h2 style={S.heading}>Your Recommendations</h2>
      <p style={S.subtext}>
        Based on your <strong>{handData?.hand_size}</strong> hand size.
        Select up to 3 phones to compare.
      </p>

      {/* Best phone banner */}
      <div style={S.bestBanner}>
        <div>
          <p style={{ fontSize: "12px", opacity: 0.8, margin: "0 0 4px" }}>AI Recommended</p>
          <p style={{ fontSize: "22px", fontWeight: "700", margin: "0 0 4px" }}>
            {results.best_phone}
          </p>
          <p style={{ fontSize: "13px", opacity: 0.8, margin: 0 }}>
            Ideal screen: {results.recommended_screen[0]}"–{results.recommended_screen[1]}"
          </p>
        </div>
        <div style={{ fontSize: "40px" }}>🏆</div>
      </div>

      {/* ── COMPARE SECTION ───────────────────────────── */}
      <div style={S.compareSection}>
        {/* Header row with toggle button */}
        <div style={S.compareHeader}>
          <div>
            <span style={S.compareSectionTitle}>Compare phones</span>
            <span style={S.compareCount}>
              {compareList.length}/{MAX_COMPARE} selected
            </span>
          </div>
          <button
            style={{
              ...S.viewCompareBtn,
              opacity: compareList.length >= 2 ? 1 : 0.4,
              cursor:  compareList.length >= 2 ? "pointer" : "not-allowed",
            }}
            onClick={() => compareList.length >= 2 && setShowCompare(!showCompare)}
          >
            {showCompare ? "Hide table" : "View comparison"}
          </button>
        </div>

        {/* Selected phone pills */}
        {compareList.length > 0 && (
          <div style={S.selectedPills}>
            {compareList.map(phone => (
              <div key={phone.phone_model} style={S.pill}>
                <span style={S.pillText}>{phone.model}</span>
                <button
                  style={S.pillRemove}
                  onClick={() => toggleCompare(phone)}
                >✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Comparison table (shown/hidden) */}
        {showCompare && <CompareTable />}
      </div>

      {/* ── TOP 5 PHONE CARDS ─────────────────────────── */}
      {top5.map((phone, index) => (
        <PhoneCard key={phone.phone_model} phone={phone} rank={index + 1} />
      ))}

      {/* Start over */}
      <button style={S.restartBtn} onClick={onRestart}>
        Start Over
      </button>

    </div>
  );
}

// -------------------------------------------------------
// STYLES
// -------------------------------------------------------
const S = {
  heading:  { fontSize: "22px", fontWeight: "700", color: "#1f2937", margin: "0 0 8px" },
  subtext:  { color: "#6b7280", fontSize: "15px", margin: "0 0 24px" },

  bestBanner: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    borderRadius: "14px", padding: "20px 24px", color: "#fff",
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: "24px",
  },

  // Compare section wrapper
  compareSection: {
    border: "1px solid #e5e7eb", borderRadius: "14px",
    padding: "16px", marginBottom: "24px", background: "#fafafa",
  },
  compareHeader: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: "12px",
  },
  compareSectionTitle: {
    fontSize: "15px", fontWeight: "600", color: "#1f2937", marginRight: "8px",
  },
  compareCount: {
    fontSize: "12px", color: "#6b7280",
    background: "#e5e7eb", padding: "2px 8px", borderRadius: "20px",
  },
  viewCompareBtn: {
    padding: "8px 16px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", border: "none", borderRadius: "8px",
    fontSize: "13px", fontWeight: "600",
  },

  // Selected pills
  selectedPills: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" },
  pill: {
    display: "flex", alignItems: "center", gap: "6px",
    background: "#eef2ff", border: "1px solid #c7d2fe",
    borderRadius: "20px", padding: "4px 10px",
  },
  pillText:   { fontSize: "13px", color: "#4338ca", fontWeight: "500" },
  pillRemove: {
    background: "none", border: "none", color: "#6366f1",
    cursor: "pointer", fontSize: "12px", padding: "0", lineHeight: 1,
  },

  // Comparison table
  comparePlaceholder: {
    padding: "20px", textAlign: "center",
    background: "#fff", borderRadius: "10px",
    border: "1px dashed #e5e7eb",
  },
  tableWrap:  { borderRadius: "10px", overflow: "hidden", border: "1px solid #e5e7eb" },
  tableRow: {
    display: "grid",
    gridTemplateColumns: "140px repeat(3, 1fr)",
    padding: "10px 12px", gap: "8px", alignItems: "center",
    borderBottom: "0.5px solid #f3f4f6",
  },
  specCol:  { fontSize: "12px", color: "#6b7280" },
  phoneCol: { textAlign: "center", padding: "4px 6px" },
  removeBtn: {
    display: "block", margin: "4px auto 0",
    background: "none", border: "none",
    color: "#ef4444", fontSize: "11px",
    cursor: "pointer", padding: 0,
  },

  // Phone card
  card: {
    background: "#fff", border: "1px solid #e5e7eb",
    borderRadius: "14px", padding: "20px",
    marginBottom: "16px",
  },
  cardTop: {
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: "12px",
  },
  rankBadge: {
    display: "inline-block", padding: "4px 12px",
    borderRadius: "20px", fontSize: "12px", fontWeight: "600",
  },
  compareToggle: {
    padding: "6px 12px", borderRadius: "8px",
    border: "1px solid #e5e7eb", fontSize: "12px",
    fontWeight: "600", transition: "all 0.15s",
  },
  phoneName: { display: "flex", flexDirection: "column", gap: "2px", marginBottom: "10px" },
  brand:    { fontSize: "12px", color: "#6b7280" },
  model:    { fontSize: "18px", fontWeight: "700", color: "#1f2937" },
  tags:     { display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "12px" },
  tag:      { background: "#f3f4f6", color: "#374151", padding: "3px 10px", borderRadius: "20px", fontSize: "12px" },
  price:    { fontSize: "22px", fontWeight: "700", color: "#6366f1", marginBottom: "16px" },
  specsGrid:{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" },
  spec:     { background: "#f8fafc", borderRadius: "8px", padding: "10px 8px", textAlign: "center", display: "flex", flexDirection: "column", gap: "2px" },
  specVal:  { fontSize: "15px", fontWeight: "700", color: "#1f2937" },
  specLbl:  { fontSize: "11px", color: "#9ca3af" },
  scoreRow: { display: "flex", alignItems: "center", gap: "10px" },
  scoreLbl: { fontSize: "12px", color: "#9ca3af", whiteSpace: "nowrap" },
  barBg:    { flex: 1, height: "6px", background: "#f3f4f6", borderRadius: "3px" },
  barFill:  { height: "100%", borderRadius: "3px" },
  scoreNum: { fontSize: "13px", fontWeight: "600", color: "#374151", minWidth: "32px" },

  restartBtn: {
    width: "100%", padding: "14px",
    border: "2px solid #e5e7eb", borderRadius: "10px",
    background: "#fff", fontSize: "16px",
    fontWeight: "600", cursor: "pointer", color: "#374151", marginTop: "8px",
  },
};

export default Results;