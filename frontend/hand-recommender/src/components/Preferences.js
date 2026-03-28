// Preferences.js
// STEP 2: User sets their requirements.
// Shows detected hand size, then asks for budget + priorities.
// Sends data to POST /recommend
// On success, calls onComplete(results).

import { useState } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

function Preferences({ handData, onComplete, onBack }) {

  // -------------------------------------------------------
  // STATE — user's preference inputs
  // -------------------------------------------------------
  const [budget,  setBudget]  = useState(40000);
  const [camera,  setCamera]  = useState(7);
  const [battery, setBattery] = useState(7);
  const [gaming,  setGaming]  = useState(5);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // -------------------------------------------------------
  // Submit preferences → get recommendations
  // -------------------------------------------------------
  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post(`${API}/recommend`, {
        budget:    parseInt(budget),
        camera:    camera,
        battery:   battery,
        gaming:    gaming,
        hand_size: handData.hand_size,
      });

      onComplete(response.data);

    } catch (err) {
      const msg = err.response?.data?.detail || "Something went wrong.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------
  // Slider component (reused for camera, battery, gaming)
  // -------------------------------------------------------
  function PrioritySlider({ label, value, onChange, description }) {
    const labels = ["", "Low", "Low", "Moderate", "Moderate", "Medium",
                    "Medium", "High", "High", "Very High", "Very High"];
    return (
      <div style={styles.sliderGroup}>
        <div style={styles.sliderHeader}>
          <span style={styles.sliderLabel}>{label}</span>
          <span style={styles.sliderValue}>{labels[value]} ({value}/10)</span>
        </div>
        <input
          type="range" min="1" max="10" value={value}
          onChange={(e) => onChange(parseInt(e.target.value))}
          style={styles.slider}
        />
        <p style={styles.sliderDesc}>{description}</p>
      </div>
    );
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div>
      <h2 style={styles.heading}>Your Preferences</h2>
      <p style={styles.subtext}>Tell us what matters most to you.</p>

      {/* Hand size result card */}
      <div style={styles.handCard}>
        <div style={styles.handCardLeft}>
          <span style={styles.handEmoji}>✋</span>
          <div>
            <p style={styles.handLabel}>Detected hand size</p>
            <p style={styles.handSize}>{handData?.hand_size}</p>
          </div>
        </div>
        <div style={styles.handCardRight}>
          <p style={styles.screenLabel}>Ideal screen</p>
          <p style={styles.screenRange}>
            {handData?.recommended_screen_min}″ – {handData?.recommended_screen_max}″
          </p>
        </div>
      </div>

      {/* Budget input */}
      <div style={styles.section}>
        <label style={styles.sectionLabel}>Budget (₹)</label>
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          min="5000"
          max="200000"
          step="1000"
          style={styles.budgetInput}
        />
        <div style={styles.budgetHints}>
          {[15000, 30000, 50000, 80000].map((b) => (
            <button
              key={b}
              style={{
                ...styles.budgetChip,
                ...(budget == b ? styles.budgetChipActive : {}),
              }}
              onClick={() => setBudget(b)}
            >
              ₹{(b/1000).toFixed(0)}K
            </button>
          ))}
        </div>
      </div>

      {/* Priority sliders */}
      <div style={styles.section}>
        <p style={styles.sectionLabel}>Priority levels</p>

        <PrioritySlider
          label="Camera"
          value={camera}
          onChange={setCamera}
          description="How important is photo and video quality?"
        />
        <PrioritySlider
          label="Battery"
          value={battery}
          onChange={setBattery}
          description="How important is long battery life?"
        />
        <PrioritySlider
          label="Gaming"
          value={gaming}
          onChange={setGaming}
          description="How much do you game on your phone?"
        />
      </div>

      {/* Error */}
      {error && <div style={styles.errorBox}>{error}</div>}

      {/* Buttons */}
      <div style={styles.btnRow}>
        <button style={styles.backBtn} onClick={onBack}>
          Back
        </button>
        <button
          style={{ ...styles.primaryBtn, opacity: loading ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Finding phones..." : "Find My Phone"}
        </button>
      </div>

    </div>
  );
}

const styles = {
  heading: {
    fontSize: "22px", fontWeight: "700",
    color: "#1f2937", margin: "0 0 8px 0",
  },
  subtext: { color: "#6b7280", fontSize: "15px", margin: "0 0 24px 0" },
  handCard: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    borderRadius: "12px", padding: "16px 20px",
    display: "flex", justifyContent: "space-between",
    alignItems: "center", marginBottom: "28px", color: "#fff",
  },
  handCardLeft:  { display: "flex", alignItems: "center", gap: "12px" },
  handEmoji:     { fontSize: "32px" },
  handLabel:     { fontSize: "12px", opacity: 0.8, margin: "0 0 2px 0" },
  handSize:      { fontSize: "20px", fontWeight: "700", margin: 0 },
  handCardRight: { textAlign: "right" },
  screenLabel:   { fontSize: "12px", opacity: 0.8, margin: "0 0 2px 0" },
  screenRange:   { fontSize: "16px", fontWeight: "600", margin: 0 },
  section: { marginBottom: "28px" },
  sectionLabel: {
    display: "block", fontWeight: "600",
    color: "#374151", fontSize: "15px", marginBottom: "12px",
  },
  budgetInput: {
    width: "100%", padding: "12px 14px",
    border: "2px solid #e5e7eb", borderRadius: "10px",
    fontSize: "18px", fontWeight: "600", color: "#1f2937",
    boxSizing: "border-box", marginBottom: "10px",
    outline: "none",
  },
  budgetHints: { display: "flex", gap: "8px", flexWrap: "wrap" },
  budgetChip: {
    padding: "6px 14px", border: "2px solid #e5e7eb",
    borderRadius: "20px", background: "#fff",
    fontSize: "13px", cursor: "pointer", color: "#374151",
  },
  budgetChipActive: {
    borderColor: "#6366f1", background: "#eef2ff", color: "#6366f1",
    fontWeight: "600",
  },
  sliderGroup: { marginBottom: "20px" },
  sliderHeader: {
    display: "flex", justifyContent: "space-between",
    marginBottom: "8px",
  },
  sliderLabel: { fontWeight: "600", color: "#374151", fontSize: "14px" },
  sliderValue: { color: "#6366f1", fontSize: "14px", fontWeight: "600" },
  slider: { width: "100%", accentColor: "#6366f1", cursor: "pointer" },
  sliderDesc: { color: "#9ca3af", fontSize: "12px", margin: "6px 0 0 0" },
  errorBox: {
    background: "#fef2f2", border: "1px solid #fca5a5",
    borderRadius: "8px", padding: "12px 16px",
    color: "#dc2626", fontSize: "14px", marginBottom: "16px",
  },
  btnRow: { display: "flex", gap: "12px" },
  backBtn: {
    flex: 1, padding: "14px", border: "2px solid #e5e7eb",
    borderRadius: "10px", background: "#fff",
    fontSize: "16px", fontWeight: "600",
    cursor: "pointer", color: "#374151",
  },
  primaryBtn: {
    flex: 2, padding: "14px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", border: "none", borderRadius: "10px",
    fontSize: "16px", fontWeight: "600", cursor: "pointer",
  },
};

export default Preferences;