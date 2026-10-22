import React, { useState, useEffect, useMemo } from "react";
import {
  buildReviewSequences,
  countReviews,
  MIN_REVIEWS_FOR_OPTIMIZATION,
} from "../lib/srs/optimizer.js";
import {
  WEIGHTS_STORAGE_KEY,
  runOptimization,
  resetWeights,
  loadAndActivateWeights,
} from "../lib/srs/weightsStore.js";
import {
  getActiveWeights,
  setActiveTargetRetention,
  TARGET_R,
} from "../lib/fsrs.js";
import { storage as appStorage } from "../lib/firebase.js";
import { haptic } from "../lib/haptics.js";

/**
 * FsrsBrainCalibrationCard
 * Carte interactive dans la vue Stats permettant d'ajuster la rétention cible
 * et de calibrer les 17 poids FSRS sur l'historique biologique de l'utilisateur par Adam ML.
 */
export default function FsrsBrainCalibrationCard({
  expressions = [],
  isDarkMode = false,
  theme = {},
  showToast,
}) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [targetR, setTargetR] = useState(TARGET_R);

  // Charger le profil existant au montage
  useEffect(() => {
    let mounted = true;
    loadAndActivateWeights(appStorage)
      .then((p) => {
        if (!mounted) return;
        setProfile(p);
        if (p?.targetRetention) {
          setTargetR(p.targetRetention);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Calcul du nombre de séquences de révision réelles
  const sequences = useMemo(() => {
    return buildReviewSequences(expressions);
  }, [expressions]);

  const reviewCount = useMemo(() => {
    return countReviews(sequences);
  }, [sequences]);

  const progressPct = Math.min(100, Math.round((reviewCount / MIN_REVIEWS_FOR_OPTIMIZATION) * 100));
  const isOptimized = Boolean(profile?.optimizedAt);

  // Lancement de la calibration
  const handleCalibrate = async (isEarly = false) => {
    if (loading) return;
    setLoading(true);
    setProgressText("Initialisation des gradients...");
    try { haptic("tap"); } catch {}

    try {
      const minRequired = isEarly ? Math.min(10, reviewCount) : MIN_REVIEWS_FOR_OPTIMIZATION;
      const res = await runOptimization(expressions, appStorage, {
        minReviews: minRequired,
        iterations: 60,
        learningRate: 0.05,
        onProgress: ({ iteration, iterations }) => {
          setProgressText(`Optimisation Adam : cycle ${iteration}/${iterations}...`);
        },
      });

      if (res.applied) {
        setProfile(res.profile);
        if (res.profile?.targetRetention) {
          setTargetR(res.profile.targetRetention);
        }
        try { haptic("pop"); } catch {}
        const gainPct = Math.round((res.report.improvement || 0) * 100);
        showToast?.(`🧬 Modèle calibré avec succès (+${gainPct}% de précision)`, "success");
      } else {
        showToast?.("Pas assez de données pour faire converger l'algorithme.", "info");
      }
    } catch (err) {
      console.error("[FSRS Optimizer Error]", err);
      showToast?.("Erreur lors de la calibration.", "error");
    } finally {
      setLoading(false);
      setProgressText("");
    }
  };

  // Réinitialisation aux poids standards
  const handleReset = async () => {
    if (loading) return;
    try { haptic("tap"); } catch {}
    try {
      const reset = await resetWeights(appStorage);
      setProfile(reset);
      setTargetR(0.9);
      showToast?.("Poids FSRS réinitialisés aux valeurs standards d'usine.", "info");
    } catch (err) {
      showToast?.("Erreur de réinitialisation", "error");
    }
  };

  // Modification de la rétention cible
  const handleSetRetention = (val) => {
    setTargetR(val);
    setActiveTargetRetention(val);
    try { haptic("tap"); } catch {}
    if (profile) {
      const updated = { ...profile, targetRetention: val };
      setProfile(updated);
      appStorage?.set?.(WEIGHTS_STORAGE_KEY, updated).catch(() => {});
    }
    showToast?.(`Rétention cible réglée à ${Math.round(val * 100)}%`, "success");
  };

  const cardBg = isDarkMode ? "var(--mm-bg-card, #171233)" : "var(--mm-bg-card, #ffffff)";
  const textColor = theme?.text || (isDarkMode ? "#f8fafc" : "#0f172a");
  const mutedColor = theme?.textMuted || (isDarkMode ? "#94a3b8" : "#64748b");
  const borderCol = theme?.border || (isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(15,23,42,0.1)");
  const surfaceSub = isDarkMode ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)";

  return (
    <div
      style={{
        background: cardBg,
        borderRadius: 24,
        padding: "26px",
        border: `1.5px solid ${borderCol}`,
        boxShadow: isDarkMode
          ? "0 8px 32px rgba(0,0,0,0.3)"
          : "0 8px 32px color-mix(in srgb, var(--mm-primary) 8.0%, transparent)",
        position: "relative",
        overflow: "hidden",
        marginBottom: 32,
      }}
    >
      {/* Halo subtil en arrière plan */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: isOptimized
            ? "radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)"
            : "radial-gradient(circle, color-mix(in srgb, var(--mm-primary) 18%, transparent) 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      {/* En-tête */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              background: isOptimized
                ? "rgba(16,185,129,0.15)"
                : "color-mix(in srgb, var(--mm-primary) 14%, transparent)",
              border: `1.5px solid ${isOptimized ? "#10b981" : "var(--mm-primary)"}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
            }}
          >
            🧬
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: textColor, letterSpacing: "-0.01em" }}>
              Calibration Cérébrale FSRS (Machine Learning)
            </h3>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: mutedColor }}>
              Ajustement biologique des 17 paramètres d'oubli par descente de gradient Adam
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              padding: "6px 14px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 800,
              background: isOptimized ? "rgba(16, 185, 129, 0.15)" : surfaceSub,
              color: isOptimized ? "#10b981" : mutedColor,
              border: `1px solid ${isOptimized ? "rgba(16, 185, 129, 0.3)" : borderCol}`,
            }}
          >
            {isOptimized ? `🟢 Calibré (${Math.round((profile.improvement || 0) * 100)}% gain)` : "🌐 Modèle universel standard"}
          </span>
        </div>
      </div>

      {/* Jauge d'apprentissage */}
      <div style={{ background: surfaceSub, borderRadius: 18, padding: "18px 20px", marginBottom: 22, border: `1px solid ${borderCol}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: textColor }}>
            Maturité de votre historique mémoire
          </span>
          <span style={{ fontSize: 13, fontWeight: 900, fontFamily: "'JetBrains Mono', monospace", color: "var(--mm-primary)" }}>
            {reviewCount} / {MIN_REVIEWS_FOR_OPTIMIZATION} révisions ({progressPct}%)
          </span>
        </div>

        {/* Barre de progression */}
        <div style={{ width: "100%", height: 10, background: isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)", borderRadius: 8, overflow: "hidden" }}>
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: isOptimized
                ? "linear-gradient(90deg, #10b981, #059669)"
                : "linear-gradient(90deg, var(--mm-primary), var(--mm-primary-glow))",
              borderRadius: 8,
              transition: "width 0.4s ease",
            }}
          />
        </div>

        <p style={{ margin: "10px 0 0", fontSize: 12, color: mutedColor, lineHeight: 1.5 }}>
          {reviewCount >= MIN_REVIEWS_FOR_OPTIMIZATION
            ? "✨ Données suffisantes pour une calibration de niveau laboratoire !"
            : "💡 Plus vous révisez, plus l'optimiseur affine la vitesse de décroissance synaptique de votre cerveau."}
        </p>
      </div>

      {/* Rétention Cible (Target Retention) */}
      <div style={{ background: surfaceSub, borderRadius: 18, padding: "18px 20px", marginBottom: 22, border: `1px solid ${borderCol}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 800, color: textColor }}>
              Rétention Cible Souhaitée ($R$)
            </span>
            <div style={{ fontSize: 12, color: mutedColor, marginTop: 2 }}>
              Probabilité minimale de succès souhaitée lors d'un rappel
            </div>
          </div>
          <span style={{ fontSize: 16, fontWeight: 900, color: "var(--mm-primary)", fontFamily: "'JetBrains Mono', monospace" }}>
            {Math.round(targetR * 100)}%
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {[
            { val: 0.85, label: "85% · Rapide", desc: "Moins de révisions quotidiennes" },
            { val: 0.90, label: "90% · Équilibré", desc: "Standard d'or (Recommandé)" },
            { val: 0.95, label: "95% · Concours", desc: "Rétention maximale garantie" },
          ].map((item) => {
            const isSelected = Math.abs(targetR - item.val) < 0.01;
            return (
              <button
                key={item.val}
                type="button"
                onClick={() => handleSetRetention(item.val)}
                style={{
                  padding: "12px 10px",
                  borderRadius: 14,
                  border: isSelected
                    ? "2px solid var(--mm-primary)"
                    : `1px solid ${borderCol}`,
                  background: isSelected
                    ? (isDarkMode ? "color-mix(in srgb, var(--mm-primary) 20%, transparent)" : "color-mix(in srgb, var(--mm-primary) 10%, transparent)")
                    : "transparent",
                  color: isSelected ? "var(--mm-primary)" : textColor,
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.15s ease",
                }}
              >
                <div style={{ fontWeight: 800, fontSize: 13 }}>{item.label}</div>
                <div style={{ fontSize: 11, color: mutedColor, marginTop: 4 }}>{item.desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Barre d'action */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={loading || reviewCount < 10}
          onClick={() => handleCalibrate(reviewCount < MIN_REVIEWS_FOR_OPTIMIZATION)}
          style={{
            flex: "1 1 240px",
            padding: "14px 22px",
            borderRadius: 16,
            border: "none",
            background: reviewCount >= 10
              ? "linear-gradient(135deg, var(--mm-primary) 0%, var(--mm-primary-deep, var(--mm-primary)) 100%)"
              : (isDarkMode ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)"),
            color: reviewCount >= 10 ? "#ffffff" : mutedColor,
            fontSize: 14,
            fontWeight: 800,
            cursor: reviewCount >= 10 && !loading ? "pointer" : "not-allowed",
            boxShadow: reviewCount >= 10
              ? "0 8px 24px color-mix(in srgb, var(--mm-primary) 28%, transparent)"
              : "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
        >
          <span>{loading ? "⏳" : "🚀"}</span>
          <span>
            {loading
              ? progressText || "Calcul en cours..."
              : reviewCount >= MIN_REVIEWS_FOR_OPTIMIZATION
                ? "Lancer la calibration Adam"
                : `Calibrer sur mon historique (${reviewCount} révisions)`}
          </span>
        </button>

        {isOptimized && (
          <button
            type="button"
            disabled={loading}
            onClick={handleReset}
            style={{
              padding: "14px 18px",
              borderRadius: 16,
              border: `1px solid ${borderCol}`,
              background: surfaceSub,
              color: mutedColor,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Réinitialiser au standard
          </button>
        )}
      </div>
    </div>
  );
}
