// SpeakItChallenge.jsx — "USE IT OR LOSE IT"
// ─────────────────────────────────────────────────────────────────────────────
// Problème résolu : mémoriser des fiches ≠ savoir les UTILISER en conversation.
//
// Solution : un mini-défi quotidien de 90 secondes.
//   1. Le système tire 3 expressions récentes (créées dans les 7 derniers
//      jours OU dont l'FSRS estime qu'elles glissent).
//   2. Un scénario ultra-court est généré (1 ligne de contexte + rôle).
//   3. L'utilisateur PARLE (STT Groq déjà présent dans le projet, ou lecture
//      texte en fallback). L'IA (callClaude) analyse la transcription et
//      détecte quelles cibles ont été réellement employées.
//   4. Scoring : chaque expression employée passe en "activated"
//      (reviewHistory.push({type:"speak-use", ts})) et gagne +25 XP.
//
// Câblage : ce composant est autonome. À importer dans Practice ou dans un
// bouton "Défi du jour" sur la home.
//
//   <SpeakItChallenge
//     expressions={expressions}
//     setExpressions={setExpressions}
//     callClaude={callClaude}
//     transcribeWithGroq={transcribeWithGroq}   // optionnel — sinon fallback textarea
//     awardXP={awardXP}
//     showToast={showToast}
//     theme={theme}
//     isDarkMode={isDarkMode}
//     onClose={() => setSpeakItOpen(false)}
//   />
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useMemo, useRef, useState } from "react";

