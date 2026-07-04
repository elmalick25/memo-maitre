import React from "react";

// Helper to convert CEFR level string to number (1 to 6)
const getLevelNumber = (lvlStr) => {
  if (!lvlStr) return 0;
  const match = lvlStr.match(/(A1|A2|B1|B2|C1|C2)/i);
  if (!match) return 0;
  const map = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  return map[match[0].toUpperCase()] || 0;
};

// Helper for points computation
const calculatePolygonPoints = (levels, cx, cy, radius, maxVal = 6) => {
  const numAxes = 5;
  const angleStep = (Math.PI * 2) / numAxes;
  let points = [];

  for (let i = 0; i < numAxes; i++) {
    // Start at top (-90 degrees / -PI/2)
    const angle = i * angleStep - Math.PI / 2;
    const value = levels[i] || 0;
    const r = (value / maxVal) * radius;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    points.push(`${x},${y}`);
  }
  return points.join(" ");
};

export default function CEFRTracker({ cefrState, isAnalyzing, triggerAnalysis, callClaude, theme, isDarkMode }) {
  const { productions, analyses } = cefrState;
  const latestAnalysis = analyses[analyses.length - 1] || null;

  const handleForceAnalysis = async () => {
    if (productions.length < 10) {
      alert("Il faut au moins 10 productions pour lancer une analyse fiable.");
      return;
    }
    await triggerAnalysis(callClaude, true);
  };

  // UI colors
  const bgColor = isDarkMode ? "var(--mm-bg-card)" : "white";
  const borderColor = isDarkMode ? "var(--mm-border)" : "var(--mm-border)";

  // Radar logic
  const cx = 150, cy = 150, radius = 100;
  
  let levels = [0,0,0,0,0];
  if (latestAnalysis) {
    levels = [
      getLevelNumber(latestAnalysis.speaking),
      getLevelNumber(latestAnalysis.vocabulary),
      getLevelNumber(latestAnalysis.grammar),
      getLevelNumber(latestAnalysis.listening),
      getLevelNumber(latestAnalysis.writing || latestAnalysis.overall) // writing fallback to overall if missing
    ];
  }

  const axesLabels = ["Speaking", "Vocabulary", "Grammar", "Listening", "Writing"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, padding: "0 16px 40px", animation: "fadeUp 0.3s ease", height: "100%", overflowY: "auto" }} className="tabs-scroll">
      
      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 900, color: theme.text, margin: "0 0 8px 0" }}>🎯 Mon Niveau CEFR</h2>
          <div style={{ fontSize: 14, color: theme.textMuted, fontWeight: 600 }}>
             {productions.length} production{productions.length > 1 ? "s" : ""} stockée{productions.length > 1 ? "s" : ""}
          </div>
        </div>
        <button
          onClick={handleForceAnalysis}
          disabled={isAnalyzing || productions.length < 10}
          style={{
            padding: "10px 20px", borderRadius: 12, border: "none", cursor: (isAnalyzing || productions.length < 10) ? "not-allowed" : "pointer",
            background: isAnalyzing ? theme.textMuted : theme.primary, color: "white", fontWeight: 800, fontSize: 14,
            transition: "all 0.2s", opacity: (isAnalyzing || productions.length < 10) ? 0.5 : 1
          }}
        >
          {isAnalyzing ? "🧠 Claude analyse en cours..." : "🎯 Forcer une évaluation"}
        </button>
      </div>

      {!latestAnalysis ? (
        <div style={{ background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 24, padding: 40, textAlign: "center" }}>
          <span style={{ fontSize: 48, marginBottom: 16, display: "block" }}>📈</span>
          <h3 style={{ fontSize: 18, color: theme.text, marginBottom: 8 }}>Aucune évaluation disponible</h3>
          <p style={{ color: theme.textMuted, maxWidth: 400, margin: "0 auto", lineHeight: 1.5 }}>
            Continue de t'entraîner via le Chat, le Shadowing ou la Dictée. Une analyse détaillée de ton niveau apparaîtra ici après 10 productions.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 24, flexDirection: "row", flexWrap: "wrap" }}>
          
          {/* ── RADAR CHART (SVG) ── */}
          <div style={{ flex: 1, minWidth: 300, background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, padding: 32, display: "flex", flexDirection: "column", alignItems: "center" }}>
            
            <div style={{ 
              marginBottom: 24, display: "inline-flex", flexDirection: "column", alignItems: "center", 
              background: "linear-gradient(135deg, rgba(77, 107, 254,0.1), rgba(77, 107, 254,0.1))",
              padding: "16px 32px", borderRadius: 20, border: `1px solid ${theme.primary}40`,
              boxShadow: `0 8px 30px ${theme.primary}20`
            }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: theme.primary, textTransform: "uppercase", letterSpacing: 1 }}>Niveau Global</span>
              <span style={{ fontSize: 42, fontWeight: 900, color: theme.text }}>{latestAnalysis.overall}</span>
            </div>

            <svg width="300" height="300" viewBox="0 0 300 300">
              {/* Grilles concentriques */}
              {[1, 2, 3, 4, 5, 6].map(level => (
                <polygon
                  key={level}
                  points={calculatePolygonPoints([level, level, level, level, level], cx, cy, radius, 6)}
                  fill="none"
                  stroke={isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.05)"}
                  strokeWidth="1"
                />
              ))}
              
              {/* Lignes des axes */}
              {[0, 1, 2, 3, 4].map(i => {
                const angle = i * ((Math.PI * 2) / 5) - Math.PI / 2;
                const x = cx + radius * Math.cos(angle);
                const y = cy + radius * Math.sin(angle);
                return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.05)"} strokeWidth="1" />;
              })}
              
              {/* Labels des axes */}
              {[0, 1, 2, 3, 4].map(i => {
                const angle = i * ((Math.PI * 2) / 5) - Math.PI / 2;
                // Pousser le label un peu plus loin que le rayon
                const x = cx + (radius + 20) * Math.cos(angle);
                const y = cy + (radius + 20) * Math.sin(angle);
                return (
                  <text key={i} x={x} y={y} fill={theme.textMuted} fontSize="11" fontWeight="700" textAnchor="middle" dominantBaseline="middle">
                    {axesLabels[i]}
                  </text>
                );
              })}

              {/* Polygon de données */}
              <polygon
                points={calculatePolygonPoints(levels, cx, cy, radius, 6)}
                fill={`${theme.primary}40`}
                stroke={theme.primary}
                strokeWidth="2"
                style={{ transition: "all 1s cubic-bezier(0.4, 0, 0.2, 1)" }}
              />

              {/* Points de données */}
              {[0, 1, 2, 3, 4].map(i => {
                const angle = i * ((Math.PI * 2) / 5) - Math.PI / 2;
                const r = (levels[i] / 6) * radius;
                const x = cx + r * Math.cos(angle);
                const y = cy + r * Math.sin(angle);
                return (
                  <circle key={i} cx={x} cy={y} r="4" fill={theme.primary} style={{ transition: "all 1s ease" }} />
                );
              })}
            </svg>

            <div style={{ marginTop: 24, fontSize: 13, color: theme.textMuted, textAlign: "center", fontStyle: "italic" }}>
              {latestAnalysis.justification}
            </div>
          </div>

          {/* ── GAPS & STRENGTHS ── */}
          <div style={{ flex: 2, minWidth: 350, display: "flex", flexDirection: "column", gap: 24 }}>
            
            <div style={{ background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: theme.text, display: "flex", alignItems: "center", gap: 8 }}>
                <span>🚀</span> Next Milestone
              </h3>
              <p style={{ margin: 0, fontSize: 15, color: theme.text, lineHeight: 1.6, fontWeight: 600 }}>
                {latestAnalysis.nextMilestone}
              </p>
            </div>

            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1, background: "rgba(16,185,129,0.05)", borderRadius: 20, padding: 20, border: "1px solid rgba(16,185,129,0.2)" }}>
                <h4 style={{ margin: "0 0 12px 0", color: "#10B981", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>🌟</span> Strengths
                </h4>
                <ul style={{ margin: 0, paddingLeft: 20, color: theme.text, fontSize: 14, lineHeight: 1.5 }}>
                  {latestAnalysis.strengths?.map((str, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>{str}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div style={{ background: bgColor, borderRadius: 24, border: `1px solid ${borderColor}`, padding: 24 }}>
              <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: theme.text, display: "flex", alignItems: "center", gap: 8 }}>
                <span>🔧</span> Areas to Improve (Gaps)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {latestAnalysis.gaps?.map((gap, i) => (
                  <div key={i} style={{ background: isDarkMode ? "rgba(255,255,255,0.03)" : "var(--mm-bg-elev)", padding: 16, borderRadius: 16, border: `1px solid ${borderColor}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontWeight: 800, color: theme.primary }}>{gap.area}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: theme.textMuted }}>{gap.issue}</span>
                    </div>
                    {gap.example && (
                      <div style={{ fontSize: 13, color: theme.text, marginBottom: 8, fontStyle: "italic", borderLeft: `2px solid ${theme.primary}40`, paddingLeft: 8 }}>
                        {gap.example}
                      </div>
                    )}
                    {gap.exercise && (
                      <div style={{ fontSize: 12, fontWeight: 600, color: theme.textMuted, background: "rgba(77,107,254,0.05)", padding: "4px 8px", borderRadius: 6, display: "inline-block" }}>
                        💡 Drill: {gap.exercise}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
