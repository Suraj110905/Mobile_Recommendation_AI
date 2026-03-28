import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8000";
const SCAN_INTERVAL_MS  = 1500;  // scan every 1.5 seconds
const HOLD_REQUIRED_MS  = 3000;  // hold hand for 3 seconds to auto-confirm
const HOLD_TICK_MS      = 100;   // countdown updates every 100ms

function HandScan({ onComplete }) {

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);   // hidden — for capturing frames
  const overlayRef  = useRef(null);   // visible — for drawing landmarks + ring
  const streamRef   = useRef(null);
  const scanTimerRef  = useRef(null); // repeating scan interval
  const holdTimerRef  = useRef(null); // countdown interval
  const holdStartRef  = useRef(null); // when the hold started

  const [camStatus,   setCamStatus]   = useState("idle");
  const [scanResult,  setScanResult]  = useState(null);
  const [scanning,    setScanning]    = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);   // 0–100
  const [confirmed,   setConfirmed]   = useState(false);
  const [camError,    setCamError]    = useState(null);

  // upload / manual state
  const [mode,         setMode]        = useState("live");
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview,      setPreview]     = useState(null);
  const [uploading,    setUploading]   = useState(false);
  const [uploadError,  setUploadError] = useState(null);
  const [manualSize,   setManualSize]  = useState(null);

  // ─── DRAW OVERLAY (landmark dots + connections + ring) ──────────────────
  const drawOverlay = useCallback((landmarks, progress) => {
    const canvas = overlayRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    canvas.width  = video.clientWidth  || 640;
    canvas.height = video.clientHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── LANDMARK DOTS AND CONNECTIONS ──────────────────────────────────────
    // landmarks come as normalized 0–1 values from the API
    if (landmarks && landmarks.length > 0) {
      const W = canvas.width;
      const H = canvas.height;

      // Convert normalized coords → pixel coords
      // Also mirror X because the video is CSS-mirrored (scaleX(-1))
      const pts = landmarks.map(lm => ({
        x: (1 - lm.x) * W,   // mirrored
        y: lm.y * H,
      }));

      // Hand skeleton connections (MediaPipe standard)
      const connections = [
        [0,1],[1,2],[2,3],[3,4],         // thumb
        [0,5],[5,6],[6,7],[7,8],         // index
        [0,9],[9,10],[10,11],[11,12],    // middle
        [0,13],[13,14],[14,15],[15,16],  // ring
        [0,17],[17,18],[18,19],[19,20],  // pinky
        [5,9],[9,13],[13,17],            // palm
      ];

      // Draw connection lines
      ctx.strokeStyle = "rgba(99,102,241,0.7)";
      ctx.lineWidth   = 2;
      connections.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(pts[a].x, pts[a].y);
        ctx.lineTo(pts[b].x, pts[b].y);
        ctx.stroke();
      });

      // Draw landmark dots
      pts.forEach((pt, i) => {
        // Fingertips (4,8,12,16,20) are larger and brighter
        const isTip = [4, 8, 12, 16, 20].includes(i);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, isTip ? 7 : 4, 0, 2 * Math.PI);
        ctx.fillStyle   = isTip ? "#a78bfa" : "rgba(99,102,241,0.9)";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth   = 1.5;
        ctx.stroke();
      });

      // ── CIRCULAR COUNTDOWN RING ──────────────────────────────────────────
      // Drawn around the wrist point (landmark 0)
      if (progress > 0) {
        const cx = pts[0].x;
        const cy = pts[0].y;
        const r  = 28;
        const startAngle = -Math.PI / 2;           // start at top
        const endAngle   = startAngle + (2 * Math.PI * progress / 100);

        // Background ring (gray)
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth   = 5;
        ctx.stroke();

        // Progress ring (green → fills clockwise)
        ctx.beginPath();
        ctx.arc(cx, cy, r, startAngle, endAngle);
        ctx.strokeStyle = progress >= 100 ? "#10b981" : "#a78bfa";
        ctx.lineWidth   = 5;
        ctx.lineCap     = "round";
        ctx.stroke();

        // Percentage text in center
        ctx.fillStyle   = "#fff";
        ctx.font        = "bold 11px sans-serif";
        ctx.textAlign   = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${Math.round(progress)}%`, cx, cy);
      }
    }
  }, []);

  // ─── CLEAR OVERLAY ──────────────────────────────────────────────────────
  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ─── STOP HOLD COUNTDOWN ────────────────────────────────────────────────
  const stopHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdStartRef.current = null;
    setHoldProgress(0);
  }, []);

  // ─── START HOLD COUNTDOWN ───────────────────────────────────────────────
  // Starts a 3-second countdown. If it completes → auto-confirm.
  const startHoldTimer = useCallback((result) => {
    if (holdTimerRef.current) return; // already running
    holdStartRef.current = Date.now();

    holdTimerRef.current = setInterval(() => {
      const elapsed  = Date.now() - holdStartRef.current;
      const progress = Math.min(100, (elapsed / HOLD_REQUIRED_MS) * 100);
      setHoldProgress(progress);

      if (progress >= 100) {
        clearInterval(holdTimerRef.current);
        holdTimerRef.current = null;
        // Auto-confirm — stop camera and move to next step
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (scanTimerRef.current) {
          clearInterval(scanTimerRef.current);
          scanTimerRef.current = null;
        }
        setConfirmed(true);
        setCamStatus("idle");
        onComplete(result);
      }
    }, HOLD_TICK_MS);
  }, [onComplete]);

  // ─── CAPTURE FRAME AND SCAN ─────────────────────────────────────────────
  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (videoRef.current.readyState < 2)          return;
    if (scanning) return;

    setScanning(true);
    try {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");

      // Mirror the frame (front camera)
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.85));
      if (!blob) return;

      const formData = new FormData();
      formData.append("file", blob, "frame.jpg");

      const res = await axios.post(`${API}/analyze-hand`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 4000,
      });

      const data = res.data;
      setScanResult(data);

      // Draw landmarks on the overlay canvas
      if (data.landmarks) {
        drawOverlay(data.landmarks, holdTimerRef.current
          ? (Date.now() - holdStartRef.current) / HOLD_REQUIRED_MS * 100
          : 0
        );
      }

      // Start the hold countdown if not already running
      startHoldTimer(data);

    } catch (err) {
      // Hand not detected — reset everything
      setScanResult(null);
      stopHoldTimer();
      clearOverlay();
    } finally {
      setScanning(false);
    }
  }, [scanning, drawOverlay, startHoldTimer, stopHoldTimer, clearOverlay]);

  // ─── UPDATE OVERLAY RING on each tick ───────────────────────────────────
  useEffect(() => {
    if (scanResult?.landmarks && holdProgress > 0) {
      drawOverlay(scanResult.landmarks, holdProgress);
    }
  }, [holdProgress, scanResult, drawOverlay]);

  // ─── START SCAN LOOP ────────────────────────────────────────────────────
  useEffect(() => {
    if (camStatus === "active") {
      captureAndScan();
      scanTimerRef.current = setInterval(captureAndScan, SCAN_INTERVAL_MS);
    }
    return () => {
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
    };
  }, [camStatus]); // eslint-disable-line

  // ─── CLEANUP on unmount ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (streamRef.current)   streamRef.current.getTracks().forEach(t => t.stop());
      if (scanTimerRef.current) clearInterval(scanTimerRef.current);
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  // ─── START CAMERA ────────────────────────────────────────────────────────
  const startCamera = async () => {
    setCamStatus("starting");
    setCamError(null);
    setScanResult(null);
    stopHoldTimer();
    clearOverlay();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamStatus("active");
    } catch (err) {
      setCamStatus("error");
      setCamError(
        err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow access and try again."
          : err.name === "NotFoundError"
          ? "No camera found on this device."
          : "Could not start camera: " + err.message
      );
    }
  };

  // ─── STOP CAMERA ────────────────────────────────────────────────────────
  const stopCamera = () => {
    if (scanTimerRef.current)  clearInterval(scanTimerRef.current);
    if (holdTimerRef.current)  clearInterval(holdTimerRef.current);
    if (streamRef.current)     streamRef.current.getTracks().forEach(t => t.stop());
    scanTimerRef.current = null;
    holdTimerRef.current = null;
    streamRef.current    = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamStatus("idle");
    setScanResult(null);
    setHoldProgress(0);
    clearOverlay();
  };

  // ─── UPLOAD MODE ────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setUploadError(null);
    setPreview(URL.createObjectURL(file));
  };

  const handleUpload = async () => {
    if (!selectedFile) { setUploadError("Please select an image."); return; }
    setUploading(true);
    setUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await axios.post(`${API}/analyze-hand`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onComplete(res.data);
    } catch (err) {
      setUploadError(err.response?.data?.detail || "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const sizeColors = { Small: "#10b981", Medium: "#6366f1", Large: "#f59e0b" };
  const secondsLeft = holdProgress > 0
    ? Math.ceil((HOLD_REQUIRED_MS - (holdProgress / 100 * HOLD_REQUIRED_MS)) / 1000)
    : 3;

  // ─── RENDER ─────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 style={S.heading}>Scan Your Hand</h2>
      <p style={S.subtext}>
        Hold your open palm steady — it auto-confirms after 3 seconds.
      </p>

      {/* Mode toggle */}
      <div style={S.toggle}>
        {["live", "upload", "manual"].map(m => (
          <button key={m} style={{ ...S.toggleBtn, ...(mode === m ? S.toggleActive : {}) }}
            onClick={() => { stopCamera(); setMode(m); setScanResult(null); setManualSize(null); }}>
            {m === "live" ? "Live Camera" : m === "upload" ? "Upload Photo" : "Pick Manually"}
          </button>
        ))}
      </div>

      {/* ═══ LIVE MODE ═══════════════════════════════════════════════════ */}
      {mode === "live" && (
        <div>
          {/* Video wrapper — position:relative so overlay sits on top */}
          <div style={S.videoWrap}>

            <video ref={videoRef} playsInline muted
              style={{ ...S.video, display: camStatus === "active" ? "block" : "none" }} />

            {/* Overlay canvas — same size as video, drawn on top */}
            <canvas ref={overlayRef} style={S.overlay} />

            {/* Hidden capture canvas */}
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {/* Placeholder when camera off */}
            {camStatus !== "active" && (
              <div style={S.placeholder}>
                {camStatus === "starting" && (
                  <><div style={S.spinner} /><p style={S.phText}>Starting camera...</p></>
                )}
                {camStatus === "idle" && (
                  <><div style={S.camEmoji}>📷</div>
                  <p style={S.phText}>Camera not started</p>
                  <p style={S.phHint}>Click Start Camera below</p></>
                )}
                {camStatus === "error" && (
                  <><div style={S.camEmoji}>⚠️</div>
                  <p style={S.phText}>Camera error</p>
                  <p style={S.phHint}>{camError}</p></>
                )}
              </div>
            )}

            {/* Live / Scanning badge — top left */}
            {camStatus === "active" && (
              <div style={S.liveBadge}>
                <div style={{ ...S.liveDot, background: scanning ? "#f59e0b" : "#10b981" }} />
                {scanning ? "Scanning..." : "Live"}
              </div>
            )}

            {/* Hand detected result — bottom overlay */}
            {camStatus === "active" && scanResult && (
              <div style={S.resultBar}>
                <span style={{ ...S.sizePill, background: sizeColors[scanResult.hand_size] || "#6366f1" }}>
                  {scanResult.hand_size} Hand
                </span>
                <span style={S.screenHint}>
                  {scanResult.recommended_screen_min}"–{scanResult.recommended_screen_max}"
                </span>
                {/* Countdown text */}
                <span style={S.countdown}>
                  {holdProgress > 0
                    ? holdProgress >= 99 ? "✓ Confirmed!" : `Hold ${secondsLeft}s...`
                    : "Hold steady"}
                </span>
              </div>
            )}

            {/* No hand prompt */}
            {camStatus === "active" && !scanResult && (
              <div style={S.noHand}>Show your open palm to the camera</div>
            )}

            {/* Pulse ring animation on video border when hand detected */}
            {camStatus === "active" && scanResult && (
              <div style={{
                ...S.pulseRing,
                borderColor: holdProgress >= 99 ? "#10b981" : "#6366f1",
                animationPlayState: holdProgress >= 99 ? "paused" : "running",
              }} />
            )}
          </div>

          {/* Tips */}
          <div style={S.tips}>
            <p style={S.tipsTitle}>For best detection:</p>
            <ul style={S.tipsList}>
              <li>Spread fingers, palm flat facing camera</li>
              <li>Keep hand still for 3 seconds — it auto-confirms</li>
              <li>Good lighting, plain background works best</li>
            </ul>
          </div>

          {/* Buttons */}
          {(camStatus === "idle" || camStatus === "error") ? (
            <button style={S.primaryBtn} onClick={startCamera}>Start Camera</button>
          ) : (
            <div style={S.btnRow}>
              <button style={S.stopBtn} onClick={stopCamera}>Stop</button>
              <button
                style={{ ...S.primaryBtn, flex: 2, opacity: scanResult ? 1 : 0.4 }}
                onClick={() => scanResult && onComplete(scanResult)}
                disabled={!scanResult}
              >
                {scanResult ? `Use ${scanResult.hand_size} Hand →` : "Waiting for hand..."}
              </button>
            </div>
          )}

          {/* Live measurement numbers */}
          {scanResult && (
            <div style={S.metrics}>
              {[
                { label: "Ratio",       val: scanResult.ratio?.toFixed(2) },
                { label: "Hand length", val: scanResult.hand_length?.toFixed(3) },
                { label: "Palm width",  val: scanResult.palm_width?.toFixed(3) },
              ].map(({ label, val }) => (
                <div key={label} style={S.metric}>
                  <span style={S.metricVal}>{val}</span>
                  <span style={S.metricLbl}>{label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ UPLOAD MODE ════════════════════════════════════════════════ */}
      {mode === "upload" && (
        <div>
          <label style={S.uploadBox}>
            {preview
              ? <img src={preview} alt="Hand" style={S.preview} />
              : <div style={S.uploadPh}>
                  <div style={{ fontSize: "48px", marginBottom: "12px" }}>✋</div>
                  <p style={{ color: "#374151", fontWeight: "600", margin: "0 0 6px" }}>
                    Click to select a hand photo
                  </p>
                  <p style={{ color: "#9ca3af", fontSize: "13px", margin: 0 }}>
                    JPG or PNG · Flat open palm · Good lighting
                  </p>
                </div>
            }
            <input type="file" accept="image/*" onChange={handleFileChange}
              style={{ display: "none" }} />
          </label>
          {uploadError && <div style={S.errBox}>{uploadError}</div>}
          <button
            style={{ ...S.primaryBtn, opacity: uploading || !selectedFile ? 0.5 : 1 }}
            onClick={handleUpload} disabled={uploading || !selectedFile}>
            {uploading ? "Analyzing..." : "Analyze Photo"}
          </button>
        </div>
      )}

      {/* ═══ MANUAL MODE ════════════════════════════════════════════════ */}
      {mode === "manual" && (
        <div>
          <p style={{ color: "#374151", fontWeight: "600", marginBottom: "12px" }}>
            Select your hand size:
          </p>
          {[
            { size: "Small",  desc: "Up to 17cm · Screen 4.7–6.1\"" },
            { size: "Medium", desc: "17–19cm    · Screen 6.1–6.5\"" },
            { size: "Large",  desc: "19cm+      · Screen 6.5–6.9\"" },
          ].map(({ size, desc }) => (
            <div key={size}
              style={{ ...S.sizeCard, ...(manualSize === size ? S.sizeCardActive : {}) }}
              onClick={() => setManualSize(size)}>
              <div>
                <div style={{ fontWeight: "600", color: "#1f2937" }}>{size}</div>
                <div style={{ color: "#6b7280", fontSize: "13px" }}>{desc}</div>
              </div>
              <div style={{ fontSize: "20px", color: "#6366f1" }}>
                {manualSize === size ? "●" : "○"}
              </div>
            </div>
          ))}
          <button
            style={{ ...S.primaryBtn, marginTop: "8px", opacity: manualSize ? 1 : 0.4 }}
            disabled={!manualSize}
            onClick={() => manualSize && onComplete({
              hand_size: manualSize,
              recommended_screen_min: manualSize === "Small" ? 4.7 : manualSize === "Medium" ? 6.1 : 6.5,
              recommended_screen_max: manualSize === "Small" ? 6.1 : manualSize === "Medium" ? 6.5 : 6.9,
              source: "manual",
            })}>
            {manualSize ? `Continue with ${manualSize} Hand →` : "Select a size above"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const S = {
  heading:  { fontSize: "22px", fontWeight: "700", color: "#1f2937", margin: "0 0 8px" },
  subtext:  { color: "#6b7280", fontSize: "15px", margin: "0 0 20px" },
  toggle:   { display: "flex", background: "#f3f4f6", borderRadius: "10px", padding: "4px", marginBottom: "20px" },
  toggleBtn: { flex: 1, padding: "8px 4px", border: "none", background: "transparent",
               borderRadius: "8px", fontSize: "13px", cursor: "pointer", color: "#6b7280" },
  toggleActive: { background: "#fff", color: "#6366f1", fontWeight: "600",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },

  videoWrap: { position: "relative", background: "#0f0f0f", borderRadius: "14px",
               overflow: "hidden", aspectRatio: "4/3", marginBottom: "16px" },
  video:     { width: "100%", height: "100%", objectFit: "cover",
               display: "block", transform: "scaleX(-1)" },
  overlay:   { position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
               pointerEvents: "none" },
  placeholder: { position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                 alignItems: "center", justifyContent: "center", color: "#fff", padding: "20px" },
  camEmoji:  { fontSize: "48px", marginBottom: "12px" },
  phText:    { fontSize: "16px", fontWeight: "600", margin: "0 0 6px" },
  phHint:    { fontSize: "13px", color: "#9ca3af", margin: 0, textAlign: "center" },
  spinner:   { width: "40px", height: "40px", border: "3px solid rgba(255,255,255,0.2)",
               borderTopColor: "#fff", borderRadius: "50%",
               animation: "spin 0.8s linear infinite", marginBottom: "12px" },

  liveBadge: { position: "absolute", top: "12px", left: "12px",
               background: "rgba(0,0,0,0.55)", color: "#fff",
               padding: "4px 10px", borderRadius: "20px",
               fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" },
  liveDot:   { width: "8px", height: "8px", borderRadius: "50%", transition: "background 0.3s" },

  resultBar: { position: "absolute", bottom: 0, left: 0, right: 0,
               background: "linear-gradient(transparent, rgba(0,0,0,0.85))",
               padding: "28px 16px 14px",
               display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" },
  sizePill:  { color: "#fff", padding: "4px 14px", borderRadius: "20px",
               fontSize: "14px", fontWeight: "700" },
  screenHint:{ color: "rgba(255,255,255,0.8)", fontSize: "13px" },
  countdown: { marginLeft: "auto", color: "#fff", fontSize: "13px",
               fontWeight: "600", letterSpacing: "0.3px" },

  noHand:    { position: "absolute", bottom: "16px", left: "50%",
               transform: "translateX(-50%)",
               background: "rgba(0,0,0,0.6)", color: "#fff",
               padding: "8px 18px", borderRadius: "20px",
               fontSize: "13px", whiteSpace: "nowrap" },

  pulseRing: { position: "absolute", inset: "0", borderRadius: "14px",
               border: "3px solid #6366f1",
               animation: "pulse 1.5s ease-in-out infinite",
               pointerEvents: "none" },

  tips:      { background: "#eff6ff", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" },
  tipsTitle: { color: "#1d4ed8", fontWeight: "600", fontSize: "13px", margin: "0 0 6px" },
  tipsList:  { color: "#374151", fontSize: "13px", margin: 0, paddingLeft: "20px", lineHeight: "1.8" },

  btnRow:    { display: "flex", gap: "10px" },
  primaryBtn:{ width: "100%", padding: "14px",
               background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
               color: "#fff", border: "none", borderRadius: "10px",
               fontSize: "15px", fontWeight: "600", cursor: "pointer" },
  stopBtn:   { flex: 1, padding: "14px", border: "2px solid #e5e7eb",
               background: "#fff", borderRadius: "10px",
               fontSize: "15px", fontWeight: "600", cursor: "pointer", color: "#374151" },

  metrics:   { display: "flex", gap: "10px", marginTop: "12px" },
  metric:    { flex: 1, background: "#f8fafc", borderRadius: "10px",
               padding: "12px", textAlign: "center",
               display: "flex", flexDirection: "column", gap: "4px" },
  metricVal: { fontSize: "18px", fontWeight: "700", color: "#6366f1" },
  metricLbl: { fontSize: "11px", color: "#9ca3af" },

  uploadBox: { display: "block", border: "2px dashed #d1d5db", borderRadius: "12px",
               cursor: "pointer", overflow: "hidden", marginBottom: "16px", minHeight: "200px" },
  uploadPh:  { display: "flex", flexDirection: "column", alignItems: "center",
               justifyContent: "center", padding: "40px 20px", textAlign: "center" },
  preview:   { width: "100%", maxHeight: "300px", objectFit: "cover", display: "block" },
  errBox:    { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px",
               padding: "12px 16px", color: "#dc2626", fontSize: "14px", marginBottom: "12px" },

  sizeCard:  { display: "flex", alignItems: "center", justifyContent: "space-between",
               border: "2px solid #e5e7eb", borderRadius: "10px",
               padding: "16px", marginBottom: "10px", cursor: "pointer" },
  sizeCardActive: { borderColor: "#6366f1", background: "#eef2ff" },
};

// Inject keyframes once
if (!document.getElementById("hs-styles")) {
  const tag = document.createElement("style");
  tag.id = "hs-styles";
  tag.innerHTML = `
    @keyframes spin  { to { transform: rotate(360deg); } }
    @keyframes pulse {
      0%,100% { opacity: 0.6; transform: scale(1); }
      50%     { opacity: 1;   transform: scale(1.01); }
    }
  `;
  document.head.appendChild(tag);
}

export default HandScan;