// History.js
// Shows all past scan sessions saved in localStorage.
// User can re-view any past result or clear all history.

function History({ history, onClose, onClear, onReview }) {

  const formatPrice = (p) => "₹" + Number(p).toLocaleString("en-IN");

  const segmentColor = {
    "Budget":        { bg: "#dcfce7", text: "#15803d" },
    "Mid-Range":     { bg: "#dbeafe", text: "#1d4ed8" },
    "Mid-Premium":   { bg: "#ede9fe", text: "#6d28d9" },
    "Premium":       { bg: "#fef3c7", text: "#92400e" },
    "Ultra-Premium": { bg: "#fee2e2", text: "#991b1b" },
  };

  return (
    <div style={S.wrap}>
      <div style={S.inner}>

        {/* Header */}
        <div style={S.header}>
          <div>
            <h2 style={S.heading}>Scan History</h2>
            <p style={S.subtext}>Your last {history.length} scan{history.length !== 1 ? "s" : ""}</p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {history.length > 0 && (
              <button style={S.clearBtn} onClick={() => {
                if (window.confirm("Clear all history?")) onClear();
              }}>
                🗑 Clear all
              </button>
            )}
            <button style={S.closeBtn} onClick={onClose}>✕ Close</button>
          </div>
        </div>

        {/* Empty state */}
        {history.length === 0 && (
          <div style={S.empty}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>📋</div>
            <p style={{ color: "#6b7280", fontSize: "15px", margin: 0 }}>
              No scan history yet. Complete a scan to see it here.
            </p>
          </div>
        )}

        {/* History entries */}
        {history.map((entry) => {
          const best = entry.top_5 && entry.top_5[0];
          const seg  = best ? (segmentColor[best.segment] || { bg: "#f3f4f6", text: "#374151" }) : null;

          return (
            <div key={entry.id} style={S.card}>

              {/* Date + hand size */}
              <div style={S.cardTop}>
                <div style={S.dateRow}>
                  <span style={S.dateText}>🕐 {entry.date}</span>
                  <span style={{
                    ...S.handBadge,
                    background: entry.hand_size === "Small"  ? "#dcfce7" :
                                entry.hand_size === "Medium" ? "#eef2ff" : "#fef3c7",
                    color:      entry.hand_size === "Small"  ? "#15803d" :
                                entry.hand_size === "Medium" ? "#4338ca" : "#92400e",
                  }}>
                    ✋ {entry.hand_size} hand
                  </span>
                </div>
              </div>

              {/* Best phone */}
              <div style={S.bestRow}>
                <div>
                  <p style={S.bestLabel}>Best recommendation</p>
                  <p style={S.bestName}>{entry.best_phone}</p>
                  <p style={S.screenText}>
                    Screen: {entry.recommended_screen[0]}"–{entry.recommended_screen[1]}"
                  </p>
                </div>
                <div style={{ fontSize: "28px" }}>🏆</div>
              </div>

              {/* Top 3 phones mini list */}
              <div style={S.miniList}>
                {(entry.top_5 || []).slice(0, 3).map((phone, i) => {
                  const s = segmentColor[phone.segment] || { bg: "#f3f4f6", text: "#374151" };
                  return (
                    <div key={phone.phone_model} style={S.miniItem}>
                      <span style={S.miniRank}>#{i + 1}</span>
                      <span style={S.miniName}>{phone.phone_model}</span>
                      <span style={{ ...S.miniSeg, background: s.bg, color: s.text }}>
                        {phone.segment}
                      </span>
                      <span style={S.miniPrice}>{formatPrice(phone.price_inr)}</span>
                    </div>
                  );
                })}
              </div>

              {/* Review button */}
              <button style={S.reviewBtn} onClick={() => onReview(entry)}>
                View full results →
              </button>

            </div>
          );
        })}

      </div>
    </div>
  );
}

const S = {
  wrap:  { background: "#f8fafc", minHeight: "100vh" },
  inner: { maxWidth: "640px", margin: "0 auto", padding: "24px 20px" },

  header:  { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" },
  heading: { fontSize: "22px", fontWeight: "700", color: "#1f2937", margin: "0 0 4px" },
  subtext: { color: "#6b7280", fontSize: "14px", margin: 0 },

  clearBtn: {
    padding: "8px 14px", border: "1px solid #fca5a5",
    borderRadius: "8px", background: "#fef2f2",
    color: "#dc2626", fontSize: "13px",
    fontWeight: "600", cursor: "pointer",
  },
  closeBtn: {
    padding: "8px 16px", border: "1px solid #e5e7eb",
    borderRadius: "8px", background: "#fff",
    color: "#374151", fontSize: "13px",
    fontWeight: "600", cursor: "pointer",
  },

  empty: {
    textAlign: "center", padding: "60px 20px",
    background: "#fff", borderRadius: "14px",
    border: "1px solid #e5e7eb",
  },

  card: {
    background: "#fff", border: "1px solid #e5e7eb",
    borderRadius: "14px", padding: "20px",
    marginBottom: "16px",
  },
  cardTop: { marginBottom: "14px" },
  dateRow: { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
  dateText: { fontSize: "12px", color: "#9ca3af" },
  handBadge: {
    fontSize: "12px", fontWeight: "600",
    padding: "3px 10px", borderRadius: "20px",
  },

  bestRow: {
    display: "flex", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: "14px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    borderRadius: "10px", padding: "14px 16px", color: "#fff",
  },
  bestLabel: { fontSize: "11px", opacity: 0.8, margin: "0 0 4px" },
  bestName:  { fontSize: "17px", fontWeight: "700", margin: "0 0 2px" },
  screenText:{ fontSize: "12px", opacity: 0.8, margin: 0 },

  miniList: { marginBottom: "14px" },
  miniItem: {
    display: "flex", alignItems: "center", gap: "8px",
    padding: "8px 0", borderBottom: "0.5px solid #f3f4f6",
  },
  miniRank:  { fontSize: "12px", color: "#9ca3af", width: "20px", flexShrink: 0 },
  miniName:  { fontSize: "13px", color: "#1f2937", fontWeight: "500", flex: 1 },
  miniSeg:   { fontSize: "11px", padding: "2px 8px", borderRadius: "20px", flexShrink: 0 },
  miniPrice: { fontSize: "13px", fontWeight: "600", color: "#6366f1", flexShrink: 0 },

  reviewBtn: {
    width: "100%", padding: "10px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", border: "none", borderRadius: "8px",
    fontSize: "14px", fontWeight: "600", cursor: "pointer",
  },
};

export default History;