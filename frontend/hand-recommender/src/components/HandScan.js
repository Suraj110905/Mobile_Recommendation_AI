import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";

import API from "../config";
const SCAN_INTERVAL_MS = 1200;  // scan every 1.2s (faster)
const HOLD_REQUIRED_MS = 3000;  // 3s hold to confirm
const HOLD_TICK_MS     = 50;    // smoother countdown
const SAMPLES_NEEDED   = 3;     // average 3 frames for accuracy

function HandScan({ onComplete }) {

  const videoRef   = useRef(null);
  const canvasRef  = useRef(null);
  const overlayRef = useRef(null);
  const streamRef  = useRef(null);
  const scanRef    = useRef(null);
  const holdRef    = useRef(null);
  const holdStart  = useRef(null);
  const samplesRef = useRef([]);  // stores recent scan results for averaging

  const [camStatus,    setCamStatus]    = useState("idle");
  const [scanResult,   setScanResult]   = useState(null);
  const [scanning,     setScanning]     = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [camError,     setCamError]     = useState(null);
  const [mode,         setMode]         = useState("live");
  const [selectedFile, setSelectedFile] = useState(null);
  const [preview,      setPreview]      = useState(null);
  const [uploading,    setUploading]    = useState(false);
  const [uploadError,  setUploadError]  = useState(null);
  const [manualSize,   setManualSize]   = useState(null);
  const [scanCount,    setScanCount]    = useState(0); // how many frames scanned

  // ── CINEMATIC OVERLAY DRAWING ──────────────────────────────────────────
  const drawOverlay = useCallback((landmarks, progress, confidence) => {
    const canvas = overlayRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;

    canvas.width  = video.clientWidth  || 640;
    canvas.height = video.clientHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks || landmarks.length === 0) return;

    const W = canvas.width;
    const H = canvas.height;
    const pts = landmarks.map(lm => ({
      x: (1 - lm.x) * W,
      y: lm.y * H,
    }));

    const now  = Date.now();
    const pulse = (Math.sin(now / 400) + 1) / 2; // 0→1 pulsing value

    // ── SCAN LINE ANIMATION ──────────────────────────────────────────────
    // A horizontal glowing line that sweeps up and down
    const scanY = (Math.sin(now / 600) + 1) / 2 * H;
    const grad  = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
    grad.addColorStop(0,   "rgba(99,102,241,0)");
    grad.addColorStop(0.5, `rgba(99,102,241,${0.4 + pulse * 0.3})`);
    grad.addColorStop(1,   "rgba(99,102,241,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, scanY - 30, W, 60);

    // ── CORNER BRACKETS ──────────────────────────────────────────────────
    // Find bounding box of hand
    const xs = pts.map(p => p.x);
    const ys = pts.map(p => p.y);
    const minX = Math.min(...xs) - 20;
    const maxX = Math.max(...xs) + 20;
    const minY = Math.min(...ys) - 20;
    const maxY = Math.max(...ys) + 20;
    const bW   = maxX - minX;
    const bH   = maxY - minY;
    const bLen = Math.min(bW, bH) * 0.25; // bracket length

    const bracketColor = progress >= 99
      ? `rgba(16,185,129,${0.8 + pulse * 0.2})`   // green when done
      : `rgba(99,102,241,${0.8 + pulse * 0.2})`;  // purple while scanning

    ctx.strokeStyle = bracketColor;
    ctx.lineWidth   = 3;
    ctx.lineCap     = "round";

    // Draw 4 corner brackets
    const corners = [
      { x: minX, y: minY, dx: 1,  dy: 1  },
      { x: maxX, y: minY, dx: -1, dy: 1  },
      { x: minX, y: maxY, dx: 1,  dy: -1 },
      { x: maxX, y: maxY, dx: -1, dy: -1 },
    ];
    corners.forEach(({ x, y, dx, dy }) => {
      ctx.beginPath();
      ctx.moveTo(x + dx * bLen, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * bLen);
      ctx.stroke();
    });

    // ── SKELETON CONNECTIONS ─────────────────────────────────────────────
    const connections = [
      [0,1],[1,2],[2,3],[3,4],
      [0,5],[5,6],[6,7],[7,8],
      [0,9],[9,10],[10,11],[11,12],
      [0,13],[13,14],[14,15],[15,16],
      [0,17],[17,18],[18,19],[19,20],
      [5,9],[9,13],[13,17],
    ];

    // Glowing connection lines
    connections.forEach(([a, b]) => {
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.strokeStyle = progress >= 99
        ? `rgba(16,185,129,0.7)`
        : `rgba(139,92,246,${0.5 + pulse * 0.3})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // ── LANDMARK DOTS ────────────────────────────────────────────────────
    pts.forEach((pt, i) => {
      const isTip = [4, 8, 12, 16, 20].includes(i);
      const isWrist = i === 0;
      const r = isTip ? 7 : isWrist ? 8 : 4;

      // Outer glow
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r + 4, 0, 2 * Math.PI);
      ctx.fillStyle = progress >= 99
        ? `rgba(16,185,129,${0.15 + pulse * 0.1})`
        : `rgba(99,102,241,${0.15 + pulse * 0.1})`;
      ctx.fill();

      // Main dot
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isTip
        ? (progress >= 99 ? "#10b981" : "#a78bfa")
        : (progress >= 99 ? "#34d399" : "rgba(99,102,241,0.9)");
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth   = 1.5;
      ctx.stroke();
    });

    // ── CIRCULAR PROGRESS RING around wrist ─────────────────────────────
    if (progress > 0) {
      const cx = pts[0].x;
      const cy = pts[0].y;
      const r  = 32;

      // Background ring
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(255,255,255,0.15)";
      ctx.lineWidth   = 5;
      ctx.stroke();

      // Progress arc
      const startAngle = -Math.PI / 2;
      const endAngle   = startAngle + (2 * Math.PI * progress / 100);
      ctx.beginPath();
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.strokeStyle = progress >= 99 ? "#10b981" : "#a78bfa";
      ctx.lineWidth   = 5;
      ctx.lineCap     = "round";
      ctx.stroke();

      // Center text
      ctx.fillStyle    = "#fff";
      ctx.font         = "bold 11px monospace";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(progress >= 99 ? "✓" : Math.round(progress) + "%", cx, cy);
    }

    // ── CONFIDENCE INDICATOR (top right of bounding box) ────────────────
    if (confidence) {
      const cx = maxX - 10;
      const cy = minY - 10;
      ctx.fillStyle    = confidence >= 80 ? "#10b981" : confidence >= 60 ? "#f59e0b" : "#ef4444";
      ctx.font         = "bold 12px monospace";
      ctx.textAlign    = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(confidence + "% conf", cx, cy);
    }

    // ── DATA READOUT (bottom right, movie style) ─────────────────────────
    const lines = [
      "SCANNING: ACTIVE",
      "LANDMARKS: " + landmarks.length,
      "CONF: " + (confidence || "--") + "%",
    ];
    ctx.font      = "11px monospace";
    ctx.textAlign = "right";
    lines.forEach((line, i) => {
      ctx.fillStyle = `rgba(99,102,241,${0.6 + pulse * 0.3})`;
      ctx.fillText(line, W - 12, H - 12 - (lines.length - 1 - i) * 16);
    });

  }, []);

  const clearOverlay = useCallback(() => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  // ── ANIMATION LOOP (runs continuously when cam active) ────────────────
  const animFrameRef = useRef(null);
  const lastResultRef = useRef(null);

  const runAnimation = useCallback(() => {
    if (lastResultRef.current && lastResultRef.current.landmarks) {
      const prog = holdStart.current
        ? Math.min(100, (Date.now() - holdStart.current) / HOLD_REQUIRED_MS * 100)
        : holdProgress;
      drawOverlay(
        lastResultRef.current.landmarks,
        prog,
        lastResultRef.current.confidence
      );
    }
    animFrameRef.current = requestAnimationFrame(runAnimation);
  }, [drawOverlay, holdProgress]);

  // Start animation loop when camera is active
  useEffect(() => {
    if (camStatus === "active") {
      animFrameRef.current = requestAnimationFrame(runAnimation);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [camStatus, runAnimation]);

  // ── STOP HOLD TIMER ───────────────────────────────────────────────────
  const stopHold = useCallback(() => {
    if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; }
    holdStart.current = null;
    setHoldProgress(0);
  }, []);

  // ── START HOLD TIMER ──────────────────────────────────────────────────
  const startHold = useCallback((result) => {
    if (holdRef.current) return;
    holdStart.current = Date.now();
    holdRef.current   = setInterval(() => {
      const elapsed  = Date.now() - holdStart.current;
      const progress = Math.min(100, (elapsed / HOLD_REQUIRED_MS) * 100);
      setHoldProgress(progress);
      if (progress >= 100) {
        clearInterval(holdRef.current);
        holdRef.current = null;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
        if (scanRef.current) { clearInterval(scanRef.current); scanRef.current = null; }
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setCamStatus("idle");
        onComplete(result);
      }
    }, HOLD_TICK_MS);
  }, [onComplete]);

  // ── MULTI-FRAME AVERAGING ─────────────────────────────────────────────
  // Collects SAMPLES_NEEDED results and picks the most common hand_size
  // with the highest average confidence — much more accurate than single frame
  function processSamples(newResult) {
    const samples = samplesRef.current;
    samples.push(newResult);
    if (samples.length > SAMPLES_NEEDED) samples.shift();

    if (samples.length < SAMPLES_NEEDED) return newResult; // not enough yet

    // Find most common hand_size
    const counts = {};
    samples.forEach(s => { counts[s.hand_size] = (counts[s.hand_size] || 0) + 1; });
    const dominantSize = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];

    // Average confidence of the dominant size
    const dominant = samples.filter(s => s.hand_size === dominantSize);
    const avgConf  = Math.round(dominant.reduce((s, r) => s + r.confidence, 0) / dominant.length);

    return { ...newResult, hand_size: dominantSize, confidence: avgConf };
  }

  // ── CAPTURE AND SCAN ──────────────────────────────────────────────────
  const captureAndScan = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (videoRef.current.readyState < 2) return;
    if (scanning) return;

    setScanning(true);
    try {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
      ctx.restore();

      const blob = await new Promise(r => canvas.toBlob(r, "image/jpeg", 0.9));
      if (!blob) return;

      const fd = new FormData();
      fd.append("file", blob, "frame.jpg");

      const res = await axios.post(`${API}/analyze-hand`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 4000,
      });

      const averaged = processSamples(res.data);
      lastResultRef.current = averaged;
      setScanResult(averaged);
      setScanCount(c => c + 1);
      startHold(averaged);

    } catch (err) {
      setScanResult(null);
      lastResultRef.current = null;
      samplesRef.current    = [];
      stopHold();
      clearOverlay();
    } finally {
      setScanning(false);
    }
  }, [scanning, startHold, stopHold, clearOverlay]);

  // Start scan loop
  useEffect(() => {
    if (camStatus === "active") {
      captureAndScan();
      scanRef.current = setInterval(captureAndScan, SCAN_INTERVAL_MS);
    }
    return () => { if (scanRef.current) clearInterval(scanRef.current); };
  }, [camStatus]); // eslint-disable-line

  useEffect(() => {
    return () => {
      if (streamRef.current)       streamRef.current.getTracks().forEach(t => t.stop());
      if (scanRef.current)         clearInterval(scanRef.current);
      if (holdRef.current)         clearInterval(holdRef.current);
      if (animFrameRef.current)    cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // ── START CAMERA ──────────────────────────────────────────────────────
  const startCamera = async () => {
    setCamStatus("starting");
    setCamError(null);
    setScanResult(null);
    samplesRef.current = [];
    setScanCount(0);
    stopHold();
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
        err.name === "NotAllowedError" ? "Camera permission denied. Please allow and try again."
        : err.name === "NotFoundError" ? "No camera found on this device."
        : "Could not start camera: " + err.message
      );
    }
  };

  const stopCamera = () => {
    if (scanRef.current)      clearInterval(scanRef.current);
    if (holdRef.current)      clearInterval(holdRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current)    streamRef.current.getTracks().forEach(t => t.stop());
    scanRef.current = holdRef.current = streamRef.current = animFrameRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamStatus("idle");
    setScanResult(null);
    setHoldProgress(0);
    setScanCount(0);
    samplesRef.current = [];
    clearOverlay();
  };

  // Upload mode
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

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div>
      <h2 style={S.heading}>Scan Your Hand</h2>
      <p style={S.subtext}>
        Hold your open palm steady — auto-confirms after 3 seconds.
      </p>

      <div style={S.toggle}>
        {["live", "upload", "manual"].map(m => (
          <button key={m}
            style={{ ...S.toggleBtn, ...(mode === m ? S.toggleActive : {}) }}
            onClick={() => { stopCamera(); setMode(m); setScanResult(null); setManualSize(null); }}>
            {m === "live" ? "Live Camera" : m === "upload" ? "Upload Photo" : "Pick Manually"}
          </button>
        ))}
      </div>

      {/* ── LIVE MODE ── */}
      {mode === "live" && (
        <div>
          <div style={S.videoWrap}>
            <video ref={videoRef} playsInline muted
              style={{ ...S.video, display: camStatus === "active" ? "block" : "none" }} />
            <canvas ref={overlayRef} style={S.overlay} />
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {/* Placeholder */}
            {camStatus !== "active" && (
              <div style={S.placeholder}>
                {camStatus === "starting" && (
                  <><div style={S.spinner} /><p style={S.phText}>Initializing scanner...</p></>
                )}
                {camStatus === "idle" && (
                  <><div style={{ fontSize: "48px", marginBottom: "12px" }}>📷</div>
                  <p style={S.phText}>Scanner ready</p>
                  <p style={S.phHint}>Click Start Scanner below</p></>
                )}
                {camStatus === "error" && (
                  <><div style={{ fontSize: "48px", marginBottom: "12px" }}>⚠️</div>
                  <p style={S.phText}>Camera error</p>
                  <p style={S.phHint}>{camError}</p></>
                )}
              </div>
            )}

            {/* Live badge */}
            {camStatus === "active" && (
              <div style={S.liveBadge}>
                <div style={{ ...S.liveDot, background: scanning ? "#f59e0b" : "#10b981" }} />
                {scanning ? "Analyzing..." : `Live · ${scanCount} frames`}
              </div>
            )}

            {/* Result overlay */}
            {camStatus === "active" && scanResult && (
              <div style={S.resultBar}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                  <span style={{
                    ...S.sizePill,
                    background: sizeColors[scanResult.hand_size] || "#6366f1"
                  }}>
                    {scanResult.hand_size} Hand
                  </span>
                  <span style={S.screenHint}>
                    {scanResult.recommended_screen_min}"–{scanResult.recommended_screen_max}"
                  </span>
                  {/* Confidence bar */}
                  <div style={S.confWrap}>
                    <div style={{
                      ...S.confBar,
                      width: (scanResult.confidence || 0) + "%",
                      background: (scanResult.confidence || 0) >= 80 ? "#10b981"
                                : (scanResult.confidence || 0) >= 60 ? "#f59e0b" : "#ef4444",
                    }} />
                  </div>
                  <span style={S.confText}>{scanResult.confidence || 0}%</span>
                </div>
                <span style={S.countdown}>
                  {holdProgress > 0
                    ? holdProgress >= 99 ? "✓ Done!" : `Hold ${secondsLeft}s`
                    : "Hold steady"}
                </span>
              </div>
            )}

            {/* No hand prompt */}
            {camStatus === "active" && !scanResult && (
              <div style={S.noHand}>
                Show your open palm · fingers spread · face camera
              </div>
            )}

            {/* Pulse border */}
            {camStatus === "active" && scanResult && (
              <div style={{
                ...S.pulseRing,
                borderColor: holdProgress >= 99 ? "#10b981" : "#6366f1",
              }} />
            )}
          </div>

          {/* Tips */}
          <div style={S.tips}>
            <p style={S.tipsTitle}>For highest accuracy:</p>
            <ul style={S.tipsList}>
              <li>Flat open palm, all fingers spread, facing camera</li>
              <li>Arm straight — don't tilt or angle your hand</li>
              <li>Good lighting, plain background, no gloves</li>
              <li>Wait for confidence % to reach 80%+ before confirming</li>
            </ul>
          </div>

          {/* Buttons */}
          {(camStatus === "idle" || camStatus === "error") ? (
            <button style={S.primaryBtn} onClick={startCamera}>
              ⬡ Start Scanner
            </button>
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

          {/* Metrics */}
          {scanResult && (
            <div style={S.metrics}>
              {[
                { label: "Size score",   val: scanResult.score?.toFixed(3) },
                { label: "Palm width",   val: scanResult.palm_width?.toFixed(3) },
                { label: "Confidence",   val: (scanResult.confidence || 0) + "%" },
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

      {/* ── UPLOAD MODE ── */}
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

      {/* ── MANUAL MODE ── */}
      {mode === "manual" && (
        <div>
          <p style={{ color: "#374151", fontWeight: "600", marginBottom: "12px" }}>
            Select your hand size:
          </p>
          {[
            { size: "Small",  desc: "Up to 17cm · Fits 4.7–6.1\" screens comfortably" },
            { size: "Medium", desc: "17–19cm    · Fits 6.1–6.5\" screens comfortably" },
            { size: "Large",  desc: "19cm+      · Fits 6.5–6.9\" screens comfortably" },
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
              confidence: 100,
              recommended_screen_min: manualSize === "Small" ? 4.7 : manualSize === "Medium" ? 6.1 : 6.5,
              recommended_screen_max: manualSize === "Small" ? 6.1 : manualSize === "Medium" ? 6.5 : 6.9,
              source: "manual",
            })}>
            {manualSize ? "Continue with " + manualSize + " Hand →" : "Select a size above"}
          </button>
        </div>
      )}
    </div>
  );
}

const S = {
  heading:  { fontSize: "22px", fontWeight: "700", color: "#1f2937", margin: "0 0 8px" },
  subtext:  { color: "#6b7280", fontSize: "15px", margin: "0 0 20px" },
  toggle:   { display: "flex", background: "#f3f4f6", borderRadius: "10px", padding: "4px", marginBottom: "20px" },
  toggleBtn:    { flex: 1, padding: "8px 4px", border: "none", background: "transparent", borderRadius: "8px", fontSize: "13px", cursor: "pointer", color: "#6b7280" },
  toggleActive: { background: "#fff", color: "#6366f1", fontWeight: "600", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" },

  videoWrap: { position: "relative", background: "#0a0a0f", borderRadius: "14px", overflow: "hidden", aspectRatio: "4/3", marginBottom: "16px" },
  video:     { width: "100%", height: "100%", objectFit: "cover", display: "block", transform: "scaleX(-1)" },
  overlay:   { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none" },

  placeholder: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#fff", padding: "20px" },
  phText:  { fontSize: "16px", fontWeight: "600", margin: "0 0 6px" },
  phHint:  { fontSize: "13px", color: "#9ca3af", margin: 0, textAlign: "center" },
  spinner: { width: "40px", height: "40px", border: "3px solid rgba(99,102,241,0.3)", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: "12px" },

  liveBadge: { position: "absolute", top: "12px", left: "12px", background: "rgba(0,0,0,0.7)", color: "#fff", padding: "4px 10px", borderRadius: "20px", fontSize: "11px", display: "flex", alignItems: "center", gap: "6px", fontFamily: "monospace" },
  liveDot:   { width: "8px", height: "8px", borderRadius: "50%", transition: "background 0.3s" },

  resultBar: { position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent, rgba(0,0,0,0.9))", padding: "28px 14px 14px", display: "flex", alignItems: "center", gap: "8px" },
  sizePill:  { color: "#fff", padding: "3px 12px", borderRadius: "20px", fontSize: "13px", fontWeight: "700", flexShrink: 0 },
  screenHint:{ color: "rgba(255,255,255,0.75)", fontSize: "12px", flexShrink: 0 },
  confWrap:  { flex: 1, height: "4px", background: "rgba(255,255,255,0.2)", borderRadius: "2px", overflow: "hidden" },
  confBar:   { height: "100%", borderRadius: "2px", transition: "width 0.4s, background 0.4s" },
  confText:  { fontSize: "11px", color: "#fff", fontFamily: "monospace", flexShrink: 0 },
  countdown: { fontSize: "12px", fontWeight: "600", color: "#fff", flexShrink: 0, fontFamily: "monospace" },

  noHand:    { position: "absolute", bottom: "16px", left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.7)", color: "#fff", padding: "8px 18px", borderRadius: "20px", fontSize: "12px", whiteSpace: "nowrap", fontFamily: "monospace" },
  pulseRing: { position: "absolute", inset: "0", borderRadius: "14px", border: "2px solid", animation: "pulse 1.5s ease-in-out infinite", pointerEvents: "none" },

  tips:      { background: "#eff6ff", borderRadius: "10px", padding: "12px 16px", marginBottom: "16px" },
  tipsTitle: { color: "#1d4ed8", fontWeight: "600", fontSize: "13px", margin: "0 0 6px" },
  tipsList:  { color: "#374151", fontSize: "13px", margin: 0, paddingLeft: "20px", lineHeight: "1.8" },

  btnRow:    { display: "flex", gap: "10px" },
  primaryBtn:{ width: "100%", padding: "14px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: "600", cursor: "pointer" },
  stopBtn:   { flex: 1, padding: "14px", border: "2px solid #e5e7eb", background: "#fff", borderRadius: "10px", fontSize: "15px", fontWeight: "600", cursor: "pointer", color: "#374151" },

  metrics:   { display: "flex", gap: "10px", marginTop: "12px" },
  metric:    { flex: 1, background: "#f8fafc", borderRadius: "10px", padding: "12px", textAlign: "center", display: "flex", flexDirection: "column", gap: "4px" },
  metricVal: { fontSize: "18px", fontWeight: "700", color: "#6366f1", fontFamily: "monospace" },
  metricLbl: { fontSize: "11px", color: "#9ca3af" },

  uploadBox: { display: "block", border: "2px dashed #d1d5db", borderRadius: "12px", cursor: "pointer", overflow: "hidden", marginBottom: "16px", minHeight: "200px" },
  uploadPh:  { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" },
  preview:   { width: "100%", maxHeight: "300px", objectFit: "cover", display: "block" },
  errBox:    { background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: "8px", padding: "12px 16px", color: "#dc2626", fontSize: "14px", marginBottom: "12px" },

  sizeCard:       { display: "flex", alignItems: "center", justifyContent: "space-between", border: "2px solid #e5e7eb", borderRadius: "10px", padding: "16px", marginBottom: "10px", cursor: "pointer" },
  sizeCardActive: { borderColor: "#6366f1", background: "#eef2ff" },
};

if (!document.getElementById("hs-anim")) {
  const tag = document.createElement("style");
  tag.id = "hs-anim";
  tag.innerHTML = `
    @keyframes spin  { to { transform: rotate(360deg); } }
    @keyframes pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
  `;
  document.head.appendChild(tag);
}

export default HandScan;