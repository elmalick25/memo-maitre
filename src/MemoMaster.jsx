import { useState, useEffect, useCallback } from "react";

// ─── Constantes ────────────────────────────────────────────────────────────────
const INTERVALS = [1, 3, 7, 14, 30, 90, 180]; // jours par niveau
const CATEGORIES_DEFAULT = ["🇬🇧 Anglais", "☕ Java / Spring Boot", "🖥️ Informatique"];

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
};

const today = () => new Date().toISOString().split("T")[0];

// ─── Storage helpers ────────────────────────────────────────────────────────────
const storage = {
  async get(key) {
    try {
      const r = await window.storage.get(key);
      return r ? JSON.parse(r.value) : null;
    } catch { return null; }
  },
  async set(key, val) {
    try { await window.storage.set(key, JSON.stringify(val)); } catch {}
  }
};

// ─── Composant principal ────────────────────────────────────────────────────────
export default function MemoMaster() {
  const [view, setView] = useState("dashboard");
  const [expressions, setExpressions] = useState([]);
  const [categories, setCategories] = useState(CATEGORIES_DEFAULT);
  const [streak, setStreak] = useState(0);
  const [lastSession, setLastSession] = useState(null);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [toast, setToast] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [addForm, setAddForm] = useState({ front: "", back: "", example: "", category: categories[0] });
  const [newCat, setNewCat] = useState("");
  const [filterCat, setFilterCat] = useState("Toutes");
  const [showCatModal, setShowCatModal] = useState(false);

  // ─── Chargement initial ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const exps = await storage.get("expressions") || [];
      const cats = await storage.get("categories") || CATEGORIES_DEFAULT;
      const sk = await storage.get("streak") || 0;
      const ls = await storage.get("lastSession") || null;
      setExpressions(exps);
      setCategories(cats);
      setStreak(sk);
      setLastSession(ls);
      setLoaded(true);
    })();
  }, []);

  // ─── Sauvegarde automatique ──────────────────────────────────────────────────
  useEffect(() => {
    if (loaded) storage.set("expressions", expressions);
  }, [expressions, loaded]);

  useEffect(() => {
    if (loaded) storage.set("categories", categories);
  }, [categories, loaded]);

  // ─── Streak ──────────────────────────────────────────────────────────────────
  const updateStreak = useCallback(async () => {
    const todayStr = today();
    const yesterday = addDays(todayStr, -1);
    let newStreak = streak;
    if (lastSession === yesterday) newStreak = streak + 1;
    else if (lastSession !== todayStr) newStreak = 1;
    setStreak(newStreak);
    setLastSession(todayStr);
    await storage.set("streak", newStreak);
    await storage.set("lastSession", todayStr);
  }, [streak, lastSession]);

  // ─── Expressions à réviser aujourd'hui ──────────────────────────────────────
  const todayReviews = expressions.filter(e => e.nextReview <= today() && e.level < 7);
  const masteredCount = expressions.filter(e => e.level >= 7).length;

  // ─── Afficher toast ──────────────────────────────────────────────────────────
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2800);
  };

  // ─── Ajouter expression ──────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.front.trim() || !addForm.back.trim()) {
      showToast("Remplis au moins le recto et le verso !", "error"); return;
    }
    const newExp = {
      id: Date.now().toString(),
      front: addForm.front.trim(),
      back: addForm.back.trim(),
      example: addForm.example.trim(),
      category: addForm.category,
      level: 0,
      nextReview: today(),
      createdAt: today(),
    };
    setExpressions(prev => [newExp, ...prev]);
    setAddForm({ front: "", back: "", example: "", category: addForm.category });
    showToast("✅ Expression ajoutée !");
  };

  // ─── Démarrer révision ───────────────────────────────────────────────────────
  const startReview = () => {
    const queue = [...todayReviews].sort(() => Math.random() - 0.5);
    setReviewQueue(queue);
    setReviewIndex(0);
    setRevealed(false);
    setView("review");
    updateStreak();
  };

  // ─── Réponse révision ────────────────────────────────────────────────────────
  const handleAnswer = (result) => {
    const exp = reviewQueue[reviewIndex];
    let newLevel = exp.level;
    if (result === "oublié") newLevel = 0;
    else if (result === "hésité") newLevel = Math.max(0, exp.level - 0);
    else newLevel = Math.min(7, exp.level + 1);

    const nextDate = newLevel >= 7 ? addDays(today(), 365) : addDays(today(), INTERVALS[newLevel]);

    setExpressions(prev =>
      prev.map(e => e.id === exp.id ? { ...e, level: newLevel, nextReview: nextDate } : e)
    );

    if (reviewIndex + 1 >= reviewQueue.length) {
      showToast(`🎉 Révision terminée ! ${reviewQueue.length} carte(s) révisée(s).`);
      setView("dashboard");
    } else {
      setReviewIndex(i => i + 1);
      setRevealed(false);
    }
  };

  // ─── Ajouter catégorie ───────────────────────────────────────────────────────
  const handleAddCat = () => {
    if (!newCat.trim() || categories.includes(newCat.trim())) return;
    setCategories(prev => [...prev, newCat.trim()]);
    setNewCat("");
    showToast("Catégorie ajoutée !");
  };

  // ─── Supprimer expression ────────────────────────────────────────────────────
  const deleteExp = (id) => {
    setExpressions(prev => prev.filter(e => e.id !== id));
    showToast("Expression supprimée.", "info");
  };

  if (!loaded) return (
    <div style={styles.loadingScreen}>
      <div style={styles.spinner}></div>
      <p style={{ color: "#1D4ED8", marginTop: 16, fontFamily: "'Outfit', sans-serif" }}>Chargement...</p>
    </div>
  );

  const currentCard = reviewQueue[reviewIndex];
  const levelLabel = ["Nouveau", "J+3", "J+7", "J+14", "J+30", "J+90", "J+180", "✅ Maîtrisé"];

  const filteredExps = filterCat === "Toutes" ? expressions : expressions.filter(e => e.category === filterCat);

  return (
    <div style={styles.app}>
      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #F0F5FF; }
        ::-webkit-scrollbar { width: 6px; } 
        ::-webkit-scrollbar-track { background: #EFF6FF; }
        ::-webkit-scrollbar-thumb { background: #BFDBFE; border-radius: 3px; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
        @keyframes slideDown { from{opacity:0;transform:translateY(-20px)} to{opacity:1;transform:translateY(0)} }
        .card-hover:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(29,78,216,0.15) !important; }
        .btn-hover:hover { transform: translateY(-1px); filter: brightness(1.08); }
        .nav-item:hover { background: rgba(255,255,255,0.15) !important; }
      `}</style>

      {/* TOAST */}
      {toast && (
        <div style={{ ...styles.toast, background: toast.type === "error" ? "#EF4444" : toast.type === "info" ? "#3B82F6" : "#1D4ED8" }}>
          {toast.msg}
        </div>
      )}

      {/* NAVBAR */}
      <nav style={styles.nav}>
        <div style={styles.navBrand}>
          <span style={styles.navLogo}>M</span>
          <span style={styles.navTitle}>MémoMaître</span>
        </div>
        <div style={styles.navLinks}>
          {[
            { id: "dashboard", label: "🏠 Accueil" },
            { id: "add", label: "➕ Ajouter" },
            { id: "list", label: "📚 Mes fiches" },
            { id: "categories", label: "🗂️ Catégories" },
          ].map(n => (
            <button key={n.id} className="nav-item" onClick={() => setView(n.id)}
              style={{ ...styles.navItem, background: view === n.id ? "rgba(255,255,255,0.2)" : "transparent", fontWeight: view === n.id ? 700 : 400 }}>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      {/* CONTENU */}
      <main style={styles.main}>

        {/* ── DASHBOARD ─────────────────────────────────────────────────── */}
        {view === "dashboard" && (
          <div style={styles.fadeIn}>
            <h1 style={styles.pageTitle}>Bonjour ! 👋</h1>
            <p style={styles.pageSubtitle}>Voici ton tableau de bord de révision</p>

            {/* Stats cards */}
            <div style={styles.statsGrid}>
              <div style={{ ...styles.statCard, borderTop: "4px solid #1D4ED8" }} className="card-hover">
                <div style={styles.statIcon}>🔥</div>
                <div style={styles.statNum}>{streak}</div>
                <div style={styles.statLabel}>Jours consécutifs</div>
              </div>
              <div style={{ ...styles.statCard, borderTop: "4px solid #3B82F6" }} className="card-hover">
                <div style={styles.statIcon}>📦</div>
                <div style={styles.statNum}>{expressions.length}</div>
                <div style={styles.statLabel}>Fiches au total</div>
              </div>
              <div style={{ ...styles.statCard, borderTop: "4px solid #60A5FA" }} className="card-hover">
                <div style={styles.statIcon}>📅</div>
                <div style={styles.statNum}>{todayReviews.length}</div>
                <div style={styles.statLabel}>À réviser aujourd'hui</div>
              </div>
              <div style={{ ...styles.statCard, borderTop: "4px solid #93C5FD" }} className="card-hover">
                <div style={styles.statIcon}>✅</div>
                <div style={styles.statNum}>{masteredCount}</div>
                <div style={styles.statLabel}>Maîtrisées</div>
              </div>
            </div>

            {/* Révision du jour */}
            <div style={styles.reviewBanner}>
              {todayReviews.length > 0 ? (
                <>
                  <div>
                    <div style={styles.reviewBannerTitle}>📋 {todayReviews.length} fiche(s) à réviser aujourd'hui</div>
                    <div style={styles.reviewBannerSub}>Lance la révision pour progresser !</div>
                  </div>
                  <button className="btn-hover" onClick={startReview} style={styles.btnReview}>
                    Commencer la révision →
                  </button>
                </>
              ) : (
                <div style={{ textAlign: "center", width: "100%" }}>
                  <div style={styles.reviewBannerTitle}>🎉 Aucune révision aujourd'hui !</div>
                  <div style={styles.reviewBannerSub}>Tu es à jour. Reviens demain ou ajoute de nouvelles fiches.</div>
                </div>
              )}
            </div>

            {/* Légende niveaux */}
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>📊 Système de révision espacée</h2>
              <div style={styles.levelsGrid}>
                {INTERVALS.map((days, i) => (
                  <div key={i} style={{ ...styles.levelBadge, opacity: 0.5 + i * 0.07 }}>
                    <span style={styles.levelNum}>N{i + 1}</span>
                    <span style={styles.levelDays}>J+{days}</span>
                  </div>
                ))}
                <div style={{ ...styles.levelBadge, background: "#1D4ED8", color: "white" }}>
                  <span style={styles.levelNum}>✅</span>
                  <span style={styles.levelDays}>Maîtrisé</span>
                </div>
              </div>
            </div>

            {/* Prochaines révisions par catégorie */}
            {categories.length > 0 && (
              <div style={styles.section}>
                <h2 style={styles.sectionTitle}>📁 Par catégorie</h2>
                <div style={styles.catStatsGrid}>
                  {categories.map(cat => {
                    const catExps = expressions.filter(e => e.category === cat);
                    const catToday = catExps.filter(e => e.nextReview <= today() && e.level < 7).length;
                    return (
                      <div key={cat} style={styles.catStatCard} className="card-hover">
                        <div style={styles.catStatName}>{cat}</div>
                        <div style={styles.catStatRow}>
                          <span>{catExps.length} fiches</span>
                          {catToday > 0 && <span style={styles.catBadge}>{catToday} à réviser</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MODE RÉVISION ──────────────────────────────────────────────── */}
        {view === "review" && currentCard && (
          <div style={styles.fadeIn}>
            <div style={styles.reviewHeader}>
              <button onClick={() => setView("dashboard")} style={styles.backBtn}>← Retour</button>
              <span style={styles.reviewProgress}>{reviewIndex + 1} / {reviewQueue.length}</span>
            </div>

            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${((reviewIndex) / reviewQueue.length) * 100}%` }} />
            </div>

            <div style={styles.cardContainer}>
              <div style={styles.cardCategory}>{currentCard.category}</div>
              <div style={styles.cardLevel}>{levelLabel[currentCard.level]}</div>

              <div style={styles.cardFront}>
                <div style={styles.cardFrontLabel}>QUESTION</div>
                <div style={styles.cardFrontText}>{currentCard.front}</div>
              </div>

              {!revealed ? (
                <button className="btn-hover" onClick={() => setRevealed(true)} style={styles.revealBtn}>
                  👁️ Voir la réponse
                </button>
              ) : (
                <>
                  <div style={styles.cardBack}>
                    <div style={styles.cardBackLabel}>RÉPONSE</div>
                    <div style={styles.cardBackText}>{currentCard.back}</div>
                    {currentCard.example && (
                      <div style={styles.cardExample}>💬 {currentCard.example}</div>
                    )}
                  </div>
                  <div style={styles.answerBtns}>
                    <button className="btn-hover" onClick={() => handleAnswer("oublié")} style={styles.btnOublie}>
                      😓 Oublié<br /><span style={{ fontSize: 11 }}>Retour niveau 1</span>
                    </button>
                    <button className="btn-hover" onClick={() => handleAnswer("hésité")} style={styles.btnHesite}>
                      🤔 Hésité<br /><span style={{ fontSize: 11 }}>On répète bientôt</span>
                    </button>
                    <button className="btn-hover" onClick={() => handleAnswer("facile")} style={styles.btnFacile}>
                      😊 Facile<br /><span style={{ fontSize: 11 }}>Niveau suivant</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── AJOUTER ────────────────────────────────────────────────────── */}
        {view === "add" && (
          <div style={styles.fadeIn}>
            <h1 style={styles.pageTitle}>➕ Ajouter une fiche</h1>
            <p style={styles.pageSubtitle}>Crée une nouvelle fiche à mémoriser</p>

            <div style={styles.formCard}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Catégorie</label>
                <select value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))} style={styles.select}>
                  {categories.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Recto — Expression / Mot / Concept <span style={{ color: "#EF4444" }}>*</span></label>
                <input value={addForm.front} onChange={e => setAddForm(f => ({ ...f, front: e.target.value }))}
                  style={styles.input} placeholder="Ex: To pull someone's leg / @RestController / ..." />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Verso — Traduction / Explication en français <span style={{ color: "#EF4444" }}>*</span></label>
                <textarea value={addForm.back} onChange={e => setAddForm(f => ({ ...f, back: e.target.value }))}
                  style={{ ...styles.input, minHeight: 90, resize: "vertical" }} placeholder="Ex: Faire marcher quelqu'un / Annotation Spring pour les contrôleurs REST..." />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Exemple d'utilisation (optionnel)</label>
                <input value={addForm.example} onChange={e => setAddForm(f => ({ ...f, example: e.target.value }))}
                  style={styles.input} placeholder="Ex: Stop pulling my leg! / @RestController public class UserController {...}" />
              </div>
              <button className="btn-hover" onClick={handleAdd} style={styles.btnPrimary}>
                ✅ Ajouter la fiche
              </button>
            </div>
          </div>
        )}

        {/* ── LISTE ──────────────────────────────────────────────────────── */}
        {view === "list" && (
          <div style={styles.fadeIn}>
            <h1 style={styles.pageTitle}>📚 Mes fiches</h1>
            <p style={styles.pageSubtitle}>{expressions.length} fiche(s) au total</p>

            <div style={styles.filterRow}>
              {["Toutes", ...categories].map(c => (
                <button key={c} onClick={() => setFilterCat(c)} className="btn-hover"
                  style={{ ...styles.filterBtn, background: filterCat === c ? "#1D4ED8" : "white", color: filterCat === c ? "white" : "#1D4ED8" }}>
                  {c}
                </button>
              ))}
            </div>

            {filteredExps.length === 0 ? (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 48 }}>📭</div>
                <p>Aucune fiche dans cette catégorie.</p>
                <button onClick={() => setView("add")} style={styles.btnPrimary} className="btn-hover">Ajouter une fiche</button>
              </div>
            ) : (
              <div style={styles.cardList}>
                {filteredExps.map(exp => (
                  <div key={exp.id} style={styles.expCard} className="card-hover">
                    <div style={styles.expCardHeader}>
                      <span style={styles.expCatTag}>{exp.category}</span>
                      <span style={{ ...styles.expLevelTag, background: exp.level >= 7 ? "#1D4ED8" : exp.level >= 4 ? "#3B82F6" : "#BFDBFE", color: exp.level >= 4 ? "white" : "#1D4ED8" }}>
                        {levelLabel[exp.level]}
                      </span>
                    </div>
                    <div style={styles.expFront}>{exp.front}</div>
                    <div style={styles.expBack}>{exp.back}</div>
                    {exp.example && <div style={styles.expExample}>💬 {exp.example}</div>}
                    <div style={styles.expFooter}>
                      <span style={styles.expDate}>
                        {exp.level >= 7 ? "✅ Maîtrisée" : `Prochaine révision : ${exp.nextReview}`}
                      </span>
                      <button onClick={() => deleteExp(exp.id)} style={styles.deleteBtn}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CATÉGORIES ─────────────────────────────────────────────────── */}
        {view === "categories" && (
          <div style={styles.fadeIn}>
            <h1 style={styles.pageTitle}>🗂️ Catégories</h1>
            <p style={styles.pageSubtitle}>Organise tes fiches par matière</p>

            <div style={styles.formCard}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Ajouter une nouvelle catégorie</label>
                <div style={{ display: "flex", gap: 10 }}>
                  <input value={newCat} onChange={e => setNewCat(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddCat()}
                    style={{ ...styles.input, flex: 1 }} placeholder="Ex: 🐍 Python, 🧮 Mathématiques..." />
                  <button onClick={handleAddCat} className="btn-hover" style={styles.btnPrimary}>Ajouter</button>
                </div>
              </div>
            </div>

            <div style={styles.catGrid}>
              {categories.map(cat => {
                const count = expressions.filter(e => e.category === cat).length;
                const todayC = expressions.filter(e => e.category === cat && e.nextReview <= today() && e.level < 7).length;
                return (
                  <div key={cat} style={styles.catCard} className="card-hover">
                    <div style={styles.catCardName}>{cat}</div>
                    <div style={styles.catCardStats}>
                      <span>{count} fiche(s)</span>
                      {todayC > 0 && <span style={styles.catBadge}>{todayC} à réviser</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer style={styles.footer}>
        MémoMaître — Révision espacée intelligente • {new Date().getFullYear()}
      </footer>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────────
const styles = {
  app: { minHeight: "100vh", background: "#F0F5FF", fontFamily: "'Outfit', sans-serif", display: "flex", flexDirection: "column" },
  loadingScreen: { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#F0F5FF" },
  spinner: { width: 40, height: 40, border: "4px solid #BFDBFE", borderTop: "4px solid #1D4ED8", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  toast: { position: "fixed", top: 20, right: 20, zIndex: 9999, padding: "14px 22px", borderRadius: 12, color: "white", fontWeight: 600, fontSize: 15, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", animation: "slideDown 0.3s ease" },
  nav: { background: "linear-gradient(135deg, #1D4ED8 0%, #1e40af 100%)", padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 4px 20px rgba(29,78,216,0.3)", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap", gap: 8, minHeight: 64 },
  navBrand: { display: "flex", alignItems: "center", gap: 10 },
  navLogo: { width: 38, height: 38, background: "rgba(255,255,255,0.2)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "white" },
  navTitle: { fontSize: 22, fontWeight: 800, color: "white", letterSpacing: "-0.5px" },
  navLinks: { display: "flex", gap: 4, flexWrap: "wrap" },
  navItem: { padding: "8px 14px", borderRadius: 8, color: "white", border: "none", cursor: "pointer", fontSize: 14, transition: "all 0.2s", fontFamily: "'Outfit', sans-serif" },
  main: { flex: 1, maxWidth: 960, width: "100%", margin: "0 auto", padding: "32px 20px 60px" },
  fadeIn: { animation: "fadeIn 0.4s ease" },
  pageTitle: { fontSize: 32, fontWeight: 800, color: "#1D4ED8", letterSpacing: "-1px" },
  pageSubtitle: { color: "#6B7280", fontSize: 16, marginTop: 6, marginBottom: 28 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 },
  statCard: { background: "white", borderRadius: 16, padding: "20px 18px", boxShadow: "0 2px 12px rgba(29,78,216,0.08)", transition: "all 0.25s", cursor: "default" },
  statIcon: { fontSize: 28, marginBottom: 8 },
  statNum: { fontSize: 38, fontWeight: 800, color: "#1D4ED8", lineHeight: 1 },
  statLabel: { fontSize: 13, color: "#6B7280", marginTop: 4, fontWeight: 500 },
  reviewBanner: { background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", borderRadius: 20, padding: "24px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 32, boxShadow: "0 8px 30px rgba(29,78,216,0.25)" },
  reviewBannerTitle: { color: "white", fontSize: 20, fontWeight: 700 },
  reviewBannerSub: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginTop: 4 },
  btnReview: { background: "white", color: "#1D4ED8", border: "none", borderRadius: 12, padding: "12px 24px", fontWeight: 700, fontSize: 15, cursor: "pointer", transition: "all 0.2s", fontFamily: "'Outfit', sans-serif", whiteSpace: "nowrap" },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 18, fontWeight: 700, color: "#1D4ED8", marginBottom: 14 },
  levelsGrid: { display: "flex", gap: 8, flexWrap: "wrap" },
  levelBadge: { background: "#EFF6FF", borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "1px solid #BFDBFE", minWidth: 70 },
  levelNum: { fontSize: 13, fontWeight: 700, color: "#1D4ED8" },
  levelDays: { fontSize: 11, color: "#6B7280" },
  catStatsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 },
  catStatCard: { background: "white", borderRadius: 14, padding: "16px", boxShadow: "0 2px 12px rgba(29,78,216,0.07)", transition: "all 0.25s", cursor: "default" },
  catStatName: { fontWeight: 700, color: "#1D4ED8", fontSize: 14, marginBottom: 8 },
  catStatRow: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#6B7280" },
  catBadge: { background: "#DBEAFE", color: "#1D4ED8", padding: "2px 8px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  reviewHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  backBtn: { background: "none", border: "1px solid #BFDBFE", borderRadius: 8, padding: "6px 14px", color: "#1D4ED8", cursor: "pointer", fontSize: 14, fontFamily: "'Outfit', sans-serif" },
  reviewProgress: { color: "#6B7280", fontWeight: 600, fontSize: 14 },
  progressBar: { height: 8, background: "#DBEAFE", borderRadius: 4, marginBottom: 28, overflow: "hidden" },
  progressFill: { height: "100%", background: "linear-gradient(90deg, #1D4ED8, #60A5FA)", borderRadius: 4, transition: "width 0.4s ease" },
  cardContainer: { background: "white", borderRadius: 24, padding: "32px", boxShadow: "0 8px 40px rgba(29,78,216,0.12)", maxWidth: 680, margin: "0 auto" },
  cardCategory: { background: "#EFF6FF", color: "#1D4ED8", display: "inline-block", padding: "4px 12px", borderRadius: 20, fontSize: 13, fontWeight: 600, marginBottom: 8 },
  cardLevel: { float: "right", background: "#1D4ED8", color: "white", padding: "4px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  cardFront: { background: "#F8FAFF", borderRadius: 16, padding: "24px", marginTop: 16, marginBottom: 20, clear: "both" },
  cardFrontLabel: { fontSize: 11, color: "#93C5FD", fontWeight: 700, letterSpacing: 2, marginBottom: 10, fontFamily: "'Space Mono', monospace" },
  cardFrontText: { fontSize: 26, fontWeight: 700, color: "#1D4ED8", lineHeight: 1.3 },
  revealBtn: { display: "block", width: "100%", padding: "16px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 14, fontSize: 17, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", fontFamily: "'Outfit', sans-serif" },
  cardBack: { background: "#F0F9FF", border: "2px solid #BFDBFE", borderRadius: 16, padding: "24px", marginBottom: 24 },
  cardBackLabel: { fontSize: 11, color: "#60A5FA", fontWeight: 700, letterSpacing: 2, marginBottom: 10, fontFamily: "'Space Mono', monospace" },
  cardBackText: { fontSize: 20, fontWeight: 600, color: "#1e3a8a", lineHeight: 1.4 },
  cardExample: { marginTop: 12, fontSize: 14, color: "#6B7280", fontStyle: "italic" },
  answerBtns: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 },
  btnOublie: { padding: "14px 8px", background: "#FEE2E2", color: "#B91C1C", border: "none", borderRadius: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", fontSize: 14, fontFamily: "'Outfit', sans-serif", lineHeight: 1.6 },
  btnHesite: { padding: "14px 8px", background: "#FEF3C7", color: "#B45309", border: "none", borderRadius: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", fontSize: 14, fontFamily: "'Outfit', sans-serif", lineHeight: 1.6 },
  btnFacile: { padding: "14px 8px", background: "#D1FAE5", color: "#065F46", border: "none", borderRadius: 14, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", fontSize: 14, fontFamily: "'Outfit', sans-serif", lineHeight: 1.6 },
  formCard: { background: "white", borderRadius: 20, padding: "28px", boxShadow: "0 4px 20px rgba(29,78,216,0.08)", marginBottom: 24 },
  formGroup: { marginBottom: 20 },
  label: { display: "block", fontSize: 14, fontWeight: 600, color: "#374151", marginBottom: 8 },
  input: { width: "100%", padding: "12px 16px", border: "2px solid #DBEAFE", borderRadius: 12, fontSize: 15, fontFamily: "'Outfit', sans-serif", outline: "none", transition: "border 0.2s", color: "#1f2937" },
  select: { width: "100%", padding: "12px 16px", border: "2px solid #DBEAFE", borderRadius: 12, fontSize: 15, fontFamily: "'Outfit', sans-serif", outline: "none", background: "white", color: "#1f2937" },
  btnPrimary: { padding: "13px 28px", background: "linear-gradient(135deg, #1D4ED8, #3B82F6)", color: "white", border: "none", borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: "pointer", transition: "all 0.2s", fontFamily: "'Outfit', sans-serif" },
  filterRow: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 },
  filterBtn: { padding: "8px 16px", border: "2px solid #1D4ED8", borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", fontFamily: "'Outfit', sans-serif" },
  cardList: { display: "flex", flexDirection: "column", gap: 14 },
  expCard: { background: "white", borderRadius: 18, padding: "20px 24px", boxShadow: "0 2px 12px rgba(29,78,216,0.07)", transition: "all 0.25s" },
  expCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  expCatTag: { background: "#EFF6FF", color: "#1D4ED8", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  expLevelTag: { padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  expFront: { fontSize: 18, fontWeight: 700, color: "#1D4ED8", marginBottom: 6 },
  expBack: { fontSize: 15, color: "#374151", marginBottom: 6 },
  expExample: { fontSize: 13, color: "#6B7280", fontStyle: "italic" },
  expFooter: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 },
  expDate: { fontSize: 12, color: "#93C5FD", fontWeight: 600 },
  deleteBtn: { background: "none", border: "none", cursor: "pointer", fontSize: 16, opacity: 0.6 },
  emptyState: { textAlign: "center", padding: "60px 20px", color: "#6B7280", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  catGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 },
  catCard: { background: "white", borderRadius: 16, padding: "20px", boxShadow: "0 2px 12px rgba(29,78,216,0.07)", transition: "all 0.25s" },
  catCardName: { fontSize: 17, fontWeight: 700, color: "#1D4ED8", marginBottom: 10 },
  catCardStats: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: "#6B7280" },
  footer: { textAlign: "center", padding: "20px", color: "#93C5FD", fontSize: 13, borderTop: "1px solid #DBEAFE", background: "white" },
};
