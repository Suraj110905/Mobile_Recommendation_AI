// HandScan.js
// Live webcam hand detection using the browser camera.
// Captures a frame every 2 seconds → sends to FastAPI → shows live result.

import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

// How often to send a frame to the API (milliseconds)
const SCAN_INTERVAL_MS = 2000;

function HandScan({ onComplete }) {

  // -------------------------------------------------------
  // REFS — these hold values that don't cause re-renders
  // -------------------------------------------------------
  const videoRef    = useRef(null);   // the <video> element
  const canvasRef   = useRef(null);   // hidden canvas to grab frames
  const streamRef   = useRef(null);   // webcam stream (so we can stop it)
  const intervalRef = useRef(null);   // the repeating scan timer

  // -------------------------------------------------------
  // STATE
  // -------------------------------------------------------
  const [mode, setMode]             = useState("live");    // "live" or "upload"
  const [camStatus, setCamStatus]   = useState("idle");    // idle | starting | active | error
  const [scanResult, setScanResult] = useState(null);      // latest hand analysis
  const [scanning, setScanning]     = useState(false);     // is a scan in flight?
  const [confirmed, setConfirmed]   = useState(false);     // user clicked "Use This"
  const [camError, setCamError]     = useState(null);      // camera error message

  // Upload mode state
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview, setPreview]           = useState(null);
  const [uploading, setUploading]       = useState(false);
  const [uploadError, setUploadError]   = useState(null);

  // -------------------------------------------------------
  // START WEBCAM
  // -------------------------------------------------------
  const startCamera = useCallback(async () => {
    setCamStatus("starting");
    setCamError(null);
    setScanResult(null);

    try {
      // Ask browser for webcam permission
      // facingMode: "user" = front camera
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 }
      });

      streamRef.current = stream;

      // Attach stream to the <video> element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCamStatus("active");

    } catch (err) {
      // Common errors: user denied permission, no camera found
      console.error("Camera error:", err);
      setCamStatus("error");
      if (err.name === "NotAllowedError") {
        setCamError("Camera permission denied. Please allow camera access and try again.");
      } else if (err.name === "NotFoundError") {
        setCamError("No camera found on this device.");
      } else {
        setCamError("Could not start camera: " + err.message);
      }
    }
  }, []);

  // -------------------------------------------------------
  // STOP WEBCAM — clean up everything
  // -------------------------------------------------------
  const stopCamera = useCallback(() => {
    // Stop the scan loop
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop all webcam tracks (releases the camera)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Clear the video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCamStatus("idle");
  }, []);

  // -------------------------------------------------------
  // CAPTURE ONE FRAME and send to API
  // -------------------------------------------------------
  const captureAndScan = useCallback(async () => {
    // Don't scan if camera isn't ready or another scan is running
    if (!videoRef.current || !canvasRef.current) return;
    if (videoRef.current.readyState < 2) return;  // video not loaded yet
    if (scanning) return;

    setScanning(true);

    try {
      const video  = videoRef.current;
      const canvas = canvasRef.current;

      // Draw the current video frame onto the hidden canvas
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");

      // Mirror the image (front camera is flipped)
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      // Convert canvas to a JPEG blob (file-like object)
      const blob = await new Promise(resolve =>
        canvas.toBlob(resolve, "image/jpeg", 0.85)
      );

      if (!blob) return;

      // Send blob to FastAPI just like a file upload
      const formData = new FormData();
      formData.append("file", blob, "hand_scan.jpg");

      const response = await axios.post(`${API}/analyze-hand`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 5000,  // 5 second timeout per scan
      });

      setScanResult(response.data);

    } catch (err) {
      // Silently ignore failed scans — just try again next interval
      // Only show error if hand not detected (422 from API)
      if (err.response?.status === 422) {
        setScanResult(null);  // clear result — no hand visible
      }
    } finally {
      setScanning(false);
    }
  }, [scanning]);

  // -------------------------------------------------------
  // START SCAN LOOP once camera is active
  // -------------------------------------------------------
  useEffect(() => {
    if (camStatus === "active") {
      // Run first scan immediately, then every SCAN_INTERVAL_MS
      captureAndScan();
      intervalRef.current = setInterval(captureAndScan, SCAN_INTERVAL_MS);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [camStatus, captureAndScan]);

  // -------------------------------------------------------
  // CLEANUP on unmount (when user navigates away)
  // -------------------------------------------------------
  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // -------------------------------------------------------
  // USER CONFIRMS THE DETECTED HAND SIZE
  // -------------------------------------------------------
  function handleConfirm() {
    if (!scanResult) return;
    setConfirmed(true);
    stopCamera();
    onComplete(scanResult);
  }

  // -------------------------------------------------------
  // UPLOAD MODE handlers (fallback)
  // -------------------------------------------------------
  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadError(null);
    setPreview(URL.createObjectURL(file));
  }

  async function handleUpload() {
    if (!selectedFile) { setUploadError("Please select an image."); return; }
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await axios.post(`${API}/analyze-hand`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onComplete(response.data);
    } catch (err) {
      setUploadError(err.response?.data?.detail || "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  // -------------------------------------------------------
  // HAND SIZE COLOR
  // -------------------------------------------------------
  const sizeColors = {
    Small:  "#10b981",
    Medium: "#6366f1",
    Large:  "#f59e0b",
  };

  // -------------------------------------------------------
  // RENDER
  // -------------------------------------------------------
  return (
    <div>
      <h2 style={styles.heading}>Scan Your Hand</h2>
      <p style={styles.subtext}>
        Hold your open palm in front of the camera. The AI will detect your hand size live.
      </p>

      {/* Mode toggle */}
      <div style={styles.modeToggle}>
        <button
          style={{ ...styles.modeBtn, ...(mode === "live" ? styles.modeBtnActive : {}) }}
          onClick={() => { setMode("live"); stopCamera(); setScanResult(null); }}
        >
          Live Camera
        </button>
        <button
          style={{ ...styles.modeBtn, ...(mode === "upload" ? styles.modeBtnActive : {}) }}
          onClick={() => { setMode("upload"); stopCamera(); setScanResult(null); }}
        >
          Upload Photo
        </button>
        <button
          style={{ ...styles.modeBtn, ...(mode === "manual" ? styles.modeBtnActive : {}) }}
          onClick={() => { setMode("manual"); stopCamera(); setScanResult(null); }}
        >
          Pick Manually
        </button>
      </div>

      {/* ======== LIVE CAMERA MODE ======== */}
      {mode === "live" && (
        <div>

          {/* Video box */}
          <div style={styles.videoBox}>

            {/* The actual webcam feed */}
            <video
              ref={videoRef}
              style={{
                ...styles.video,
                display: camStatus === "active" ? "block" : "none",
                transform: "scaleX(-1)",  // mirror for front camera
              }}
              playsInline
              muted
            />

            {/* Hidden canvas used to capture frames — never shown */}
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {/* Overlay shown when camera is not active */}
            {camStatus !== "active" && (
              <div style={styles.videoPlaceholder}>
                {camStatus === "idle" && (
                  <>
                    <div style={styles.camIcon}>📷</div>
                    <p style={styles.placeholderText}>Camera not started</p>
                    <p style={styles.placeholderHint}>Click the button below to begin</p>
                  </>
                )}
                {camStatus === "starting" && (
                  <>
                    <div style={styles.spinner} />
                    <p style={styles.placeholderText}>Starting camera...</p>
                  </>
                )}
                {camStatus === "error" && (
                  <>
                    <div style={styles.camIcon}>⚠️</div>
                    <p style={styles.placeholderText}>Camera error</p>
                    <p style={styles.placeholderHint}>{camError}</p>
                  </>
                )}
              </div>
            )}

            {/* Live scanning indicator — top left corner */}
            {camStatus === "active" && (
              <div style={styles.scanBadge}>
                <div style={{
                  ...styles.scanDot,
                  background: scanning ? "#f59e0b" : "#10b981",
                }} />
                {scanning ? "Scanning..." : "Live"}
              </div>
            )}

            {/* Hand result overlay — bottom of video */}
            {camStatus === "active" && scanResult && (
              <div style={styles.resultOverlay}>
                <span style={{
                  ...styles.handSizeBadge,
                  background: sizeColors[scanResult.hand_size] || "#6366f1",
                }}>
                  {scanResult.hand_size} Hand
                </span>
                <span style={styles.screenText}>
                  Ideal screen: {scanResult.recommended_screen_min}"–{scanResult.recommended_screen_max}"
                </span>
              </div>
            )}

            {/* No hand detected message */}
            {camStatus === "active" && !scanResult && !scanning && (
              <div style={styles.noHandOverlay}>
                Show your open palm to the camera
              </div>
            )}
          </div>

          {/* Tips */}
          <div style={styles.tips}>
            <p style={styles.tipsTitle}>For best detection:</p>
            <ul style={styles.tipsList}>
              <li>Hold hand flat, fingers spread, facing the camera</li>
              <li>Good lighting — avoid shadows on your palm</li>
              <li>Keep hand still for a moment while scanning</li>
            </ul>
          </div>

          {/* Buttons */}
          {camStatus === "idle" || camStatus === "error" ? (
            <button style={styles.primaryBtn} onClick={startCamera}>
              Start Camera
            </button>
          ) : (
            <div style={styles.btnRow}>
              <button style={styles.stopBtn} onClick={stopCamera}>
                Stop Camera
              </button>
              <button
                style={{
                  ...styles.primaryBtn,
                  flex: 2,
                  opacity: scanResult ? 1 : 0.4,
                }}
                onClick={handleConfirm}
                disabled={!scanResult}
              >
                {scanResult
                  ? `Use ${scanResult.hand_size} Hand →`
                  : "Waiting for hand detection..."}
              </button>
            </div>
          )}

          {/* Detected measurements (shown when hand found) */}
          {scanResult && (
            <div style={styles.metricsRow}>
              <div style={styles.metric}>
                <span style={styles.metricVal}>{scanResult.ratio?.toFixed(2)}</span>
                <span style={styles.metricLabel}>Ratio</span>
              </div>
              <div style={styles.metric}>
                <span style={styles.metricVal}>{scanResult.hand_length?.toFixed(3)}</span>
                <span style={styles.metricLabel}>Hand length</span>
              </div>
              <div style={styles.metric}>
                <span style={styles.metricVal}>{scanResult.palm_width?.toFixed(3)}</span>
                <span style={styles.metricLabel}>Palm width</span>
              </div>
            </div>
          )}

        </div>
      )}

      {/* ======== UPLOAD MODE ======== */}
      {mode === "upload" && (
        <div>
          <label style={styles.uploadBox}>
            {preview
              ? <img src={preview} alt="Hand" style={styles.preview} />
              : (
                <div style={styles.uploadPlaceholder}>
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>✋</div>
                  <p style={{ color: "#374151", fontWeight: "600", margin: "0 0 6px" }}>
                    Click to select a hand photo
                  </p>
                  <p style={{ color: "#9ca3af", fontSize: "13px", margin: 0 }}>
                    JPG or PNG • Flat open palm • Good lighting
                  </p>
                </div>
              )
            }
            <input type="file" accept="image/*" onChange={handleFileChange}
              style={{ display: "none" }} />
          </label>
          {uploadError && <div style={styles.errorBox}>{uploadError}</div>}
          <button
            style={{ ...styles.primaryBtn, opacity: uploading || !selectedFile ? 0.5 : 1 }}
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
          >
            {uploading ? "Analyzing..." : "Analyze Photo"}
          </button>
        </div>
      )}

      {/* ======== MANUAL MODE ======== */}
      {mode === "manual" && (
        <div>
          <p style={{ color: "#374151", fontWeight: "600", marginBottom: "12px" }}>
            Select your hand size:
          </p>
          {[
            { size: "Small",  desc: "Hand length up to 17cm • Screen: 4.7–6.1\"" },
            { size: "Medium", desc: "Hand length 17–19cm  • Screen: 6.1–6.5\""  },
            { size: "Large",  desc: "Hand length 19cm+    • Screen: 6.5–6.9\""  },
          ].map(({ size, desc }) => (
            <div
              key={size}
              style={{
                ...styles.sizeCard,
                borderColor: scanResult?.hand_size === size ? "#6366f1" : "#e5e7eb",
                background:  scanResult?.hand_size === size ? "#eef2ff" : "#fff",
              }}
              onClick={() => setScanResult({
                hand_size: size,
                recommended_screen_min: size === "Small" ? 4.7 : size === "Medium" ? 6.1 : 6.5,
                recommended_screen_max: size === "Small" ? 6.1 : size === "Medium" ? 6.5 : 6.9,
                source: "manual",
              })}
            >
              <div>
                <div style={{ fontWeight: "600", color: "#1f2937" }}>{size}</div>
                <div style={{ color: "#6b7280", fontSize: "13px" }}>{desc}</div>
              </div>
              <div style={{ fontSize: "20px", color: "#6366f1" }}>
                {scanResult?.hand_size === size ? "●" : "○"}
              </div>
            </div>
          ))}
          <button
            style={{ ...styles.primaryBtn, opacity: scanResult ? 1 : 0.4, marginTop: "8px" }}
            onClick={() => scanResult && onComplete(scanResult)}
            disabled={!scanResult}
          >
            {scanResult ? `Continue with ${scanResult.hand_size} Hand →` : "Select a size above"}
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
  subtext: { color: "#6b7280", fontSize: "15px", margin: "0 0 20px 0" },
  modeToggle: {
    display: "flex", background: "#f3f4f6",
    borderRadius: "10px", padding: "4px", marginBottom: "20px",
  },
  modeBtn: {
    flex: 1, padding: "8px 4px", border: "none",
    background: "transparent", borderRadius: "8px",
    fontSize: "13px", cursor: "pointer", color: "#6b7280",
  },
  modeBtnActive: {
    background: "#fff", color: "#6366f1", fontWeight: "600",
    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  videoBox: {
    position: "relative", background: "#000",
    borderRadius: "12px", overflow: "hidden",
    aspectRatio: "4/3", marginBottom: "16px",
    display: "flex", alignItems: "center", justifyContent: "center",
  },
  video: {
    width: "100%", height: "100%",
    objectFit: "cover", display: "block",
  },
  videoPlaceholder: {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "40px 20px", textAlign: "center", color: "#fff",
  },
  camIcon:       { fontSize: "48px", marginBottom: "12px" },
  placeholderText: { fontSize: "16px", fontWeight: "600", margin: "0 0 8px" },
  placeholderHint: { fontSize: "13px", color: "#9ca3af", margin: 0, maxWidth: "300px" },
  spinner: {
    width: "40px", height: "40px",
    border: "3px solid rgba(255,255,255,0.2)",
    borderTopColor: "#fff", borderRadius: "50%",
    animation: "spin 0.8s linear infinite", marginBottom: "12px",
  },
  scanBadge: {
    position: "absolute", top: "12px", left: "12px",
    background: "rgba(0,0,0,0.6)", color: "#fff",
    padding: "4px 10px", borderRadius: "20px",
    fontSize: "12px", display: "flex", alignItems: "center", gap: "6px",
  },
  scanDot: {
    width: "8px", height: "8px", borderRadius: "50%",
    transition: "background 0.3s",
  },
  resultOverlay: {
    position: "absolute", bottom: "0", left: "0", right: "0",
    background: "linear-gradient(transparent, rgba(0,0,0,0.8))",
    padding: "24px 16px 16px",
    display: "flex", alignItems: "center", gap: "10px",
  },
  handSizeBadge: {
    color: "#fff", padding: "4px 14px", borderRadius: "20px",
    fontSize: "14px", fontWeight: "700",
  },
  screenText: { color: "rgba(255,255,255,0.85)", fontSize: "13px" },
  noHandOverlay: {
    position: "absolute", bottom: "16px", left: "50%",
    transform: "translateX(-50%)",
    background: "rgba(0,0,0,0.6)", color: "#fff",
    padding: "8px 16px", borderRadius: "20px", fontSize: "13px",
    whiteSpace: "nowrap",
  },
  tips: {
    background: "#eff6ff", borderRadius: "10px",
    padding: "12px 16px", marginBottom: "16px",
  },
  tipsTitle: {
    color: "#1d4ed8", fontWeight: "600",
    fontSize: "13px", margin: "0 0 6px 0",
  },
  tipsList: {
    color: "#374151", fontSize: "13px",
    margin: 0, paddingLeft: "20px", lineHeight: "1.8",
  },
  btnRow: { display: "flex", gap: "10px" },
  primaryBtn: {
    width: "100%", padding: "14px",
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    color: "#fff", border: "none", borderRadius: "10px",
    fontSize: "15px", fontWeight: "600", cursor: "pointer",
  },
  stopBtn: {
    flex: 1, padding: "14px",
    border: "2px solid #e5e7eb", background: "#fff",
    borderRadius: "10px", fontSize: "15px",
    fontWeight: "600", cursor: "pointer", color: "#374151",
  },
  metricsRow: {
    display: "flex", gap: "10px", marginTop: "12px",
  },
  metric: {
    flex: 1, background: "#f8fafc", borderRadius: "10px",
    padding: "12px", textAlign: "center",
    display: "flex", flexDirection: "column", gap: "4px",
  },
  metricVal:   { fontSize: "18px", fontWeight: "700", color: "#6366f1" },
  metricLabel: { fontSize: "11px", color: "#9ca3af" },
  uploadBox: {
    display: "block", border: "2px dashed #d1d5db",
    borderRadius: "12px", cursor: "pointer",
    overflow: "hidden", marginBottom: "16px", minHeight: "200px",
  },
  uploadPlaceholder: {
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "40px 20px", textAlign: "center",
  },
  preview: {
    width: "100%", maxHeight: "300px",
    objectFit: "cover", display: "block",
  },
  errorBox: {
    background: "#fef2f2", border: "1px solid #fca5a5",
    borderRadius: "8px", padding: "12px 16px",
    color: "#dc2626", fontSize: "14px", marginBottom: "12px",
  },
  sizeCard: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    border: "2px solid #e5e7eb", borderRadius: "10px",
    padding: "16px", marginBottom: "10px",
    cursor: "pointer",
  },
};

// Add the spinner keyframe globally (only once)
const styleTag = document.createElement("style");
styleTag.innerHTML = `@keyframes spin { to { transform: rotate(360deg); } }`;
document.head.appendChild(styleTag);

export default HandScan;