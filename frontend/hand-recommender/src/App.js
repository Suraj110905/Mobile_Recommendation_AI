// App.js
// This is the brain of the frontend.
// It controls which step the user is on and
// passes data between the three pages.

import { useState } from "react";
import HandScan from "./components/HandScan";
import Preferences from "./components/Preferences";
import Results from "./components/Results";
import "./App.css";

function App() {

  // -------------------------------------------------------
  // STATE — data that is remembered across steps
  // -------------------------------------------------------

  // Which step are we on? 1, 2, or 3
  const [step, setStep] = useState(1);

  // Hand analysis result from the API (Step 1 → Step 2)
  // Example: { hand_size: "Medium", ratio: 1.7, ... }
  const [handData, setHandData] = useState(null);

  // Final recommendation result from the API (Step 2 → Step 3)
  // Example: { best_phone: "...", top_5: [...] }
  const [results, setResults] = useState(null);

  // -------------------------------------------------------
  // STEP PROGRESS BAR
  // -------------------------------------------------------
  const steps = ["Hand Scan", "Preferences", "Results"];

  return (
    <div style={styles.app}>

      {/* ---- HEADER ---- */}
      <div style={styles.header}>
        <h1 style={styles.title}>SmartPhone Recommender</h1>
        <p style={styles.subtitle}>Find the perfect phone for your hand size</p>
      </div>

      {/* ---- STEP INDICATOR ---- */}
      <div style={styles.stepBar}>
        {steps.map((label, index) => {
          const stepNum = index + 1;
          const isActive    = step === stepNum;
          const isCompleted = step > stepNum;

          return (
            <div key={stepNum} style={styles.stepItem}>
              {/* Circle with step number */}
              <div style={{
                ...styles.stepCircle,
                background: isCompleted ? "#10b981" : isActive ? "#6366f1" : "#e5e7eb",
                color: (isActive || isCompleted) ? "#fff" : "#9ca3af",
              }}>
                {isCompleted ? "✓" : stepNum}
              </div>

              {/* Step label */}
              <span style={{
                ...styles.stepLabel,
                color: isActive ? "#6366f1" : isCompleted ? "#10b981" : "#9ca3af",
                fontWeight: isActive ? "600" : "400",
              }}>
                {label}
              </span>

              {/* Connector line between steps */}
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

      {/* ---- PAGE CONTENT ---- */}
      {/* Each step renders a different component */}
      <div style={styles.content}>

        {step === 1 && (
          <HandScan
            onComplete={(data) => {
              setHandData(data);   // save hand analysis result
              setStep(2);          // move to next step
            }}
          />
        )}

        {step === 2 && (
          <Preferences
            handData={handData}
            onComplete={(data) => {
              setResults(data);    // save recommendations
              setStep(3);          // move to results
            }}
            onBack={() => setStep(1)}
          />
        )}

        {step === 3 && (
          <Results
            results={results}
            handData={handData}
            onRestart={() => {
              setStep(1);          // start over
              setHandData(null);
              setResults(null);
            }}
          />
        )}

      </div>

    </div>
  );
}

// -------------------------------------------------------
// STYLES
// -------------------------------------------------------
const styles = {
  app: {
    minHeight: "100vh",
    background: "#f8fafc",
    fontFamily: "'Segoe UI', sans-serif",
  },
  header: {
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    padding: "32px 20px",
    textAlign: "center",
  },
  title: {
    color: "#fff",
    fontSize: "28px",
    fontWeight: "700",
    margin: "0 0 8px 0",
  },
  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: "15px",
    margin: 0,
  },
  stepBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 20px",
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    gap: "0px",
  },
  stepItem: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  stepCircle: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "13px",
    fontWeight: "600",
    flexShrink: 0,
  },
  stepLabel: {
    fontSize: "13px",
    whiteSpace: "nowrap",
  },
  stepLine: {
    width: "48px",
    height: "2px",
    marginLeft: "8px",
  },
  content: {
    maxWidth: "640px",
    margin: "0 auto",
    padding: "32px 20px",
  },
};

export default App;