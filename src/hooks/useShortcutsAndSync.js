import { useState, useEffect, useCallback, useMemo } from "react";
import { today } from "../utils/dateUtils";

export default function useShortcutsAndSync({
  view = "dashboard",
  setView = () => {},
  revealed = false,
  handleReveal = () => {},
  handleAnswer = () => {},
  setCmdOpen = () => {},
  setAgentSheetOpen = () => {},
  setShowAgentPanel = () => {},
  MOBILE_MQ = "(max-width: 767.98px)",
  categories = [],
  expressions = [],
  storage = null,
  showToast = () => {},
  syncUserData = null,
  fullDeepSync = null,
  getFbUser = () => null,
}) {
  const [manualSyncing, setManualSyncing] = useState(false);

  // ── SYNCHRONISATION MANUELLE & RÉPARATION ─────────────────────────────────
  const handleManualSync = useCallback(async () => {
    if (manualSyncing) return;
    setManualSyncing(true);
    try {
      if (typeof syncUserData === "function") {
        await syncUserData();
      }
      showToast("☁️ Données synchronisées avec succès !", "success");
    } catch (err) {
      showToast("⚠️ Erreur synchro : " + (err.message || err), "error");
    } finally {
      setManualSyncing(false);
    }
  }, [manualSyncing, syncUserData, showToast]);

  const repairSyncNow = useCallback(async () => {
    if (manualSyncing) return;
    setManualSyncing(true);
    try {
      if (typeof fullDeepSync === "function") {
        await fullDeepSync();
      }
      showToast("🛠️ Synchro réparée et recalculée avec succès !", "success");
    } catch (err) {
      showToast("⚠️ Erreur réparation synchro : " + (err.message || err), "error");
    } finally {
      setManualSyncing(false);
    }
  }, [manualSyncing, fullDeepSync, showToast]);

  // ── RACCOURCIS CLAVIER GLOBAUX ───────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement ? document.activeElement.tagName : "";
      const isInField =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (document.activeElement && document.activeElement.isContentEditable);

      // ⌘K / Ctrl+K : Palette de commandes
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setCmdOpen((o) => !o);
        return;
      }

      // ⌘J / Ctrl+J : Assistant IA
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        const isMobile = typeof window !== "undefined" && window.matchMedia(MOBILE_MQ).matches;
        if (isMobile) setAgentSheetOpen((o) => !o);
        else setShowAgentPanel((o) => !o);
        return;
      }

      // ⌥1-9 : Navigation rapide desktop
      if (e.altKey && !isNaN(Number(e.key)) && Number(e.key) >= 1 && Number(e.key) <= 9) {
        const navMap = [
          "dashboard",
          "add",
          "list",
          "categories",
          "certifications",
          "practice",
          "veille",
          "opensource",
          "stats",
        ];
        const targetView = navMap[Number(e.key) - 1];
        if (targetView) {
          e.preventDefault();
          setView(targetView);
        }
        return;
      }

      // Raccourcis de révision
      if (view === "review") {
        if (e.code === "Space" && !revealed && !isInField) {
          e.preventDefault();
          handleReveal();
        }
        if (revealed && !isInField) {
          if (e.key === "1") handleAnswer(0);
          if (e.key === "2") handleAnswer(1);
          if (e.key === "3") handleAnswer(3);
          if (e.key === "4") handleAnswer(5);
        }
      }

    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    view,
    revealed,
    handleReveal,
    handleAnswer,
    setCmdOpen,
    setAgentSheetOpen,
    setShowAgentPanel,
    setView,
    MOBILE_MQ,
  ]);

  return {
    manualSyncing,
    handleManualSync,
    repairSyncNow,
  };
}
