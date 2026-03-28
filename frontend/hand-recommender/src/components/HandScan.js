// HandScan.js
// STEP 1: User uploads a hand photo OR picks hand size manually.
// Sends image to POST /analyze-hand
// On success, calls onComplete(handData) to move to Step 2.

import { useState } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

function HandScan({ onComplete }) {

  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------
  const [mode, setMode]           = useState("upload"); // "upload" or "manual"
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview]     = useState(null);     // image preview URL
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [manualSize, setManualSize] = useState("Medium");

  // -------------------------------------------------------
  // When user picks a file — show preview
  // -------------------------------------------------------
  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setError(null);

    // Create a local URL so we can preview the image
    const url = URL.createObjectURL(file);
    setPreview(url);
  }

  // -------------------------------------------------------
  // Upload image to API and get hand size back
  // -------------------------------------------------------
  async function handleUpload() {
    if (!selectedFile) {
      setError("Please select an image first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // FormData is how you send a file to an API
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await axios.post(`${API}/analyze-hand`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      // Success — pass result up to App.js
      onComplete(response.data);

    } catch (err) {
      // Show the error message from the API if there is one
      const msg = err.response?.data?.detail || "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------
  // Manual mode — user just picks Small/Medium/Large
  // -------------------------------------------------------
  function handleManual() {
    const screenRanges = {
      Small:  { min: 4.7, max: 6.1 },
      Medium: { min: 6.1, max: 6.5 },
      Large:  { min: 6.5, max: 6.9 },
    };
    const screen = screenRanges[manualSize];

    onComplete({
      hand_size: manualSize,
      ratio: manualSize === "Small" ? 1.3 : manualSize === "Medium" ? 1.6 : 1.9,
      recommended_screen_min: screen.min,
      recommended_screen_max: screen.max,
      source: "manual",
    });
  }

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div>
      <h2 style={styles.heading}>Scan Your Hand</h2>
      <p style={styles.subtext}>
        Upload a photo of your hand so we can find phones that fit perfectly.
      </p>

      {/* Mode toggle */}
      <div style={styles.modeToggle}>
        <button
          style={{ ...styles.modeBtn, ...(mode === "upload" ? styles.modeBtnActive : {}) }}
          onClick={() => setMode("upload")}
        >
          Upload Photo
        </button>
        <button
          style={{ ...styles.modeBtn, ...(mode === "manual" ? styles.modeBtnActive : {}) }}
          onClick={() => setMode("manual")}
        >
          Pick Manually
        </button>
      </div>

      {/* ---- UPLOAD MODE ---- */}
      {mode === "upload" && (
        <div>
          {/* Upload area */}
          <label style={styles.uploadBox}>
            {preview ? (
              <img src={preview} alt="Hand preview" style={styles.preview} />
            ) : (
              <div style={styles.uploadPlaceholder}>
                <div style={styles.uploadIcon}>✋</div>
                <p style={styles.uploadText}>Click to select a hand photo</p>
                <p style={styles.uploadHint}>JPG or PNG • Good lighting • Flat open palm</p>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>

          {/* Tips */}
          <div style={styles.tips}>
            <p style={styles.tipsTitle}>Tips for best results:</p>
            <ul style={styles.tipsList}>
              <li>Lay your hand flat on a white surface</li>
              <li>Fingers together, palm facing up</li>
              <li>Good lighting — no shadows</li>
            </ul>
          </div>

          {/* Error */}
          {error && <div style={styles.errorBox}>{error}</div>}

          {/* Upload button */}
          <button
            style={{
              ...styles.primaryBtn,
              opacity: loading || !selectedFile ? 0.6 : 1,
            }}
            onClick={handleUpload}
            disabled={loading || !selectedFile}
          >
            {loading ? "Analyzing hand..." : "Analyze My Hand"}
          </button>
        </div>
      )}

      {/* ---- MANUAL MODE ---- */}
      {mode === "manual" && (
        <div>
          <p style={styles.manualLabel}>Select your hand size:</p>

          {["Small", "Medium", "Large"].map((size) => (
            <div
              key={size}
              style={{
                ...styles.sizeCard,
                ...(manualSize === size ? styles.sizeCardActive : {}),
              }}
              onClick={() => setManualSize(size)}
            >
              <div style={styles.sizeInfo}>
                <span style={styles.sizeName}>{size}</span>
                <span style={styles.sizeDesc}>
                  {size === "Small"  && "Hand length up to 17cm • Screen: 4.7–6.1\""}
                  {size === "Medium" && "Hand length 17–19cm • Screen: 6.1–6.5\""}
                  {size === "Large"  && "Hand length 19cm+ • Screen: 6.5–6.9\""}
                </span>
              </div>
              <div style={styles.sizeRadio}>
                {manualSize === size ? "●" : "○"}
              </div>
            </div>
          ))}

          <button style={styles.primaryBtn} onClick={handleManual}>
            Continue with {manualSize} Hand
          </button>
        </div>
      )}

    </div>
  );
}

// -------------------------------------------------------
// STYLES
// -------------------------------------------------------
const styles = {
  heading: {
    fontSize: "22px", fontWeight: "700",
    color: "#1f2937", margin: "0 0 8px 0",
  },
  subtext: {
    color: "#6b7280", fontSize: "15px", margin: "0 0 24px 0",
  },
  modeToggle: {
    display: "flex", background: "#f3f4f6",
    borderRadius: "10px", padding: "4px",
    marginBottom: "24px",
  },
  modeBtn: {
    flex: 1, padding: "8px", border: "none",
    background: "transparent", borderRadius: "8px",
    fontSize: "14px", cursor: "pointer", color: "#6b7280",
  },
  modeBtnActive: {
    background: "#fff", color: "#6366f1",
    fontWeight: "600",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  uploadBox: {
    display: "block", border: "2px dashed #d1d5db",
    borderRadius: "12px", cursor: "pointer",
    overflow: "hidden", marginBottom: "16px",
    minHeight: "200px",
    transition: "border-color 0.2s",
  },
  uploadPlaceholder: {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "40px 20px", textAlign: "center",
  },
  uploadIcon: { fontSize: "48px", marginBottom: "12px" },
  uploadText: {
    color: "#374151", fontWeight: "600",
    fontSize: "15px", margin: "0 0 6px 0",
  },
  uploadHint: { color: "#9ca3af", fontSize: "13px", margin: 0 },
  preview: {
    width: "100%", maxHeight: "300px",
    objectFit: "cover", display: "block",
  },
  tips: {
    background: "#eff6ff", borderRadius: "10px",
    padding: "14px 16px", marginBottom: "20px",
  },
  tipsTitle: {
    color: "#1d4ed8", fontWeight: "600",
    fontSize: "13px", margin: "0 0 8px 0",
  },
  tipsList: {
    color: "#374151", fontSize: "13px",
    margin: 0, paddingLeft: "20px", lineHeight: "1.8",
  },
  errorBox: {
    background: "#fef2f2", border: "1px solid #fca5a5",
    borderRadius: "8px", padding: "12px 16px",
    color: "#dc2626", fontSize: "14px", marginBottom: "16px",
  },
  primaryBtn: {
    width: "100%", padding: "14px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", border: "none", borderRadius: "10px",
    fontSize: "16px", fontWeight: "600", cursor: "pointer",
  },
  manualLabel: {
    color: "#374151", fontWeight: "600",
    fontSize: "15px", marginBottom: "12px",
  },
  sizeCard: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    border: "2px solid #e5e7eb", borderRadius: "10px",
    padding: "16px", marginBottom: "10px",
    cursor: "pointer", transition: "all 0.2s",
  },
  sizeCardActive: {
    borderColor: "#6366f1", background: "#eef2ff",
  },
  sizeInfo: { display: "flex", flexDirection: "column", gap: "4px" },
  sizeName: { fontWeight: "600", color: "#1f2937", fontSize: "15px" },
  sizeDesc: { color: "#6b7280", fontSize: "13px" },
  sizeRadio: { fontSize: "20px", color: "#6366f1" },
};

export default HandScan;