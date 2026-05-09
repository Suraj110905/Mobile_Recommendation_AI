import { useState, useEffect } from "react";
import HandScan    from "./components/HandScan";
import Preferences from "./components/Preferences";
import Results     from "./components/Results";
import History     from "./components/History";
import "./App.css";

const HISTORY_KEY = "phone_scan_history";

function App() {

  const [step,      setStep]      = useState(1);
  const [handData,  setHandData]  = useState(null);
  const [results,   setResults]   = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history,   setHistory]   = useState([]);

  // Load history from localStorage when app starts
  useEffect(() => {
    try {
      const saved = localStorage.getItem(HISTORY_KEY);
      if (saved) setHistory(JSON.parse(saved));
    } catch (e) {
      setHistory([]);
    }
  }, []);

  // Save a new result to history
  function saveToHistory(handData, results) {
    const entry = {
      id:        Date.now(),
      date:      new Date().toLocaleString("en-IN"),
      hand_size: handData.hand_size,
      best_phone: results.best_phone,
      top_5:     results.top_5,
      recommended_screen: results.recommended_screen,
      handData,
      results,
    };
    const updated = [entry, ...history].slice(0, 10); // keep last 10
    setHistory(updated);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    } catch (e) {
      console.log("Could not save to localStorage");
    }
  }

  // Clear all history
  function clearHistory() {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  }

  const steps = ["Hand Scan", "Preferences", "Results"];

  return (
    <div style={styles.app}>

      {/* HEADER */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1 style={styles.title}>SmartPhone Recommender</h1>
            <p style={styles.subtitle}>Find the perfect phone for your hand size</p>
          </div>
          {/* History button — shows count badge if history exists */}
          <button
            style={styles.historyBtn}
            onClick={() => setShowHistory(!showHistory)}
          >
            🕐 History
            {history.length > 0 && (
              <span style={styles.historyBadge}>{history.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* HISTORY PANEL */}
      {showHistory && (
        <History
          history={history}
          onClose={() => setShowHistory(false)}
          onClear={clearHistory}
          onReview={(entry) => {
            setHandData(entry.handData);
            setResults(entry.results);
            setStep(3);
            setShowHistory(false);
          }}
        />
      )}

      {/* STEP BAR — hidden when history is open */}
      {!showHistory && (
        <>
          <div style={styles.stepBar}>
            {steps.map((label, index) => {
              const stepNum    = index + 1;
              const isActive   = step === stepNum;
              const isCompleted = step > stepNum;
              return (
                <div key={stepNum} style={styles.stepItem}>
                  <div style={{
                    ...styles.stepCircle,
                    background: isCompleted ? "#10b981" : isActive ? "#6366f1" : "#e5e7eb",
                    color: (isActive || isCompleted) ? "#fff" : "#9ca3af",
                  }}>
                    {isCompleted ? "✓" : stepNum}
                  </div>
                  <span style={{
                    ...styles.stepLabel,
                    color:      isActive ? "#6366f1" : isCompleted ? "#10b981" : "#9ca3af",
                    fontWeight: isActive ? "600" : "400",
                  }}>
                    {label}
                  </span>
                  {index < steps.length - 1 && (
                    <div style={{
                      ...styles.stepLine,
                      background: isCompleted ? "#10b981" : "#e5e7eb",
                    }} />
                  )}
                </div>
              );
            })}
          </div>

          <div style={styles.content}>
            {step === 1 && (
              <HandScan onComplete={(data) => { setHandData(data); setStep(2); }} />
            )}
            {step === 2 && (
              <Preferences
                handData={handData}
                onComplete={(data) => {
                  setResults(data);
                  saveToHistory(handData, data);  // auto-save
                  setStep(3);
                }}
                onBack={() => setStep(1)}
              />
            )}
            {step === 3 && (
              <Results
                results={results}
                handData={handData}
                onRestart={() => { setStep(1); setHandData(null); setResults(null); }}
              />
            )}
          </div>
        </>
      )}

    </div>
  );
}

const styles = {
  app: { minHeight: "100vh", background: "#f8fafc", fontFamily: "'Segoe UI', sans-serif" },
  header: {
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    padding: "20px",
  },
  headerContent: {
    maxWidth: "640px", margin: "0 auto",
    display: "flex", justifyContent: "space-between", alignItems: "center",
  },
  title:    { color: "#fff", fontSize: "22px", fontWeight: "700", margin: "0 0 4px" },
  subtitle: { color: "rgba(255,255,255,0.8)", fontSize: "13px", margin: 0 },
  historyBtn: {
    background: "rgba(255,255,255,0.2)", color: "#fff",
    border: "1px solid rgba(255,255,255,0.4)",
    padding: "8px 16px", borderRadius: "20px",
    fontSize: "13px", fontWeight: "600", cursor: "pointer",
    display: "flex", alignItems: "center", gap: "6px",
    position: "relative", flexShrink: 0,
  },
  historyBadge: {
    background: "#fff", color: "#6366f1",
    fontSize: "11px", fontWeight: "700",
    padding: "1px 6px", borderRadius: "10px",
  },
  stepBar: {
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "20px", background: "#fff",
    borderBottom: "1px solid #e5e7eb",
  },
  stepItem:   { display: "flex", alignItems: "center", gap: "8px" },
  stepCircle: {
    width: "32px", height: "32px", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "13px", fontWeight: "600", flexShrink: 0,
  },
  stepLabel: { fontSize: "13px", whiteSpace: "nowrap" },
  stepLine:  { width: "48px", height: "2px", marginLeft: "8px" },
  content:   { maxWidth: "640px", margin: "0 auto", padding: "28px 20px" },
};

export default App;