function pickTargets(expressions) {
  const now = Date.now();
  const week = 7 * 24 * 3600 * 1000;
  const scored = expressions.map(e => {
    const created = new Date(e.createdAt || 0).getTime();
    const ageDays = (now - created) / (24 * 3600 * 1000);
    const reps = e.repetitions || 0;
    // Score = nouveauté + fragilité (peu de reps mais >2j = candidat idéal)
    let score = 0;
    if (now - created < week) score += 3;
    if (reps < 3) score += 2;
    if (ageDays > 2 && ageDays < 30) score += 1;
    return { ...e, __score: score };
  });
  const sorted = scored.filter(e => e.__score > 0).sort((a, b) => b.__score - a.__score);
  // Randomise dans le top 8 pour éviter la répétition
  const pool = sorted.slice(0, 8);
  const out = [];
  while (out.length < 3 && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

const SCENARIOS = [
  "Tu retrouves un ancien collègue dans un café à Londres. Raconte-lui ce que tu fais maintenant.",
  "Tu passes un entretien pour un poste de rêve. On te demande : pourquoi TOI ?",
  "Tu recommandes une série à un ami anglophone. Convaincs-le en 30 secondes.",
  "Tu es coincé à l'aéroport, ton vol est annulé. Explique la situation au comptoir.",
  "Un ami te demande pourquoi tu apprends l'anglais avec autant d'intensité. Réponds honnêtement.",
  "Tu dois pitcher ton projet perso à un investisseur en 45 secondes.",
];

async function gradeUsage({ callClaude, targets, transcript }) {
  const list = targets.map((t, i) => `${i + 1}. "${t.front}"`).join("\n");
  const sys = `Tu es un juge d'anglais oral. On te donne une transcription et une liste de N expressions cibles.
Détermine pour CHAQUE cible si elle a été employée de façon naturelle (pas juste récitée) dans la transcription.
Sois indulgent sur les variations grammaticales mineures (temps, personne).
Réponds UNIQUEMENT en JSON :
{"results":[{"idx":1,"used":true,"evidence":"citation exacte de la transcription","comment":"1 phrase FR"}]}`;
  const user = `CIBLES :\n${list}\n\nTRANSCRIPTION :\n"${transcript}"`;
  try {
    const raw = await callClaude(sys, user, { maxTokens: 500, grounding: false });
    const text = typeof raw === "string" ? raw : (raw?.text || "");
    const clean = text.replace(/```json|```/gi, "").trim();
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end < 0) return null;
    return JSON.parse(clean.slice(start, end + 1));
  } catch (e) {
    console.warn("[SpeakIt] grading failed", e);
    return null;
  }
}

export default function SpeakItChallenge({
  expressions = [],
  setExpressions,
  callClaude,
  transcribeWithGroq,
  awardXP,
  showToast,
  theme,
  isDarkMode,
  onClose,
}) {
  const [targets, setTargets] = useState(() => pickTargets(expressions));
  const [scenario, setScenario] = useState(() => SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]);
  const [phase, setPhase] = useState("brief"); // brief | recording | typing | grading | result
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(90);

  useEffect(() => {
    if (phase !== "recording") return;
    if (countdown <= 0) { stopRecording(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, countdown]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (transcribeWithGroq) {
          setPhase("grading");
          try {
            const txt = await transcribeWithGroq(blob);
            setTranscript(txt || "");
            await grade(txt || "");
          } catch (e) {
            showToast?.("Transcription impossible — écris ta réponse à la place", "error");
            setPhase("typing");
          }
        } else {
          setPhase("typing");
        }
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setPhase("recording");
      setCountdown(90);
    } catch (e) {
      showToast?.("Micro indisponible — passe en mode texte", "error");
      setPhase("typing");
    }
  };

  const stopRecording = () => {
    if (mediaRef.current && recording) {
      mediaRef.current.stop();
      setRecording(false);
    }
  };

  const grade = async (txt) => {
    setPhase("grading");
    const res = await gradeUsage({ callClaude, targets, transcript: txt });
    if (!res?.results) {
      showToast?.("Correcteur indisponible, réessaie", "error");
      setPhase("brief");
      return;
    }
    setResult(res);
    setPhase("result");

    // Récompenser + marquer "activated"
    res.results.forEach(r => {
      if (!r.used) return;
      const target = targets[r.idx - 1];
      if (!target) return;
      setExpressions?.(prev => prev.map(e => {
        if (e.id !== target.id) return e;
        const history = Array.isArray(e.reviewHistory) ? e.reviewHistory : [];
        return {
          ...e,
          reviewHistory: [...history, { type: "speak-use", ts: Date.now(), evidence: r.evidence }],
          repetitions: (e.repetitions || 0) + 1,
        };
      }));
      try { awardXP?.(25, 4, `🎤 Expression employée : ${target.front}`); } catch {}
    });
  };

  const bg   = isDarkMode ? "#0F172A" : "#FFFFFF";
  const card = isDarkMode ? "#1E293B" : "#F8FAFF";
  const text = theme?.text || (isDarkMode ? "#F8FAFF" : "#0F172A");
  const muted= theme?.textMuted || (isDarkMode ? "#94A3B8" : "#64748B");

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999, padding: 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: bg, borderRadius: 24, padding: 28, maxWidth: 560, width: "100%",
        maxHeight: "90vh", overflowY: "auto", color: text, position: "relative",
        boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
      }}>
        <button onClick={onClose} style={{
          position: "absolute", top: 16, right: 16, background: "transparent",
          border: "none", color: muted, fontSize: 20, cursor: "pointer",
        }}>✕</button>

        <h2 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 900 }}>🎤 Speak-it Challenge</h2>
        <p style={{ margin: "0 0 20px", color: muted, fontSize: 14 }}>
          Prouve que tu SAIS UTILISER ces expressions, pas juste les reconnaître.
        </p>

        {phase === "brief" && (
          <>
            <div style={{ background: card, borderRadius: 16, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 8 }}>Scénario</div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{scenario}</p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", marginBottom: 10 }}>
                Cibles à caser naturellement (≥ 2 / 3 pour valider)
              </div>
              {targets.length === 0 ? (
                <p style={{ color: muted }}>Pas encore assez de fiches récentes. Reviens après avoir ajouté quelques expressions.</p>
              ) : targets.map((t, i) => (
                <div key={t.id} style={{
                  padding: "10px 14px", background: card, borderRadius: 12,
                  marginBottom: 8, display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#4D6BFE" }}>{i + 1}</span>
                  <strong style={{ fontSize: 15 }}>{t.front}</strong>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                disabled={!targets.length}
                onClick={startRecording}
                style={{
                  flex: 1, padding: "14px", background: "linear-gradient(135deg, #6B82F5, #4D6BFE)",
                  color: "white", border: "none", borderRadius: 100, fontWeight: 800, fontSize: 15,
                  cursor: targets.length ? "pointer" : "not-allowed", opacity: targets.length ? 1 : 0.4,
                }}
              >🔴 Parler (90s)</button>
              <button
                disabled={!targets.length}
                onClick={() => setPhase("typing")}
                style={{
                  padding: "14px 20px", background: card, color: text,
                  border: "none", borderRadius: 100, fontWeight: 700, cursor: "pointer",
                }}
              >⌨️ Écrire</button>
            </div>
          </>
        )}

        {phase === "recording" && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 72, marginBottom: 8, animation: "pulse 1.2s ease-in-out infinite" }}>🎙️</div>
            <div style={{ fontSize: 32, fontWeight: 900, marginBottom: 12 }}>{countdown}s</div>
            <p style={{ color: muted, marginBottom: 20 }}>Parle. Ne récite pas — RACONTE.</p>
            <button onClick={stopRecording} style={{
              padding: "12px 32px", background: "#EF4444", color: "white",
              border: "none", borderRadius: 100, fontWeight: 800, cursor: "pointer",
            }}>⏹ Stop</button>
            <style>{`@keyframes pulse { 50% { transform: scale(1.1); } }`}</style>
          </div>
        )}

        {phase === "typing" && (
          <>
            <textarea
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="Écris ta réponse en anglais (2-4 phrases)..."
              style={{
                width: "100%", minHeight: 140, padding: 14, borderRadius: 12,
                border: `1px solid ${muted}`, background: card, color: text,
                fontSize: 15, lineHeight: 1.5, fontFamily: "inherit", marginBottom: 12, boxSizing: "border-box",
              }}
            />
            <button
              disabled={transcript.trim().length < 10}
              onClick={() => grade(transcript)}
              style={{
                width: "100%", padding: 14, background: "linear-gradient(135deg, #6B82F5, #4D6BFE)",
                color: "white", border: "none", borderRadius: 100, fontWeight: 800, fontSize: 15,
                cursor: transcript.trim().length >= 10 ? "pointer" : "not-allowed",
                opacity: transcript.trim().length >= 10 ? 1 : 0.4,
              }}
            >Évaluer ma réponse</button>
          </>
        )}

        {phase === "grading" && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚖️</div>
            <p>L'IA analyse ta réponse...</p>
          </div>
        )}

        {phase === "result" && result && (
          <>
            <div style={{ background: card, borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 14, fontStyle: "italic", color: muted }}>
              « {transcript} »
            </div>
            {result.results.map((r, i) => {
              const t = targets[r.idx - 1];
              if (!t) return null;
              return (
                <div key={i} style={{
                  padding: 14, marginBottom: 10, borderRadius: 12,
                  background: r.used ? "rgba(16,185,129,0.12)" : "rgba(239,68,68,0.08)",
                  borderLeft: `4px solid ${r.used ? "#10B981" : "#EF4444"}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>{r.used ? "✅" : "❌"}</span>
                    <strong>{t.front}</strong>
                  </div>
                  {r.evidence && <div style={{ fontSize: 13, color: muted, fontStyle: "italic" }}>« {r.evidence} »</div>}
                  {r.comment && <div style={{ fontSize: 13, marginTop: 4 }}>{r.comment}</div>}
                </div>
              );
            })}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button onClick={() => { setResult(null); setTranscript(""); setTargets(pickTargets(expressions)); setScenario(SCENARIOS[Math.floor(Math.random()*SCENARIOS.length)]); setPhase("brief"); }} style={{
                flex: 1, padding: 12, background: card, color: text, border: "none", borderRadius: 100, fontWeight: 700, cursor: "pointer",
              }}>🔁 Nouveau défi</button>
              <button onClick={onClose} style={{
                flex: 1, padding: 12, background: "linear-gradient(135deg, #6B82F5, #4D6BFE)", color: "white", border: "none", borderRadius: 100, fontWeight: 800, cursor: "pointer",
              }}>Terminé</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
