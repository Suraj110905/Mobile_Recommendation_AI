import { useState, useEffect } from "react";
import axios from "axios";

const API = "http://127.0.0.1:8000";

// ── PRESETS ──────────────────────────────────────────────────────────────────
const PRESETS = [
  {
    id: "gamer",
    label: "Gamer",
    icon: "🎮",
    desc: "High refresh, max performance",
    values: { camera: 6, battery: 8, gaming: 10 },
  },
  {
    id: "photographer",
    label: "Photographer",
    icon: "📷",
    desc: "Best camera, great display",
    values: { camera: 10, battery: 6, gaming: 4 },
  },
  {
    id: "student",
    label: "Student",
    icon: "🎓",
    desc: "Battery life, value for money",
    values: { camera: 6, battery: 9, gaming: 5 },
  },
  {
    id: "business",
    label: "Business",
    icon: "💼",
    desc: "Balanced, reliable, premium",
    values: { camera: 7, battery: 8, gaming: 3 },
  },
  {
    id: "basic",
    label: "Basic User",
    icon: "👴",
    desc: "Easy to use, long battery",
    values: { camera: 5, battery: 9, gaming: 2 },
  },
];

const ALL_SEGMENTS = ["Budget", "Mid-Range", "Mid-Premium", "Premium", "Ultra-Premium"];
const RAM_OPTIONS  = [0, 4, 6, 8, 12];

