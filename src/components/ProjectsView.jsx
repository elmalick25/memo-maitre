import React, { useState, useEffect, useRef, useCallback } from "react";
import HoloCard from "./HoloCard";
import { safeParseJSON } from "../lib/textUtils";
import { today } from "../utils/dateUtils";

export default function ProjectsView({
  projects = [],
  setProjects,
  categories = [],
  expressions = [],
  setExpressions,
  todayReviews = [],
  theme,
  isDarkMode,
  showToast,
  callClaude,
  projectSubView: externalProjectSubView,
  setProjectSubView: setExternalProjectSubView,
  projectConflicts: externalProjectConflicts,
  setProjectConflicts: setExternalProjectConflicts,
  projectPomodoroActive: externalProjectPomodoroActive,
  setProjectPomodoroActive: setExternalProjectPomodoroActive,
  projectPomodoroTime: externalProjectPomodoroTime,
  setProjectPomodoroTime: setExternalProjectPomodoroTime,
  projectPomodoroMode: externalProjectPomodoroMode,
  setProjectPomodoroMode: setExternalProjectPomodoroMode,
}) {
  const [internalProjectSubView, setInternalProjectSubView] = useState("hub");
  const projectSubView = externalProjectSubView !== undefined ? externalProjectSubView : internalProjectSubView;
  const setProjectSubView = setExternalProjectSubView || setInternalProjectSubView;
  const [activeProject, setActiveProject] = useState(null);
  const [projectForm, setProjectForm] = useState({
    title: "", description: "", category: "", dueDate: "", estimatedHours: 8, priority: "haute", color: "#8B5CF6", status: "en_cours"
  });
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectDecomposing, setProjectDecomposing] = useState(false);
  const [projectCoachLoading, setProjectCoachLoading] = useState(false);
  const [projectCoachMessages, setProjectCoachMessages] = useState([]);
  const [projectCoachInput, setProjectCoachInput] = useState("");
  const [projectPlannerData, setProjectPlannerData] = useState(null);
  const [projectPlannerLoading, setProjectPlannerLoading] = useState(false);
  
  const [internalProjectConflicts, setInternalProjectConflicts] = useState([]);
  const projectConflicts = externalProjectConflicts !== undefined ? externalProjectConflicts : internalProjectConflicts;
  const setProjectConflicts = setExternalProjectConflicts || setInternalProjectConflicts;

  const [internalProjectPomodoroActive, setInternalProjectPomodoroActive] = useState(false);
  const projectPomodoroActive = externalProjectPomodoroActive !== undefined ? externalProjectPomodoroActive : internalProjectPomodoroActive;
  const setProjectPomodoroActive = setExternalProjectPomodoroActive || setInternalProjectPomodoroActive;

  const [internalProjectPomodoroTime, setInternalProjectPomodoroTime] = useState(25 * 60);
  const projectPomodoroTime = externalProjectPomodoroTime !== undefined ? externalProjectPomodoroTime : internalProjectPomodoroTime;
  const setProjectPomodoroTime = setExternalProjectPomodoroTime || setInternalProjectPomodoroTime;

  const [internalProjectPomodoroMode, setInternalProjectPomodoroMode] = useState("study");
  const projectPomodoroMode = externalProjectPomodoroMode !== undefined ? externalProjectPomodoroMode : internalProjectPomodoroMode;
  const setProjectPomodoroMode = setExternalProjectPomodoroMode || setInternalProjectPomodoroMode;

  const [projectPomodoroTask, setProjectPomodoroTask] = useState(null);

  const getDaysUntil = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  };

  const getProjectProgress = (project) => {
    const tasks = project?.tasks || [];
    if (!tasks.length) return 0;
    return Math.round((tasks.filter(t => t.done).length / tasks.length) * 100);
  };

  const formatPomodoro = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const createProject = () => {
    if (!projectForm.title.trim()) return;
    const newProject = {
      id: Date.now().toString(),
      ...projectForm,
      tasks: [],
      createdAt: today ? today() : new Date().toISOString().slice(0, 10),
      completedAt: null,
      pomodorosDone: 0,
      linkedCards: [],
    };
    setProjects(prev => [newProject, ...prev]);
    setProjectForm({ title: "", description: "", category: "", dueDate: "", estimatedHours: 8, priority: "haute", color: "#8B5CF6", status: "en_cours" });
    setShowProjectForm(false);
    showToast?.("🗂️ Projet créé !");
  };

  const deleteProject = (id) => {
    if (typeof window !== "undefined" && !window.confirm("Supprimer ce projet ?")) return;
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject?.id === id) {
      setActiveProject(null);
      setProjectSubView("hub");
    }
    showToast?.("Projet supprimé", "error");
  };

  const updateTask = (projectId, taskId, updates) => {
    setProjects(prev => prev.map(p => p.id === projectId
      ? { ...p, tasks: (p.tasks || []).map(t => t.id === taskId ? { ...t, ...updates } : t) }
      : p
    ));
    setActiveProject(prev => prev?.id === projectId
      ? { ...prev, tasks: (prev.tasks || []).map(t => t.id === taskId ? { ...t, ...updates } : t) }
      : prev
    );
  };

  const toggleTask = (projectId, taskId) => {
    const project = projects.find(p => p.id === projectId);
    const task = project?.tasks?.find(t => t.id === taskId);
    if (!task) return;
    updateTask(projectId, taskId, { done: !task.done, completedAt: !task.done ? (today ? today() : new Date().toISOString().slice(0, 10)) : null });
  };

  const decomposeProject = async (project) => {
    setProjectDecomposing(true);
    try {
      const examContext = categories.filter(c => c.examDate).map(c => {
        const d = getDaysUntil(c.examDate);
        return d !== null && d > 0 ? `Examen ${c.name} dans J-${d}` : null;
      }).filter(Boolean).join(", ");

      const raw = await callClaude(
        `Tu es un expert en gestion de projet académique pour un étudiant en Licence Informatique à Dakar. 
Génère un plan de projet détaillé en JSON STRICT (sans markdown):
{"tasks":[{"id":"t1","title":"Titre court de la tâche","description":"Détail actionnable","estimatedHours":2,"phase":"analyse|conception|développement|test|rendu","priority":"haute|normale|basse","dependsOn":[],"suggestedDate":"YYYY-MM-DD","generateCards":true,"cardConcepts":["concept1","concept2"]}],"phases":["analyse","conception","développement","test","rendu"],"keyRisks":["risque1","risque2"],"studyAdvice":"Conseil de révision lié au projet","estimatedTotalHours":20}
Projet: "${project.title}" — ${project.description || "Projet académique"}
Date de rendu: ${project.dueDate || "non définie"}
Heures estimées: ${project.estimatedHours}h
Contexte examens: ${examContext || "aucun examen proche"}
Génère 6-10 tâches logiques et ordonnées. Pour les tâches liées à des concepts techniques, indique les concepts à apprendre.`,
        `Décompose ce projet en tâches.`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      const tasks = (parsed.tasks || []).map(t => ({
        ...t,
        id: (typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString() + Math.random()),
        done: false,
        completedAt: null,
      }));
      const updatedProject = { ...project, tasks, decomposed: true, decomposedData: parsed };
      setProjects(prev => prev.map(p => p.id === project.id ? updatedProject : p));
      setActiveProject(updatedProject);
      showToast?.(`✅ ${tasks.length} tâches générées par l'IA !`);
    } catch (err) {
      showToast?.("Erreur décomposition : " + err.message, "error");
    }
    setProjectDecomposing(false);
  };

  const detectConflicts = useCallback(() => {
    const conflicts = [];
    const examDates = categories.filter(c => c.examDate).map(c => ({ name: c.name, date: c.examDate, daysLeft: getDaysUntil(c.examDate) }));
    projects.filter(p => p.status !== "terminé" && p.dueDate).forEach(proj => {
      const projDays = getDaysUntil(proj.dueDate);
      if (projDays === null) return;
      examDates.forEach(exam => {
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
            advice: diff <= 2
              ? `⚠️ Rendu "${proj.title}" et examen "${exam.name}" sont à ${diff} jour(s) d'écart ! Avance le projet.`
              : `📅 "${proj.title}" (J-${projDays}) et examen "${exam.name}" (J-${exam.daysLeft}) se chevauchent cette semaine.`
          });
        }
      });
    });
    setProjectConflicts(conflicts);
    return conflicts;
  }, [projects, categories]);

  useEffect(() => { detectConflicts(); }, [projects, categories, detectConflicts]);

  const generateCrunchPlan = async () => {
    setProjectPlannerLoading(true);
    try {
      const activeProjects = projects.filter(p => p.status !== "terminé");
      const examContext = categories.filter(c => c.examDate && getDaysUntil(c.examDate) > 0)
        .map(c => `${c.name}: J-${getDaysUntil(c.examDate)}`).join(", ");
      const dueReviews = todayReviews.length;
      const projectsContext = activeProjects.map(p => {
        const tasks = p.tasks || [];
        const progress = getProjectProgress(p);
        const remaining = tasks.filter(t => !t.done).length;
        return `"${p.title}" (${progress}% fait, ${remaining} tâches restantes, rendu: ${p.dueDate || "non défini"})`;
      }).join("; ");

      const raw = await callClaude(
        `Tu es un coach de planning expert pour étudiant sénégalais en Licence Informatique. Génère un plan optimisé pour les 7 prochains jours en JSON STRICT:
{"days":[{"date":"YYYY-MM-DD","dayLabel":"Lun 27","slots":[{"time":"08h00","duration":90,"type":"revision|projet|break","activity":"Description courte","module":"nom module ou projet","priority":"haute|normale"}]}],"weekSummary":"Résumé stratégique","warnings":["avertissement1"],"tip":"Conseil motivant"}
Données actuelles:
- Fiches à réviser aujourd'hui: ${dueReviews}
- Examens à venir: ${examContext || "aucun"}
- Projets actifs: ${projectsContext || "aucun"}`,
        `Génère le planning Crunch.`
      );
      const clean = raw.replace(/```json|```/g, "").trim();
      const parsed = safeParseJSON(clean);
      setProjectPlannerData(parsed);
      showToast?.("📅 Planning Crunch généré !");
    } catch (err) {
      showToast?.("Erreur planning : " + err.message, "error");
    }
    setProjectPlannerLoading(false);
  };

  const sendProjectCoachMessage = async (text) => {
    if (!text?.trim()) return;
    const userMsg = { role: "user", text: text.trim() };
    setProjectCoachMessages(prev => [...prev, userMsg]);
    setProjectCoachInput("");
    setProjectCoachLoading(true);

    try {
      const context = activeProject
        ? `Projet actuel: "${activeProject.title}" (progression: ${getProjectProgress(activeProject)}%, ${activeProject.tasks?.length || 0} tâches)`
        : `Projets: ${projects.map(p => p.title).join(", ")}`;

      const reply = await callClaude(
        `Tu es le Coach Projets IA de l'étudiant. ${context}. Réponds de façon concise, encourageante et ultra-actionnable. Donnes des étapes concrètes.`,
        text.trim()
      );
      setProjectCoachMessages(prev => [...prev, { role: "assistant", text: reply }]);
    } catch (err) {
      setProjectCoachMessages(prev => [...prev, { role: "assistant", text: "Désolé, une erreur est survenue." }]);
    }
    setProjectCoachLoading(false);
  };

  useEffect(() => {
    let timer = null;
    if (projectPomodoroActive && projectPomodoroTime > 0) {
      timer = setInterval(() => {
        setProjectPomodoroTime(t => {
          if (t <= 1) {
            setProjectPomodoroActive(false);
            showToast?.("🔔 Session Pomodoro terminée !");
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => { if (timer) clearInterval(timer); };
  }, [projectPomodoroActive, projectPomodoroTime, showToast]);

  return (
    <div style={{ animation: "fadeUp 0.4s ease" }}>
      {/* Header + Tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: theme?.highlight || "#8B5CF6", margin: 0 }}>🗂️ Projets</h1>
          <p style={{ color: theme?.textMuted, marginTop: 4 }}>Gestion intelligente · IA · Planificateur anti-collision</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["hub", "planner", "coach", "fusion"].map(tab => (
            <button key={tab} onClick={() => setProjectSubView(tab)} style={{
              padding: "8px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer",
              background: projectSubView === tab ? "#7C3AED" : (theme?.cardBg || "transparent"),
              color: projectSubView === tab ? "white" : theme?.textMuted,
              border: projectSubView !== tab ? `1px solid ${theme?.border}` : "none",
            }}>
              {tab === "hub" ? "🗂️ Hub" : tab === "planner" ? "📅 Planificateur" : tab === "coach" ? "🤖 Coach IA" : "🎯 Fusion Pomodoro"}
            </button>
          ))}
          <button onClick={() => setShowProjectForm(true)} style={{ padding: "8px 18px", background: "linear-gradient(135deg,#7C3AED,#8B5CF6)", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
            ＋ Nouveau projet
          </button>
        </div>
      </div>

      {/* ── Conflict Banner ── */}
      {projectConflicts.length > 0 && (
        <div style={{ background: projectConflicts.some(c => c.severity === "critique") ? "#FEF2F2" : "#FAF5FF", border: `2px solid ${projectConflicts.some(c => c.severity === "critique") ? "#EF4444" : "#A855F7"}`, borderRadius: 16, padding: "16px 20px", marginBottom: 20 }}>
          <div style={{ fontWeight: 800, color: projectConflicts.some(c => c.severity === "critique") ? "#991B1B" : "#4C1D95", marginBottom: 8, fontSize: 15 }}>
            {projectConflicts.some(c => c.severity === "critique") ? "🚨" : "⚠️"} {projectConflicts.length} conflit{projectConflicts.length > 1 ? "s" : ""} détecté{projectConflicts.length > 1 ? "s" : ""}
          </div>
          {projectConflicts.map((c, i) => (
            <div key={i} style={{ fontSize: 13, color: c.severity === "critique" ? "#EF4444" : "#8B5CF6", marginBottom: 4 }}>{c.advice}</div>
          ))}
        </div>
      )}

      {/* Modal nouveau projet */}
      {showProjectForm && (
        <div style={{ background: theme?.cardBg, border: `2px solid #7C3AED`, borderRadius: 20, padding: 28, marginBottom: 24 }}>
          <h3 style={{ color: theme?.highlight || "#8B5CF6", margin: "0 0 20px" }}>✦ Nouveau projet</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 700 }}>Titre du projet *</label>
              <input value={projectForm.title} onChange={e => setProjectForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Projet Java Spring Boot..." style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme?.inputBg, border: `1.5px solid ${theme?.border}`, borderRadius: 12, color: theme?.text, fontSize: 14 }} />
            </div>
            <div style={{ gridColumn: "1/-1" }}>
              <label style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 700 }}>Description</label>
              <textarea value={projectForm.description} onChange={e => setProjectForm(f => ({ ...f, description: e.target.value }))} placeholder="Décris ton projet en quelques mots..." style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme?.inputBg, border: `1.5px solid ${theme?.border}`, borderRadius: 12, color: theme?.text, minHeight: 80, resize: "vertical" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 700 }}>Module lié</label>
              <select value={projectForm.category} onChange={e => setProjectForm(f => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme?.inputBg, border: `1.5px solid ${theme?.border}`, borderRadius: 12, color: theme?.text }}>
                <option value="">Aucun</option>
                {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 700 }}>Date de rendu</label>
              <input type="date" value={projectForm.dueDate} onChange={e => setProjectForm(f => ({ ...f, dueDate: e.target.value }))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme?.inputBg, border: `1.5px solid ${theme?.border}`, borderRadius: 12, color: theme?.text }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 700 }}>Heures estimées</label>
              <input type="number" min="1" max="200" value={projectForm.estimatedHours} onChange={e => setProjectForm(f => ({ ...f, estimatedHours: +e.target.value }))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme?.inputBg, border: `1.5px solid ${theme?.border}`, borderRadius: 12, color: theme?.text }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 700 }}>Priorité</label>
              <select value={projectForm.priority} onChange={e => setProjectForm(f => ({ ...f, priority: e.target.value }))} style={{ width: "100%", padding: "12px 16px", marginTop: 4, background: theme?.inputBg, border: `1.5px solid ${theme?.border}`, borderRadius: 12, color: theme?.text }}>
                <option value="haute">🔴 Haute</option>
                <option value="normale">🟡 Normale</option>
                <option value="basse">🟢 Basse</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 700 }}>Couleur</label>
                <input type="color" value={projectForm.color} onChange={e => setProjectForm(f => ({ ...f, color: e.target.value }))} style={{ width: "100%", height: 46, marginTop: 4, borderRadius: 12, border: `1.5px solid ${theme?.border}`, padding: 4 }} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button onClick={createProject} disabled={!projectForm.title.trim()} style={{ padding: "12px 28px", background: "linear-gradient(135deg,#7C3AED,#8B5CF6)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: !projectForm.title.trim() ? "not-allowed" : "pointer" }}>✦ Créer le projet</button>
            <button onClick={() => setShowProjectForm(false)} style={{ padding: "12px 20px", background: theme?.inputBg, border: `1px solid ${theme?.border}`, color: theme?.textMuted, borderRadius: 12, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {/* ═══ HUB ═══ */}
      {projectSubView === "hub" && (
        <div>
          {/* Stats rapides */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { label: "En cours", value: projects.filter(p => p.status === "en_cours").length, color: "#8B5CF6", icon: "🟣" },
              { label: "Terminés", value: projects.filter(p => p.status === "terminé").length, color: "#8B5CF6", icon: "✅" },
              { label: "Urgents (7j)", value: projects.filter(p => p.dueDate && getDaysUntil(p.dueDate) <= 7 && getDaysUntil(p.dueDate) >= 0).length, color: "#EF4444", icon: "🚨" },
              { label: "Tâches totales", value: projects.reduce((s, p) => s + (p.tasks?.length || 0), 0), color: "#C084FC", icon: "📋" },
            ].map(s => (
              <div key={s.label} style={{ background: theme?.cardBg, border: `1px solid ${theme?.border}`, borderRadius: 14, padding: "16px 18px" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: theme?.textMuted, fontWeight: 600 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Liste projets */}
          {projects.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", background: isDarkMode ? "linear-gradient(135deg, rgba(15,23,42,0.8), rgba(2,6,23,0.9))" : "linear-gradient(135deg, rgba(255,255,255,0.9), rgba(248,250,255,1))", borderRadius: 32, border: `1px solid ${isDarkMode ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.2)"}`, position: "relative", overflow: "hidden", boxShadow: "0 20px 50px rgba(139,92,246,0.1)" }}>
              <div style={{ position: "absolute", top: "-50%", left: "-50%", width: "200%", height: "200%", background: "conic-gradient(from 0deg, transparent, rgba(139,92,246,0.1), transparent)", animation: "spin 15s linear infinite", pointerEvents: "none" }} />
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 250, height: 250, background: "radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)", filter: "blur(40px)", pointerEvents: "none" }} />

              <div style={{ fontSize: 70, marginBottom: 20, position: "relative", zIndex: 1, animation: "float 4s ease-in-out infinite", filter: "drop-shadow(0 10px 20px rgba(139,92,246,0.5))" }}>🚀</div>
              <h3 style={{ color: theme?.text, fontSize: 32, margin: "0 0 12px", fontWeight: 900, position: "relative", zIndex: 1, letterSpacing: "-0.5px" }}>L'Étincelle de Création</h3>
              <p style={{ color: theme?.textMuted, fontSize: 16, marginBottom: 32, maxWidth: 450, margin: "0 auto 32px", position: "relative", zIndex: 1, lineHeight: 1.6 }}>Il n'y a pas encore de projets dans cette dimension. Invoque ton premier projet et laisse l'IA orchestrer sa genèse tâche par tâche.</p>
              <button onClick={() => setShowProjectForm(true)} style={{ padding: "16px 40px", background: "linear-gradient(135deg, #8B5CF6, #7C3AED)", color: "white", border: "none", borderRadius: 100, fontWeight: 900, fontSize: 16, cursor: "pointer", position: "relative", zIndex: 1, boxShadow: "0 10px 30px rgba(139,92,246,0.4)" }}>
                ✨ Créer mon premier Projet
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 20 }}>
              {projects.map(proj => {
                const projectTasks = proj.tasks || [];
                const progress = getProjectProgress(proj);
                const daysLeft = getDaysUntil(proj.dueDate);
                const isUrgent = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
                const doneTasks = projectTasks.filter(t => t.done).length;
                return (
                  <HoloCard key={proj.id} theme={theme} glowColor={isUrgent ? "#EF4444" : (proj.color || "#8B5CF6")} style={{
                    background: isDarkMode ? "rgba(15,23,42,0.85)" : "rgba(255,255,255,0.95)",
                    borderRadius: 24, padding: 24,
                    border: `1px solid ${isUrgent ? "rgba(239,68,68,0.5)" : theme?.border}`,
                    borderTop: `4px solid ${proj.color || "#8B5CF6"}`,
                    boxShadow: isUrgent ? "0 0 30px rgba(239,68,68,0.2)" : (isDarkMode ? "0 20px 40px rgba(0,0,0,0.4)" : "0 15px 35px rgba(139,92,246,0.08)"),
                    backdropFilter: "blur(20px)", transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 900, fontSize: 16, color: theme?.text, marginBottom: 4 }}>{proj.title}</div>
                        {proj.description && <div style={{ fontSize: 12, color: theme?.textMuted, marginBottom: 6 }}>{proj.description.slice(0, 80)}{proj.description.length > 80 ? "…" : ""}</div>}
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {proj.category && <span style={{ fontSize: 11, background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 20, padding: "2px 8px", color: theme?.textMuted }}>📚 {proj.category}</span>}
                          <span style={{ fontSize: 11, background: proj.priority === "haute" ? "#FEE2E2" : proj.priority === "normale" ? "#F3E8FF" : "#FAF5FF", color: proj.priority === "haute" ? "#991B1B" : proj.priority === "normale" ? "#4C1D95" : "#4C1D95", borderRadius: 20, padding: "2px 8px" }}>
                            {proj.priority === "haute" ? "🔴" : proj.priority === "normale" ? "🟡" : "🟢"} {proj.priority}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => deleteProject(proj.id)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 16, padding: 4 }}>🗑️</button>
                    </div>

                    {/* Deadline */}
                    {proj.dueDate && (
                      <div style={{ fontSize: 12, fontWeight: 700, color: isUrgent ? "#EF4444" : theme?.textMuted, marginBottom: 10 }}>
                        🗓️ Rendu : {new Date(proj.dueDate).toLocaleDateString("fr-FR")}
                        {daysLeft !== null && <span style={{ marginLeft: 6, background: isUrgent ? "#FEE2E2" : theme?.inputBg, color: isUrgent ? "#EF4444" : theme?.textMuted, borderRadius: 20, padding: "1px 7px" }}>J-{daysLeft}</span>}
                      </div>
                    )}

                    {/* Progress */}
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme?.textMuted, marginBottom: 4 }}>
                        <span>{doneTasks}/{projectTasks.length} tâches</span>
                        <span style={{ fontWeight: 800, color: proj.color }}>{progress}%</span>
                      </div>
                      <div style={{ height: 8, background: theme?.inputBg, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: progress >= 100 ? "#8B5CF6" : proj.color, borderRadius: 4, transition: "width 0.5s ease" }} />
                      </div>
                    </div>

                    {/* Tasks preview (top 3) */}
                    {projectTasks.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        {projectTasks.slice(0, 3).map(task => (
                          <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                            <input type="checkbox" checked={task.done} onChange={() => toggleTask(proj.id, task.id)} style={{ accentColor: proj.color, cursor: "pointer" }} />
                            <span style={{ fontSize: 12, color: task.done ? theme?.textMuted : theme?.text, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</span>
                          </div>
                        ))}
                        {projectTasks.length > 3 && <div style={{ fontSize: 11, color: theme?.textMuted, marginTop: 4 }}>+{projectTasks.length - 3} autres tâches…</div>}
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => { setActiveProject(proj); setProjectSubView("detail"); }} style={{ flex: 1, padding: "8px", background: "#7C3AED", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📋 Détail</button>
                      {!proj.decomposed ? (
                        <button onClick={() => decomposeProject(proj)} disabled={projectDecomposing} style={{ flex: 1, padding: "8px", background: "#8B5CF6", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                          {projectDecomposing ? "⏳" : "🧠 IA Décompose"}
                        </button>
                      ) : (
                        <button onClick={() => { setActiveProject(proj); setProjectSubView("coach"); }} style={{ flex: 1, padding: "8px", background: "#7C3AED", color: "white", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>🤖 Coach</button>
                      )}
                    </div>
                  </HoloCard>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══ DÉTAIL PROJET ═══ */}
      {projectSubView === "detail" && activeProject && (
        <div>
          <button onClick={() => { setProjectSubView("hub"); setActiveProject(null); }} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: theme?.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 20, padding: "6px 0" }}>
            ← Retour aux projets
          </button>
          <div style={{ background: theme?.cardBg, border: `1px solid ${theme?.border}`, borderRadius: 22, padding: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div>
                <h2 style={{ color: theme?.highlight || "#8B5CF6", margin: 0 }}>{activeProject.title}</h2>
                {activeProject.decomposedData?.studyAdvice && (
                  <div style={{ fontSize: 13, color: "#8B5CF6", marginTop: 6, fontStyle: "italic" }}>💡 {activeProject.decomposedData.studyAdvice}</div>
                )}
              </div>
              <button onClick={() => { setProjectSubView("hub"); setActiveProject(null); }} style={{ background: "none", border: "none", color: theme?.textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
            </div>
            {activeProject.decomposedData?.keyRisks?.length > 0 && (
              <div style={{ background: "#FAF5FF", borderRadius: 12, padding: "12px 16px", marginBottom: 16, border: "1px solid #DDD6FE" }}>
                <div style={{ fontWeight: 700, color: "#4C1D95", fontSize: 13, marginBottom: 6 }}>⚠️ Risques identifiés par l'IA</div>
                {activeProject.decomposedData.keyRisks.map((r, i) => <div key={i} style={{ fontSize: 12, color: "#3B0764", marginBottom: 2 }}>• {r}</div>)}
              </div>
            )}
            {["analyse", "conception", "développement", "test", "rendu"].map(phase => {
              const phaseTasks = (activeProject.tasks || []).filter(t => t.phase === phase);
              if (!phaseTasks.length) return null;
              const phaseColors = { analyse: "#8B5CF6", conception: "#C084FC", développement: "#A855F7", test: "#EF4444", rendu: "#8B5CF6" };
              return (
                <div key={phase} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: phaseColors[phase] || theme?.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>{phase}</div>
                  {phaseTasks.map(task => (
                    <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", background: theme?.inputBg, borderRadius: 12, marginBottom: 6, borderLeft: `3px solid ${task.done ? "#8B5CF6" : phaseColors[phase] || "#8B5CF6"}` }}>
                      <input type="checkbox" checked={task.done} onChange={() => toggleTask(activeProject.id, task.id)} style={{ marginTop: 2, accentColor: phaseColors[phase], cursor: "pointer", flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: task.done ? theme?.textMuted : theme?.text, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</div>
                        {task.description && <div style={{ fontSize: 11, color: theme?.textMuted, marginTop: 2 }}>{task.description}</div>}
                        <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                          {task.estimatedHours && <span style={{ fontSize: 10, color: theme?.textMuted }}>⏱ {task.estimatedHours}h</span>}
                          {task.suggestedDate && <span style={{ fontSize: 10, color: theme?.textMuted }}>📅 {task.suggestedDate}</span>}
                          {task.cardConcepts?.length > 0 && task.cardConcepts.map(concept => (
                            <button key={concept} onClick={async () => {
                              try {
                                const raw = await callClaude(`Génère une fiche de révision JSON sur: "${concept}" dans le contexte du projet "${activeProject.title}". Format: {"front":"...","back":"...","example":"..."}`, "Génère la fiche.");
                                const parsed = safeParseJSON(raw);
                                const newExp = { id: Date.now().toString() + Math.random(), front: parsed.front, back: parsed.back, example: parsed.example || "", category: activeProject.category || categories[0]?.name || "Projets", level: 0, nextReview: (today ? today() : new Date().toISOString().slice(0, 10)), createdAt: (today ? today() : new Date().toISOString().slice(0, 10)), easeFactor: 2.5, interval: 1, repetitions: 0, reviewHistory: [], imageUrl: null };
                                setExpressions?.(prev => [newExp, ...prev]);
                                showToast?.(`✨ Fiche "${concept}" créée !`);
                              } catch { showToast?.("Erreur génération fiche", "error"); }
                            }} style={{ fontSize: 10, background: "#FAF5FF", color: "#4C1D95", border: "none", borderRadius: 20, padding: "2px 8px", cursor: "pointer", fontWeight: 700 }}>
                              + Fiche: {concept}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            {(activeProject.tasks || []).length === 0 && (
              <button onClick={() => decomposeProject(activeProject)} disabled={projectDecomposing} style={{ width: "100%", padding: 16, background: "linear-gradient(135deg,#8B5CF6,#C084FC)", color: "white", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
                {projectDecomposing ? "⏳ L'IA génère ton plan…" : "🧠 Décomposer avec l'IA"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══ PLANIFICATEUR CRUNCH MODE ═══ */}
      {projectSubView === "planner" && (
        <div>
          <button onClick={() => setProjectSubView("hub")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: theme?.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 20, padding: "6px 0" }}>← Retour au Hub</button>
          <div style={{ background: "linear-gradient(135deg,#1A0800,#7C3AED)", borderRadius: 22, padding: 28, marginBottom: 24, color: "white" }}>
            <h2 style={{ margin: "0 0 8px" }}>📅 Planificateur Crunch Mode</h2>
            <p style={{ color: "#FAF5FF", margin: "0 0 20px", fontSize: 14 }}>L'IA analyse tes projets + examens + révisions FSRS et génère un planning heure par heure sur 7 jours.</p>
            <button onClick={generateCrunchPlan} disabled={projectPlannerLoading} style={{ padding: "14px 28px", background: "white", color: "#7C3AED", border: "none", borderRadius: 14, fontWeight: 800, cursor: "pointer", fontSize: 15 }}>
              {projectPlannerLoading ? "⏳ Génération…" : "⚡ Générer mon planning Crunch"}
            </button>
          </div>

          {/* Conflits détaillés */}
          {projectConflicts.length > 0 && (
            <div style={{ background: theme?.cardBg, borderRadius: 18, padding: 20, marginBottom: 20, border: `1px solid ${theme?.border}` }}>
              <h3 style={{ color: theme?.text, margin: "0 0 14px" }}>⚡ Détecteur de conflits</h3>
              {projectConflicts.map((c, i) => (
                <div key={i} style={{ background: c.severity === "critique" ? "#FEF2F2" : "#FAF5FF", borderRadius: 12, padding: "12px 16px", marginBottom: 8, borderLeft: `4px solid ${c.severity === "critique" ? "#EF4444" : "#A855F7"}` }}>
                  <div style={{ fontWeight: 700, color: c.severity === "critique" ? "#991B1B" : "#4C1D95", fontSize: 13 }}>
                    {c.severity === "critique" ? "🚨 CRITIQUE" : "⚠️ AVERTISSEMENT"}
                  </div>
                  <div style={{ fontSize: 13, color: c.severity === "critique" ? "#EF4444" : "#8B5CF6", marginTop: 4 }}>{c.advice}</div>
                  <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 11, color: theme?.textMuted }}>
                    <span>📋 Projet: {c.projectDate}</span>
                    <span>🎓 Examen: {c.examDate}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Planning généré */}
          {projectPlannerData && (
            <div>
              {projectPlannerData.warnings?.length > 0 && (
                <div style={{ background: "#FAF5FF", borderRadius: 14, padding: "14px 18px", marginBottom: 16, border: "1px solid #DDD6FE" }}>
                  {projectPlannerData.warnings.map((w, i) => <div key={i} style={{ fontSize: 13, color: "#4C1D95" }}>⚠️ {w}</div>)}
                </div>
              )}
              {projectPlannerData.weekSummary && (
                <div style={{ background: theme?.cardBg, borderRadius: 14, padding: "16px 20px", marginBottom: 16, border: `1px solid ${theme?.border}` }}>
                  <div style={{ fontWeight: 700, color: theme?.highlight || "#8B5CF6", marginBottom: 4 }}>📊 Stratégie de la semaine</div>
                  <div style={{ fontSize: 13, color: theme?.text }}>{projectPlannerData.weekSummary}</div>
                  {projectPlannerData.tip && <div style={{ fontSize: 13, color: "#8B5CF6", marginTop: 8, fontStyle: "italic" }}>💡 {projectPlannerData.tip}</div>}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
                {(projectPlannerData.days || []).map((day, di) => (
                  <div key={di} style={{ background: theme?.cardBg, borderRadius: 16, padding: 18, border: `1px solid ${theme?.border}` }}>
                    <div style={{ fontWeight: 800, color: theme?.highlight || "#8B5CF6", marginBottom: 12, fontSize: 14 }}>📅 {day.dayLabel || day.date}</div>
                    {(day.slots || []).map((slot, si) => (
                      <div key={si} style={{ display: "flex", gap: 10, marginBottom: 8, padding: "8px 10px", background: theme?.inputBg, borderRadius: 10, borderLeft: `3px solid ${slot.type === "revision" ? "#8B5CF6" : slot.type === "projet" ? "#8B5CF6" : "var(--mm-fg-muted)"}` }}>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, fontWeight: 800, color: theme?.highlight || "#8B5CF6", minWidth: 38 }}>{slot.time}</span>
                        <div>
                          <div style={{ fontSize: 12, color: theme?.text, fontWeight: 600 }}>{slot.activity}</div>
                          {slot.module && <div style={{ fontSize: 10, color: theme?.textMuted }}>{slot.module}</div>}
                        </div>
                        <span style={{ marginLeft: "auto", fontSize: 9, background: slot.type === "revision" ? "#FAF5FF" : slot.type === "projet" ? "#FAF5FF" : "var(--mm-bg-elev)", color: slot.type === "revision" ? "#7C3AED" : slot.type === "projet" ? "#4C1D95" : "#64748B", borderRadius: 20, padding: "2px 6px", fontWeight: 700, height: "fit-content" }}>{slot.type}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ AI PROJECT COACH ═══ */}
      {projectSubView === "coach" && (
        <div style={{ display: "flex", flexDirection: "column", minHeight: "60vh" }}>
          <button onClick={() => setProjectSubView("hub")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: theme?.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 12, padding: "6px 0" }}>← Retour au Hub</button>
          <div style={{ background: "linear-gradient(135deg,#4C1D95,#8B5CF6)", borderRadius: "18px 18px 0 0", padding: "20px 24px", color: "white" }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>🤖 AI Project Coach</div>
            <div style={{ fontSize: 12, color: "#DDD6FE", marginTop: 2 }}>
              {activeProject ? `Contexte: ${activeProject.title} (${getProjectProgress(activeProject)}%)` : "Pose n'importe quelle question sur tes projets."}
            </div>
            {activeProject && (
              <select onChange={e => setActiveProject(projects.find(p => p.id === e.target.value) || null)} value={activeProject?.id || ""} style={{ marginTop: 10, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 8, padding: "6px 10px", color: "white", fontSize: 12 }}>
                {projects.map(p => <option key={p.id} value={p.id} style={{ color: "#000" }}>{p.title}</option>)}
              </select>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: 20, background: theme?.inputBg, display: "flex", flexDirection: "column", gap: 12 }}>
            {projectCoachMessages.length === 0 && (
              <div style={{ textAlign: "center", padding: "40px 20px", color: theme?.textMuted }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
                <p>Salut ! Je suis ton Coach Projets IA. Je connais tes projets, tes fiches et ton planning. Pose-moi n'importe quelle question !</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 16 }}>
                  {["Comment avancer sur mon projet Java ?", "Explique-moi les annotations Spring Boot", "Quelles tâches faire en priorité ?", "Génère des fiches sur ce concept"].map(q => (
                    <button key={q} onClick={() => sendProjectCoachMessage(q)} style={{ padding: "8px 14px", background: theme?.cardBg, border: `1px solid ${theme?.border}`, borderRadius: 20, fontSize: 12, color: theme?.text, cursor: "pointer" }}>{q}</button>
                  ))}
                </div>
              </div>
            )}
            {projectCoachMessages.map((msg, i) => (
              <div key={i} style={{ display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "80%", padding: "12px 16px", borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px", background: msg.role === "user" ? "#7C3AED" : (theme?.cardBg || "#fff"), color: msg.role === "user" ? "white" : theme?.text, fontSize: 14, border: msg.role === "assistant" ? `1px solid ${theme?.border}` : "none" }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {projectCoachLoading && (
              <div style={{ display: "flex", gap: 4, padding: "8px 14px", background: theme?.cardBg, borderRadius: 18, width: "fit-content", border: `1px solid ${theme?.border}` }}>
                {[0, 1, 2].map(i => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: "#8B5CF6", animation: `pulse 1s ${i * 0.2}s infinite` }} />)}
              </div>
            )}
          </div>
          <div style={{ padding: 16, background: theme?.cardBg, borderRadius: "0 0 18px 18px", border: `1px solid ${theme?.border}`, borderTop: "none", display: "flex", gap: 10 }}>
            <input value={projectCoachInput} onChange={e => setProjectCoachInput(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendProjectCoachMessage(projectCoachInput)} placeholder="Pose ta question au Coach IA…" style={{ flex: 1, padding: "12px 16px", background: theme?.inputBg, border: `1.5px solid ${theme?.border}`, borderRadius: 12, color: theme?.text, fontSize: 14 }} />
            <button onClick={() => sendProjectCoachMessage(projectCoachInput)} disabled={projectCoachLoading || !projectCoachInput.trim()} style={{ padding: "12px 20px", background: "linear-gradient(135deg,#8B5CF6,#C084FC)", color: "white", border: "none", borderRadius: 12, fontWeight: 800, cursor: "pointer" }}>Envoyer</button>
          </div>
        </div>
      )}

      {/* ═══ FUSION SESSIONS POMODORO ═══ */}
      {projectSubView === "fusion" && (
        <div>
          <button onClick={() => setProjectSubView("hub")} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: theme?.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14, marginBottom: 20, padding: "6px 0" }}>← Retour au Hub</button>
          <div style={{ background: "linear-gradient(135deg,#4C1D95,#7C3AED,#8B5CF6)", borderRadius: 22, padding: 28, marginBottom: 24, color: "white", textAlign: "center" }}>
            <div style={{ fontSize: 72, fontFamily: "'JetBrains Mono',monospace", fontWeight: 900, letterSpacing: -2, marginBottom: 8 }}>{formatPomodoro(projectPomodoroTime)}</div>
            <div style={{ fontSize: 14, color: "#DDD6FE", marginBottom: 20 }}>
              Mode : {projectPomodoroMode === "study" ? "📚 Révision FSRS" : projectPomodoroMode === "project" ? "🗂️ Session Projet" : "☕ Pause"}
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setProjectPomodoroActive(a => !a)} style={{ padding: "14px 32px", background: "white", color: "#7C3AED", border: "none", borderRadius: 14, fontWeight: 900, fontSize: 18, cursor: "pointer" }}>
                {projectPomodoroActive ? "⏸ Pause" : "▶ Démarrer"}
              </button>
              <button onClick={() => { setProjectPomodoroActive(false); setProjectPomodoroTime(25 * 60); setProjectPomodoroMode("study"); }} style={{ padding: "14px 20px", background: "rgba(255,255,255,0.2)", color: "white", border: "none", borderRadius: 14, fontWeight: 700, cursor: "pointer" }}>↺ Reset</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
            {[
              { mode: "study", icon: "📚", label: "Révision FSRS", desc: "25 min de révision", duration: 25, color: "#8B5CF6" },
              { mode: "project", icon: "🗂️", label: "Session Projet", desc: "25 min de code/travail", duration: 25, color: "#8B5CF6" },
              { mode: "break", icon: "☕", label: "Pause", desc: "15 min de repos", duration: 15, color: "#A855F7" },
            ].map(m => (
              <button key={m.mode} onClick={() => { setProjectPomodoroMode(m.mode); setProjectPomodoroTime(m.duration * 60); setProjectPomodoroActive(false); }} style={{ padding: 20, background: projectPomodoroMode === m.mode ? m.color + "20" : (theme?.cardBg || "transparent"), border: `2px solid ${projectPomodoroMode === m.mode ? m.color : theme?.border}`, borderRadius: 16, cursor: "pointer", textAlign: "left" }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{m.icon}</div>
                <div style={{ fontWeight: 800, color: theme?.text, fontSize: 14 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: theme?.textMuted }}>{m.desc}</div>
              </button>
            ))}
          </div>

          {/* Projet actif pour la session */}
          <div style={{ background: theme?.cardBg, borderRadius: 18, padding: 20, border: `1px solid ${theme?.border}` }}>
            <h3 style={{ color: theme?.text, margin: "0 0 14px" }}>🎯 Tâche de la session</h3>
            <select value={activeProject?.id || ""} onChange={e => setActiveProject(projects.find(p => p.id === e.target.value) || null)} style={{ width: "100%", padding: "10px 14px", background: theme?.inputBg, border: `1px solid ${theme?.border}`, borderRadius: 10, color: theme?.text, marginBottom: 12 }}>
              <option value="">Sélectionne un projet…</option>
              {projects.filter(p => p.status !== "terminé").map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            {activeProject && (activeProject.tasks || []).filter(t => !t.done).length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(activeProject.tasks || []).filter(t => !t.done).slice(0, 4).map(task => (
                  <div key={task.id} onClick={() => setProjectPomodoroTask(task)} style={{ padding: "10px 14px", background: projectPomodoroTask?.id === task.id ? "#FAF5FF" : theme?.inputBg, border: `1px solid ${projectPomodoroTask?.id === task.id ? "#8B5CF6" : theme?.border}`, borderRadius: 10, cursor: "pointer", fontSize: 13, color: theme?.text, fontWeight: projectPomodoroTask?.id === task.id ? 700 : 400 }}>
                    {task.title}
                    {task.estimatedHours && <span style={{ float: "right", fontSize: 11, color: theme?.textMuted }}>⏱ {task.estimatedHours}h</span>}
                  </div>
                ))}
              </div>
            )}
            {projectPomodoroTask && (
              <button onClick={() => { toggleTask(activeProject.id, projectPomodoroTask.id); setProjectPomodoroTask(null); showToast?.("✅ Tâche marquée comme faite !"); }} style={{ marginTop: 12, width: "100%", padding: "10px", background: "#8B5CF6", color: "white", border: "none", borderRadius: 10, fontWeight: 800, cursor: "pointer" }}>
                ✅ Marquer "{projectPomodoroTask.title}" comme faite
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
