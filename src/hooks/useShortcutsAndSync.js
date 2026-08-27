import { useState, useEffect, useCallback, useMemo } from "react";
import { today } from "../utils/dateUtils";

export default function useShortcutsAndSync({
  view = "dashboard",
  setView = () => {},
  revealed = false,
  handleReveal = () => {},
  handleAnswer = () => {},
  examActive = false,
  examRevealed = false,
  setExamRevealed = () => {},
  handleExamAnswer = () => {},
  examConfig = {},
  setCmdOpen = () => {},
  setAgentSheetOpen = () => {},
  setShowAgentPanel = () => {},
  MOBILE_MQ = "(max-width: 767.98px)",
  projects = [],
  categories = [],
  expressions = [],
  storage = null,
  showToast = () => {},
  syncUserData = null,
  fullDeepSync = null,
  getFbUser = () => null,
}) {
  const [projectConflicts, setProjectConflicts] = useState([]);
  const [manualSyncing, setManualSyncing] = useState(false);

  // ── DÉTECTION DES CONFLITS PROJETS / EXAMENS ─────────────────────────────
  const detectConflicts = useCallback(() => {
    const conflicts = [];
    const getDaysUntil = (d) => {
      if (!d) return null;
      return Math.ceil((new Date(d) - new Date()) / (1000 * 60 * 60 * 24));
    };
    const examDates = (categories || [])
      .filter((c) => c.examDate)
      .map((c) => ({ name: c.name, date: c.examDate, daysLeft: getDaysUntil(c.examDate) }));

    (projects || [])
      .filter((p) => p.status !== "terminé" && p.dueDate)
      .forEach((proj) => {
        const projDays = getDaysUntil(proj.dueDate);
        if (projDays === null) return;
        examDates.forEach((exam) => {
          if (exam.daysLeft === null) return;
          const diff = Math.abs(projDays - exam.daysLeft);
          if (diff <= 5 && projDays >= 0 && exam.daysLeft >= 0) {
            conflicts.push({
              type: "collision",
              project: proj.title,
              exam: exam.name,
              projectDate: proj.dueDate,
              examDate: exam.date,
              severity: diff <= 2 ? "critique" : "avertissement",
              advice:
                diff <= 2
                  ? `⚠️ Rendu "${proj.title}" et examen "${exam.name}" sont à ${diff} jour(s) d'écart ! Avance le projet.`
                  : `📅 "${proj.title}" (J-${projDays}) et examen "${exam.name}" (J-${exam.daysLeft}) se chevauchent cette semaine.`,
            });
          }
        });
      });
    setProjectConflicts(conflicts);
    return conflicts;
  }, [projects, categories]);

  useEffect(() => {
    detectConflicts();
  }, [projects, categories, detectConflicts]);

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
          "list",
          "review",
          "add",
          "stats",
          "categories",
          "projects",
          "badges",
          "lab",
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

      // Raccourcis d'examen
      if (view === "exam" && examActive) {
        if (e.code === "Space" && !examRevealed && !isInField && examConfig?.mode !== "qcm") {
          e.preventDefault();
          setExamRevealed(true);
        }
        if (examRevealed && !isInField && examConfig?.mode !== "qcm") {
          if (e.key === "1") handleExamAnswer(0);
          if (e.key === "2") handleExamAnswer(3);
          if (e.key === "3") handleExamAnswer(5);
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
    examActive,
    examRevealed,
    setExamRevealed,
    handleExamAnswer,
    examConfig,
    setCmdOpen,
    setAgentSheetOpen,
    setShowAgentPanel,
    setView,
    MOBILE_MQ,
  ]);

  return {
    projectConflicts,
    detectConflicts,
    manualSyncing,
    handleManualSync,
    repairSyncNow,
  };
}