function Preferences({ handData, onComplete, onBack }) {

  const [budget,       setBudget]      = useState(40000);
  const [camera,       setCamera]      = useState(7);
  const [battery,      setBattery]     = useState(7);
  const [gaming,       setGaming]      = useState(5);
  const [activePreset, setActivePreset] = useState(null);
  const [loading,      setLoading]     = useState(false);
  const [error,        setError]       = useState(null);

  // filters
  const [showFilters,  setShowFilters]  = useState(false);
  const [allBrands,    setAllBrands]    = useState([]);
  const [selBrands,    setSelBrands]    = useState([]);
  const [require5G,    setRequire5G]    = useState(false);
  const [minRam,       setMinRam]       = useState(0);
  const [maxWeight,    setMaxWeight]    = useState(300);
  const [selSegments,  setSelSegments]  = useState([]);

  useEffect(() => {
    axios.get(`${API}/brands`)
      .then(res => setAllBrands(res.data.brands || []))
      .catch(() => setAllBrands([]));
  }, []);

  // Apply a preset — fills all sliders at once
  function applyPreset(preset) {
    setActivePreset(preset.id);
    setCamera(preset.values.camera);
    setBattery(preset.values.battery);
    setGaming(preset.values.gaming);
  }

  // If user manually moves a slider, clear the active preset
  function handleSliderChange(setter, value) {
    setActivePreset(null);
    setter(value);
  }

  const activeFilterCount = [
    selBrands.length > 0, require5G,
    minRam > 0, maxWeight < 300, selSegments.length > 0,
  ].filter(Boolean).length;

  function toggleBrand(b)   { setSelBrands(p => p.includes(b) ? p.filter(x => x !== b) : [...p, b]); }
  function toggleSegment(s) { setSelSegments(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]); }
  function clearFilters()   { setSelBrands([]); setRequire5G(false); setMinRam(0); setMaxWeight(300); setSelSegments([]); }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.post(`${API}/recommend`, {
        budget: parseInt(budget), camera, battery, gaming,
        hand_size:  handData.hand_size,
        brands:     selBrands,
        require_5g: require5G,
        min_ram:    minRam,
        max_weight: maxWeight < 300 ? maxWeight : 9999,
        segments:   selSegments,
      });
      if (res.data.filter_warning) setError(`Note: ${res.data.filter_warning}`);
      onComplete(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function PrioritySlider({ label, value, onChange, description }) {
    const labels = ["","Low","Low","Moderate","Moderate","Medium","Medium","High","High","Very High","Very High"];
    return (
      <div style={S.sliderGroup}>
        <div style={S.sliderHeader}>
          <span style={S.sliderLabel}>{label}</span>
          <span style={S.sliderValue}>{labels[value]} ({value}/10)</span>
        </div>
        <input type="range" min="1" max="10" value={value}
          onChange={e => onChange(parseInt(e.target.value))}
          style={S.slider} />
        <p style={S.sliderDesc}>{description}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 style={S.heading}>Your Preferences</h2>
      <p style={S.subtext}>Pick a preset or set manually.</p>

      {/* Hand size card */}
      <div style={S.handCard}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "32px" }}>✋</span>
          <div>
            <p style={{ fontSize: "12px", opacity: 0.8, margin: "0 0 2px" }}>Detected hand size</p>
            <p style={{ fontSize: "20px", fontWeight: "700", margin: 0 }}>{handData?.hand_size}</p>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ fontSize: "12px", opacity: 0.8, margin: "0 0 2px" }}>Ideal screen</p>
          <p style={{ fontSize: "16px", fontWeight: "600", margin: 0 }}>
            {handData?.recommended_screen_min}"–{handData?.recommended_screen_max}"
          </p>
        </div>
      </div>

      {/* ── PRESETS ──────────────────────────────────────────── */}
      <div style={S.section}>
        <p style={S.sectionLabel}>I am a...</p>
        <div style={S.presetsGrid}>
          {PRESETS.map(preset => (
            <button key={preset.id}
              style={{
                ...S.presetCard,
                borderColor:  activePreset === preset.id ? "#6366f1" : "#e5e7eb",
                background:   activePreset === preset.id ? "#eef2ff" : "#fff",
                boxShadow:    activePreset === preset.id ? "0 0 0 2px #c7d2fe" : "none",
              }}
              onClick={() => applyPreset(preset)}
            >
              <span style={S.presetIcon}>{preset.icon}</span>
              <span style={{
                ...S.presetLabel,
                color: activePreset === preset.id ? "#4338ca" : "#1f2937",
              }}>{preset.label}</span>
              <span style={S.presetDesc}>{preset.desc}</span>
              {activePreset === preset.id && (
                <span style={S.presetCheck}>✓</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Budget */}
      <div style={S.section}>
        <label style={S.sectionLabel}>Budget (₹)</label>
        <input type="number" value={budget}
          onChange={e => setBudget(e.target.value)}
          min="5000" max="200000" step="1000"
          style={S.budgetInput} />
        <div style={S.chipRow}>
          {[15000, 25000, 40000, 60000, 100000].map(b => (
            <button key={b}
              style={{ ...S.chip, ...(budget == b ? S.chipActive : {}) }}
              onClick={() => setBudget(b)}>
              ₹{b >= 1000 ? `${b/1000}K` : b}
            </button>
          ))}
        </div>
      </div>

      {/* Sliders */}
      <div style={S.section}>
        <p style={S.sectionLabel}>
          Priority levels
          {activePreset && (
            <span style={S.presetActiveBadge}>
              {PRESETS.find(p => p.id === activePreset)?.icon} {PRESETS.find(p => p.id === activePreset)?.label} preset active
            </span>
          )}
        </p>
        <PrioritySlider label="Camera"  value={camera}
          onChange={v => handleSliderChange(setCamera, v)}
          description="How important is photo quality?" />
        <PrioritySlider label="Battery" value={battery}
          onChange={v => handleSliderChange(setBattery, v)}
          description="How important is battery life?" />
        <PrioritySlider label="Gaming"  value={gaming}
          onChange={v => handleSliderChange(setGaming, v)}
          description="How much do you game on your phone?" />
      </div>

      {/* Advanced Filters */}
      <div style={S.filtersBox}>
        <button style={S.filtersToggle} onClick={() => setShowFilters(!showFilters)}>
          <span style={{ fontWeight: "600", color: "#374151", fontSize: "15px" }}>
            Advanced Filters
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {activeFilterCount > 0 && (
              <span style={S.filterBadge}>{activeFilterCount} active</span>
            )}
            <span style={{ color: "#6b7280" }}>{showFilters ? "▲" : "▼"}</span>
          </div>
        </button>

        {showFilters && (
          <div style={S.filterContent}>
            {activeFilterCount > 0 && (
              <button style={S.clearBtn} onClick={clearFilters}>Clear all filters</button>
            )}

            {/* Brand */}
            <div style={S.filterGroup}>
              <p style={S.filterLabel}>Brand</p>
              <div style={S.chipRow}>
                {allBrands.map(b => (
                  <button key={b}
                    style={{ ...S.chip, ...(selBrands.includes(b) ? S.chipActive : {}) }}
                    onClick={() => toggleBrand(b)}>{b}</button>
                ))}
              </div>
              {selBrands.length === 0 && <p style={S.filterHint}>No brand selected = all brands</p>}
            </div>

            {/* 5G */}
            <div style={S.filterGroup}>
              <p style={S.filterLabel}>Connectivity</p>
              <div style={{ ...S.toggleRow, background: require5G ? "#eef2ff" : "#f9fafb", borderColor: require5G ? "#6366f1" : "#e5e7eb" }}
                onClick={() => setRequire5G(!require5G)}>
                <div>
                  <p style={{ margin: 0, fontWeight: "600", fontSize: "14px", color: "#1f2937" }}>5G only</p>
                  <p style={{ margin: 0, fontSize: "12px", color: "#6b7280" }}>Show only 5G phones</p>
                </div>
                <div style={{ ...S.toggleTrack, background: require5G ? "#6366f1" : "#d1d5db" }}>
                  <div style={{ ...S.toggleThumb, transform: require5G ? "translateX(20px)" : "translateX(2px)" }} />
                </div>
              </div>
            </div>

            {/* RAM */}
            <div style={S.filterGroup}>
              <p style={S.filterLabel}>Minimum RAM</p>
              <div style={S.chipRow}>
                {RAM_OPTIONS.map(r => (
                  <button key={r}
                    style={{ ...S.chip, ...(minRam === r ? S.chipActive : {}) }}
                    onClick={() => setMinRam(r)}>
                    {r === 0 ? "Any" : `${r}GB+`}
                  </button>
                ))}
              </div>
            </div>

            {/* Weight */}
            <div style={S.filterGroup}>
              <div style={S.sliderHeader}>
                <p style={S.filterLabel}>Max weight</p>
                <span style={S.sliderValue}>{maxWeight >= 300 ? "Any" : `≤ ${maxWeight}g`}</span>
              </div>
              <input type="range" min="130" max="300" step="10" value={maxWeight}
                onChange={e => setMaxWeight(parseInt(e.target.value))} style={S.slider} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={S.filterHint}>130g (light)</span>
                <span style={S.filterHint}>300g (no limit)</span>
              </div>
            </div>

            {/* Segment */}
            <div style={S.filterGroup}>
              <p style={S.filterLabel}>Price segment</p>
              <div style={S.chipRow}>
                {ALL_SEGMENTS.map(s => (
                  <button key={s}
                    style={{ ...S.chip, ...(selSegments.includes(s) ? S.chipActive : {}) }}
                    onClick={() => toggleSegment(s)}>{s}</button>
                ))}
              </div>
              {selSegments.length === 0 && <p style={S.filterHint}>No segment selected = all segments</p>}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={{
          ...S.errorBox,
          background:  error.startsWith("Note:") ? "#fffbeb" : "#fef2f2",
          borderColor: error.startsWith("Note:") ? "#fcd34d" : "#fca5a5",
          color:       error.startsWith("Note:") ? "#92400e" : "#dc2626",
        }}>{error}</div>
      )}

      <div style={S.btnRow}>
        <button style={S.backBtn} onClick={onBack}>Back</button>
        <button style={{ ...S.primaryBtn, flex: 2, opacity: loading ? 0.6 : 1 }}
          onClick={handleSubmit} disabled={loading}>
          {loading ? "Finding phones..." : "Find My Phone"}
        </button>
      </div>
    </div>
  );
}

const S = {
  heading:  { fontSize: "22px", fontWeight: "700", color: "#1f2937", margin: "0 0 8px" },
  subtext:  { color: "#6b7280", fontSize: "15px", margin: "0 0 24px" },
  handCard: {
    background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
    borderRadius: "12px", padding: "16px 20px", color: "#fff",
    display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "28px",
  },
  section:      { marginBottom: "24px" },
  sectionLabel: { display: "block", fontWeight: "600", color: "#374151", fontSize: "15px", marginBottom: "12px" },

  // Presets
  presetsGrid: {
    display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
    gap: "10px", marginBottom: "4px",
  },
  presetCard: {
    display: "flex", flexDirection: "column", alignItems: "center",
    padding: "14px 8px", border: "2px solid #e5e7eb",
    borderRadius: "12px", cursor: "pointer",
    transition: "all 0.15s", position: "relative",
    background: "#fff",
  },
  presetIcon:  { fontSize: "24px", marginBottom: "6px" },
  presetLabel: { fontSize: "13px", fontWeight: "600", marginBottom: "3px" },
  presetDesc:  { fontSize: "11px", color: "#9ca3af", textAlign: "center", lineHeight: 1.4 },
  presetCheck: {
    position: "absolute", top: "6px", right: "8px",
    fontSize: "11px", color: "#4338ca", fontWeight: "700",
  },
  presetActiveBadge: {
    marginLeft: "10px", fontSize: "12px", fontWeight: "600",
    color: "#4338ca", background: "#eef2ff",
    padding: "2px 10px", borderRadius: "20px",
  },

  budgetInput: {
    width: "100%", padding: "12px 14px", border: "2px solid #e5e7eb",
    borderRadius: "10px", fontSize: "18px", fontWeight: "600",
    color: "#1f2937", boxSizing: "border-box", marginBottom: "10px",
  },
  chipRow:    { display: "flex", gap: "8px", flexWrap: "wrap" },
  chip:       { padding: "6px 14px", border: "2px solid #e5e7eb", borderRadius: "20px", background: "#fff", fontSize: "13px", cursor: "pointer", color: "#374151" },
  chipActive: { borderColor: "#6366f1", background: "#eef2ff", color: "#4338ca", fontWeight: "600" },

  sliderGroup:  { marginBottom: "20px" },
  sliderHeader: { display: "flex", justifyContent: "space-between", marginBottom: "8px" },
  sliderLabel:  { fontWeight: "600", color: "#374151", fontSize: "14px" },
  sliderValue:  { color: "#6366f1", fontSize: "14px", fontWeight: "600" },
  slider:       { width: "100%", accentColor: "#6366f1", cursor: "pointer" },
  sliderDesc:   { color: "#9ca3af", fontSize: "12px", margin: "6px 0 0" },

  filtersBox:    { border: "1px solid #e5e7eb", borderRadius: "12px", marginBottom: "24px", overflow: "hidden" },
  filtersToggle: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", background: "#f9fafb", border: "none", cursor: "pointer" },
  filterBadge:   { background: "#eef2ff", color: "#4338ca", fontSize: "11px", fontWeight: "700", padding: "2px 8px", borderRadius: "20px" },
  filterContent: { padding: "16px", borderTop: "1px solid #e5e7eb" },
  filterGroup:   { marginBottom: "20px" },
  filterLabel:   { fontWeight: "600", color: "#374151", fontSize: "14px", margin: "0 0 10px" },
  filterHint:    { fontSize: "11px", color: "#9ca3af", margin: "6px 0 0" },
  clearBtn:      { padding: "6px 14px", border: "1px solid #fca5a5", borderRadius: "8px", background: "#fef2f2", color: "#dc2626", fontSize: "12px", fontWeight: "600", cursor: "pointer", marginBottom: "16px" },
  toggleRow:     { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", borderRadius: "10px", border: "2px solid", cursor: "pointer" },
  toggleTrack:   { width: "42px", height: "24px", borderRadius: "12px", position: "relative", transition: "background 0.2s", flexShrink: 0 },
  toggleThumb:   { position: "absolute", top: "2px", width: "20px", height: "20px", background: "#fff", borderRadius: "50%", transition: "transform 0.2s" },

  errorBox: { border: "1px solid", borderRadius: "8px", padding: "12px 16px", fontSize: "14px", marginBottom: "16px" },
  btnRow:   { display: "flex", gap: "12px" },
  backBtn:  { flex: 1, padding: "14px", border: "2px solid #e5e7eb", borderRadius: "10px", background: "#fff", fontSize: "16px", fontWeight: "600", cursor: "pointer", color: "#374151" },
  primaryBtn: { width: "100%", padding: "14px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: "600", cursor: "pointer" },
};

export default Preferences;