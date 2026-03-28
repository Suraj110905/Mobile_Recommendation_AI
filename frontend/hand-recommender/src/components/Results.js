// Results.js
// STEP 3: Shows the AI recommendation results.
// Displays best phone prominently, then top 5 as cards.

function Results({ results, handData, onRestart }) {

  if (!results) return null;

  const best  = results.best_phone_details;
  const top5  = results.top_5;

  // Format price with commas → ₹38,999
  const formatPrice = (p) => `₹${Number(p).toLocaleString("en-IN")}`;

  // Color badge for segment
  const segmentColor = {
    "Budget":        { bg: "#dcfce7", text: "#15803d" },
    "Mid-Range":     { bg: "#dbeafe", text: "#1d4ed8" },
    "Mid-Premium":   { bg: "#ede9fe", text: "#6d28d9" },
    "Premium":       { bg: "#fef3c7", text: "#92400e" },
    "Ultra-Premium": { bg: "#fee2e2", text: "#991b1b" },
  };

  function PhoneCard({ phone, rank }) {
    const isWinner = rank === 1;
    const seg = segmentColor[phone.segment] || { bg: "#f3f4f6", text: "#374151" };

    return (
      <div style={{
        ...styles.card,
        ...(isWinner ? styles.winnerCard : {}),
      }}>

        {/* Rank badge */}
        <div style={{
          ...styles.rankBadge,
          background: isWinner ? "#6366f1" : "#e5e7eb",
          color: isWinner ? "#fff" : "#6b7280",
        }}>
          {isWinner ? "Best Pick" : `#${rank}`}
        </div>

        {/* Phone name */}
        <div style={styles.phoneName}>
          <span style={styles.phoneBrand}>{phone.brand}</span>
          <span style={styles.phoneModel}>{phone.model}</span>
        </div>

        {/* Segment + hand fit tags */}
        <div style={styles.tags}>
          <span style={{ ...styles.tag, background: seg.bg, color: seg.text }}>
            {phone.segment}
          </span>
          <span style={styles.tag}>
            {phone.hand_size_fit} hand fit
          </span>
          <span style={styles.tag}>
            {phone.one_hand_use} one-hand use
          </span>
        </div>

        {/* Price */}
        <div style={styles.price}>{formatPrice(phone.price_inr)}</div>

        {/* Specs grid */}
        <div style={styles.specsGrid}>
          <div style={styles.spec}>
            <span style={styles.specIcon}>📱</span>
            <span style={styles.specValue}>{phone.screen_inch}"</span>
            <span style={styles.specLabel}>Screen</span>
          </div>
          <div style={styles.spec}>
            <span style={styles.specIcon}>📷</span>
            <span style={styles.specValue}>{phone.camera_mp}MP</span>
            <span style={styles.specLabel}>Camera</span>
          </div>
          <div style={styles.spec}>
            <span style={styles.specIcon}>🔋</span>
            <span style={styles.specValue}>{phone.battery_mah}</span>
            <span style={styles.specLabel}>mAh</span>
          </div>
          <div style={styles.spec}>
            <span style={styles.specIcon}>💾</span>
            <span style={styles.specValue}>{phone.ram_gb}GB</span>
            <span style={styles.specLabel}>RAM</span>
          </div>
          <div style={styles.spec}>
            <span style={styles.specIcon}>🖥️</span>
            <span style={styles.specValue}>{phone.refresh_hz}Hz</span>
            <span style={styles.specLabel}>Display</span>
          </div>
          <div style={styles.spec}>
            <span style={styles.specIcon}>📶</span>
            <span style={styles.specValue}>{phone.has_5g === "Yes" ? "5G" : "4G"}</span>
            <span style={styles.specLabel}>Network</span>
          </div>
        </div>

        {/* Score bar */}
        <div style={styles.scoreRow}>
          <span style={styles.scoreLabel}>Match score</span>
          <div style={styles.scoreBarBg}>
            <div style={{
              ...styles.scoreBarFill,
              width: `${Math.min(100, phone.score)}%`,
              background: isWinner
                ? "linear-gradient(90deg, #6366f1, #8b5cf6)"
                : "#d1d5db",
            }} />
          </div>
          <span style={styles.scoreNum}>{phone.score}</span>
        </div>

      </div>
    );
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div>

      {/* Header */}
      <h2 style={styles.heading}>Your Recommendations</h2>
      <p style={styles.subtext}>
        Based on your <strong>{handData?.hand_size}</strong> hand size and preferences.
      </p>

      {/* Best phone callout */}
      <div style={styles.bestBanner}>
        <div>
          <p style={styles.bestLabel}>AI Recommended</p>
          <p style={styles.bestName}>{results.best_phone}</p>
          <p style={styles.bestScreen}>
            Ideal screen: {results.recommended_screen[0]}″ – {results.recommended_screen[1]}″
          </p>
        </div>
        <div style={styles.trophyIcon}>🏆</div>
      </div>

      {/* All 5 phone cards */}
      <div>
        {top5.map((phone, index) => (
          <PhoneCard key={phone.phone_model} phone={phone} rank={index + 1} />
        ))}
      </div>

      {/* Start over button */}
      <button style={styles.restartBtn} onClick={onRestart}>
        Start Over
      </button>

    </div>
  );
}

const styles = {
  heading: {
    fontSize: "22px", fontWeight: "700",
    color: "#1f2937", margin: "0 0 8px 0",
  },
  subtext: { color: "#6b7280", fontSize: "15px", margin: "0 0 24px 0" },
  bestBanner: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    borderRadius: "14px", padding: "20px 24px",
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: "28px", color: "#fff",
  },
  bestLabel:  { fontSize: "12px", opacity: 0.8, margin: "0 0 4px 0" },
  bestName:   { fontSize: "22px", fontWeight: "700", margin: "0 0 4px 0" },
  bestScreen: { fontSize: "13px", opacity: 0.8, margin: 0 },
  trophyIcon: { fontSize: "40px" },
  card: {
    background: "#fff", border: "1px solid #e5e7eb",
    borderRadius: "14px", padding: "20px",
    marginBottom: "16px", position: "relative",
  },
  winnerCard: {
    border: "2px solid #6366f1",
    boxShadow: "0 4px 20px rgba(99,102,241,0.12)",
  },
  rankBadge: {
    display: "inline-block", padding: "4px 12px",
    borderRadius: "20px", fontSize: "12px",
    fontWeight: "600", marginBottom: "12px",
  },
  phoneName: {
    display: "flex", flexDirection: "column",
    gap: "2px", marginBottom: "10px",
  },
  phoneBrand: { fontSize: "13px", color: "#6b7280" },
  phoneModel: { fontSize: "18px", fontWeight: "700", color: "#1f2937" },
  tags: {
    display: "flex", gap: "6px",
    flexWrap: "wrap", marginBottom: "12px",
  },
  tag: {
    background: "#f3f4f6", color: "#374151",
    padding: "3px 10px", borderRadius: "20px", fontSize: "12px",
  },
  price: {
    fontSize: "22px", fontWeight: "700",
    color: "#6366f1", marginBottom: "16px",
  },
  specsGrid: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px", marginBottom: "16px",
  },
  spec: {
    background: "#f8fafc", borderRadius: "8px",
    padding: "10px 8px", textAlign: "center",
    display: "flex", flexDirection: "column", gap: "2px",
  },
  specIcon:  { fontSize: "16px" },
  specValue: { fontSize: "15px", fontWeight: "700", color: "#1f2937" },
  specLabel: { fontSize: "11px", color: "#9ca3af" },
  scoreRow: {
    display: "flex", alignItems: "center", gap: "10px",
  },
  scoreLabel: { fontSize: "12px", color: "#9ca3af", whiteSpace: "nowrap" },
  scoreBarBg: {
    flex: 1, height: "6px", background: "#f3f4f6", borderRadius: "3px",
  },
  scoreBarFill: { height: "100%", borderRadius: "3px", transition: "width 0.8s" },
  scoreNum: { fontSize: "13px", fontWeight: "600", color: "#374151", minWidth: "32px" },
  restartBtn: {
    width: "100%", padding: "14px",
    border: "2px solid #e5e7eb", borderRadius: "10px",
    background: "#fff", fontSize: "16px",
    fontWeight: "600", cursor: "pointer",
    color: "#374151", marginTop: "8px",
  },
};

export default Results;