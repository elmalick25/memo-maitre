import React, { useState, useEffect } from "react";
import { safeParseJSON } from "../lib/textUtils";
import {
  saveArticleList, loadArticleList,
  saveArticleCache, loadArticleCache,
  listCachedArticles, pruneOldArticles, cacheStats,
} from "../lib/offlineArticles";
import { getNetworkStatus, onNetworkChange } from "../lib/networkStatus";
import { fetchViaProxies, fetchReadableArticle, extractReadableFromHtml } from "../lib/articleExtractor";

// 🇫🇷 Sources d'actualités françaises uniquement
const RSS_FEEDS = [
  { name: "Le Monde",    url: "https://www.lemonde.fr/rss/une.xml",       color: "#1E3A8A", emoji: "🗞️" },
  { name: "France Info", url: "https://www.francetvinfo.fr/titres.rss",   color: "#0EA5E9", emoji: "📡" },
  { name: "RFI",         url: "https://www.rfi.fr/fr/rss",                color: "#16A34A", emoji: "🌍" },
  { name: "Le Figaro",   url: "https://www.lefigaro.fr/rss/figaro_actualites.xml", color: "#0F172A", emoji: "📰" },
  { name: "Libération",  url: "https://www.liberation.fr/arc/outboundfeeds/rss-all/?outputType=xml", color: "#DC2626", emoji: "📣" },
];

export default function LiveNewsModule({ callClaude, theme, isDarkMode }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);

  const [articleContent, setArticleContent] = useState("");
  const [analysisData, setAnalysisData] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [isReadingAloud, setIsReadingAloud] = useState(false);
  const [isOnline, setIsOnline] = useState(() => getNetworkStatus().online);
  const [prefetching, setPrefetching] = useState(false);
  const [prefetchProgress, setPrefetchProgress] = useState({ done: 0, total: 0 });
  const [offlineInfo, setOfflineInfo] = useState({ count: 0, withAnalysis: 0 });

  // Suivi état réseau + stats de cache
  useEffect(() => {
    const refresh = async () => setOfflineInfo(await cacheStats().catch(() => ({ count: 0, withAnalysis: 0 })));
    refresh();
    return onNetworkChange(s => { setIsOnline(s.online); refresh(); });
  }, []);

  const fetchNews = async () => {
    setLoading(true);
    setError(null);
    // Si hors ligne → charger directement le cache
    if (!getNetworkStatus().online) {
      const cached = await loadArticleList();
      if (cached.length) {
        setArticles(cached);
        setError(null);
      } else {
        setError("Hors ligne et aucun article en cache. Connecte-toi une fois pour préparer la lecture hors ligne.");
      }
      setLoading(false);
      return;
    }
    try {
      // 🛡️ Chaîne de proxies durcie (validation d'erreurs Jina/AllOrigins) — voir lib/articleExtractor.js
      const results = await Promise.allSettled(
        RSS_FEEDS.map(async (feed) => {
          const { body: xmlText } = await fetchViaProxies(feed.url);
          const parser = new DOMParser();
          const xml = parser.parseFromString(xmlText, "text/xml");
          const items = Array.from(xml.querySelectorAll("item"));

          return items.map(item => ({
            title: item.querySelector("title")?.textContent || "Sans titre",
            link: item.querySelector("link")?.textContent || "",
            description: item.querySelector("description")?.textContent || "",
            // Récupère content:encoded si présent (RSS riche) — donne déjà du texte exploitable
            contentEncoded: item.getElementsByTagName("content:encoded")[0]?.textContent || "",
            pubDate: new Date(item.querySelector("pubDate")?.textContent || Date.now()),
            source: feed.name,
            color: feed.color,
            emoji: feed.emoji,
          }));
        })
      );

      let allArticles = [];
      results.forEach(result => {
        if (result.status === "fulfilled" && result.value) {
          allArticles = [...allArticles, ...result.value];
        } else {
          console.error("RSS fetch error:", result.reason);
        }
      });

      // Tri par date décroissante (les plus récents en haut) et on garde 20 articles
      allArticles.sort((a, b) => b.pubDate - a.pubDate);
      const top = allArticles.slice(0, 20);
      setArticles(top);
      // 💾 Persister la liste pour la lecture hors ligne
      saveArticleList(top).catch(() => {});
      pruneOldArticles(30).catch(() => {});
      cacheStats().then(setOfflineInfo).catch(() => {});

    } catch (e) {
      console.error(e);
      // 🛟 Fallback cache hors ligne / proxy KO
      const cached = await loadArticleList();
      if (cached.length) {
        setArticles(cached);
        setError("Connexion instable — affichage des articles en cache.");
      } else {
        setError("Erreur lors de la récupération des actualités.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
    const interval = setInterval(fetchNews, 2 * 60 * 60 * 1000); // every 2 hours
    return () => clearInterval(interval);
  }, []);

  // 🔧 Helper extrait : récupère + analyse un article et le persiste en cache IDB
  const fetchAndAnalyzeArticle = async (article, { useAI = true } = {}) => {
    // 1) Extraction lisible via proxy + Readability-lite (lib/articleExtractor)
    let extracted = "";
    try {
      const { text } = await fetchReadableArticle(article.link);
      extracted = text;
    } catch (e) {
      console.warn("[news] extraction KO, fallback RSS description", e?.message);
    }
    // 2) Fallback : content:encoded RSS (souvent déjà l'article complet)
    if (!extracted || extracted.length < 400) {
      const fromRss = extractReadableFromHtml(article.contentEncoded || article.description || "");
      if (fromRss.length > extracted.length) extracted = fromRss;
    }
    // 3) Garde la description nue en dernier recours
    const textToAnalyze = (extracted || article.description || "").slice(0, 12000);
    if (!textToAnalyze || textToAnalyze.length < 200) {
      // Trop court : on ne tente pas l'IA, on persiste juste la description
      await saveArticleCache(article.link, { article, content: textToAnalyze, analysis: null }).catch(() => {});
      return { content: textToAnalyze, analysis: null };
    }

    let parsed = null;
    if (useAI && callClaude) {
      const prompt = `Tu es un journaliste-explicateur expert. Analyse l'article suivant.
RÉPONDS UNIQUEMENT EN JSON VALIDE STRICTEMENT formaté ainsi:
{
  "summary": "Résumé LONG et COMPLET de 10 à 15 phrases (au minimum 250 mots) qui couvre TOUT l'article : le contexte, les faits principaux, les chiffres, les acteurs cités, les causes, les conséquences, les déclarations importantes, et la conclusion. Le lecteur doit pouvoir TOUT comprendre de cet article sans avoir besoin d'aller sur la source. N'omets aucun élément important. Écris en français clair, fluide et accessible, sans listes à puces — uniquement des phrases bien construites.",
  "level": "Simple/Intermédiaire/Avancé",
  "vocabulary": [
    { "word": "terme ou expression clé 1", "definition": "définition courte en français", "example": "exemple tiré du texte ou inventé", "frequency": "high/medium/low", "register": "formal/informal" }
  ],
  "comprehensionQuestions": [
    { "question": "Question de compréhension en français ?", "options": ["A", "B", "C", "D"], "answer": "Lettre exacte (ex: B)", "explanation": "Explication courte de la réponse en français." }
  ],
  "keyPhrase": "La phrase ou expression la plus importante de l'article."
}

EXIGENCES STRICTES :
- "summary" DOIT contenir au moins 10 phrases complètes et couvrir l'intégralité du contenu de l'article (qui, quoi, quand, où, pourquoi, comment, et la suite).
- L'INTÉGRALITÉ de la réponse DOIT être en français — vocabulaire, exemples, questions, options et explications.
- Ne tronque rien. Si l'article est long, fais un résumé d'autant plus dense.

Texte de l'article :
${textToAnalyze}
`;
      try {
        const aiResponse = await callClaude(prompt, "Réponds uniquement en JSON valide, intégralement en français.");
        parsed = safeParseJSON(aiResponse);
      } catch (e) {
        console.warn("[news] analyse IA KO, on garde le contenu brut", e);
      }
    }

    // 💾 Persister pour lecture hors ligne
    await saveArticleCache(article.link, { article, content: textToAnalyze, analysis: parsed }).catch(() => {});
    return { content: textToAnalyze, analysis: parsed };
  };

  const handleSelectArticle = async (article) => {
    setSelectedArticle(article);
    setAnalysisData(null);
    setArticleContent("");
    setAnalysisLoading(true);
    window.speechSynthesis?.cancel();
    setIsReadingAloud(false);

    // 1️⃣ Cache d'abord — affichage instantané hors ligne ET en ligne
    const cached = await loadArticleCache(article.link).catch(() => null);
    if (cached) {
      if (cached.content) setArticleContent(cached.content);
      if (cached.analysis) setAnalysisData(cached.analysis);
    }

    // 2️⃣ Hors ligne : on s'arrête au cache
    if (!getNetworkStatus().online) {
      if (!cached) {
        setError("Hors ligne et cet article n'a pas été préparé. Utilise « Préparer hors-ligne » quand tu seras connecté.");
      }
      setAnalysisLoading(false);
      return;
    }

    // 3️⃣ En ligne : on (re)génère pour rafraîchir
    try {
      const { content, analysis } = await fetchAndAnalyzeArticle(article, { useAI: true });
      if (content) setArticleContent(content);
      if (analysis) setAnalysisData(analysis);
      cacheStats().then(setOfflineInfo).catch(() => {});
    } catch (e) {
      console.error("Analysis error", e);
      if (!cached) setError("Impossible d'analyser l'article ou le contenu est bloqué.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  // 📥 Préparer tous les articles affichés pour la lecture hors ligne
  const prepareOffline = async () => {
    if (!articles.length || prefetching) return;
    if (!getNetworkStatus().online) {
      setError("Tu dois être en ligne pour préparer le mode hors ligne.");
      return;
    }
    setPrefetching(true);
    setPrefetchProgress({ done: 0, total: articles.length });
    for (let i = 0; i < articles.length; i++) {
      try {
        // Ne re-télécharge pas si déjà en cache avec analyse
        const existing = await loadArticleCache(articles[i].link);
        if (!existing || !existing.analysis) {
          await fetchAndAnalyzeArticle(articles[i], { useAI: true });
        }
      } catch (e) {
        console.warn("[prefetch] skip", articles[i]?.title, e);
      }
      setPrefetchProgress({ done: i + 1, total: articles.length });
    }
    cacheStats().then(setOfflineInfo).catch(() => {});
    setPrefetching(false);
  };


  const handleReadAloud = (text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    if (isReadingAloud) {
      setIsReadingAloud(false);
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "fr-FR";
    utter.rate = 0.9;

    // Choisir une voix française si disponible
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang.startsWith("fr"));
    if (frVoice) utter.voice = frVoice;

    utter.onstart = () => setIsReadingAloud(true);
    utter.onend = () => setIsReadingAloud(false);
    utter.onerror = () => setIsReadingAloud(false);

    window.speechSynthesis.speak(utter);
  };

  const getTimeAgo = (date) => {
    const diff = Math.floor((new Date() - date) / 60000);
    if (diff < 60) return `il y a ${diff} min`;
    const hours = Math.floor(diff / 60);
    if (hours < 24) return `il y a ${hours} h`;
    return `il y a ${Math.floor(hours / 24)} j`;
  };

  // UI colors — alignées sur le thème global de l'app pour cohérence visuelle
  const bgColor     = theme?.cardBg     || (isDarkMode ? "var(--mm-bg-card)" : "#ffffff");
  const bgElev      = theme?.bgElev     || (isDarkMode ? "rgba(255,255,255,0.04)" : "#F8FAFC");
  const borderColor = theme?.border     || "var(--mm-border)";
  const gradHeader  = isDarkMode
    ? "linear-gradient(135deg, rgba(77,107,254,0.18), rgba(168,85,247,0.10))"
    : "linear-gradient(135deg, rgba(77,107,254,0.10), rgba(168,85,247,0.06))";

  return (
    <div style={{ display: "flex", gap: 24, height: "100%", flexWrap: "wrap" }}>
      {/* ── Liste des articles (Gauche) ── */}
      <div style={{
        width: "min(340px, 100%)", display: "flex", flexDirection: "column", gap: 12,
        overflowY: "auto", paddingRight: 8, flexShrink: 0
      }} className="tabs-scroll">
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 16px", borderRadius: 16, background: gradHeader,
          border: `1px solid ${theme.primary}30`, marginBottom: 4,
        }}>
          <div>
            <h2 style={{ fontSize: 18, fontWeight: 900, margin: 0, color: theme.text, letterSpacing: -0.3 }}>
              📰 Actualités françaises
            </h2>
            <div style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600, marginTop: 2 }}>
              {articles.length > 0 ? `${articles.length} articles · ${RSS_FEEDS.length} sources` : "Sources FR live"}
              {offlineInfo.count > 0 && (
                <span style={{ marginLeft: 6, color: theme.primary }}>
                  · 💾 {offlineInfo.withAnalysis}/{offlineInfo.count} hors-ligne
                </span>
              )}
              {!isOnline && <span style={{ marginLeft: 6, color: "#ef4444" }}>· hors-ligne</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={prepareOffline}
              disabled={prefetching || !isOnline || articles.length === 0}
              title={isOnline ? "Préparer tous les articles pour la lecture hors-ligne" : "Connecte-toi d'abord"}
              style={{
                background: prefetching ? theme.textMuted : "#10b981",
                color: "white", border: "none", cursor: prefetching ? "default" : "pointer",
                height: 36, padding: "0 12px", borderRadius: 12, fontSize: 13, fontWeight: 700,
                opacity: (!isOnline || articles.length === 0) ? 0.5 : 1,
                boxShadow: "0 4px 12px rgba(16,185,129,0.35)",
              }}
            >
              {prefetching ? `⏳ ${prefetchProgress.done}/${prefetchProgress.total}` : "📥 Hors-ligne"}
            </button>
            <button onClick={fetchNews} disabled={loading} title="Rafraîchir" style={{
              background: theme.primary, color: "white", border: "none", cursor: "pointer",
              width: 36, height: 36, borderRadius: 12, fontSize: 16,
              opacity: loading ? 0.5 : 1, transition: "transform .2s",
              boxShadow: `0 4px 12px ${theme.primary}40`,
            }}>{loading ? "⏳" : "🔄"}</button>
          </div>
        </div>

        {loading && articles.length === 0 && (
          <div style={{ color: theme.textMuted, fontSize: 13, textAlign: "center", padding: 20 }}>
            Chargement des actualités…
          </div>
        )}

        {articles.map((article, i) => {
          const isSel = selectedArticle?.link === article.link;
          return (
            <div key={article.link || `${article.source}-${i}`}
              onClick={() => handleSelectArticle(article)}
              style={{
                padding: 16, borderRadius: 16, background: bgColor,
                border: `1px solid ${isSel ? theme.primary : borderColor}`,
                cursor: "pointer", transition: "all 0.2s ease",
                boxShadow: isSel
                  ? `0 8px 24px ${theme.primary}25, 0 0 0 2px ${theme.primary}30`
                  : isDarkMode ? "0 1px 3px rgba(0,0,0,0.3)" : "0 1px 3px rgba(15,23,42,0.05)",
                transform: isSel ? "translateY(-1px)" : "none",
              }}
              onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.transform = "translateY(-2px)"; }}
              onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.transform = "none"; }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, color: "white", background: article.color,
                  padding: "3px 9px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4,
                  letterSpacing: 0.2,
                }}>
                  <span>{article.emoji || "📰"}</span>{article.source}
                </span>
                <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>
                  {getTimeAgo(article.pubDate)}
                </span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, lineHeight: 1.4 }}>
                {article.title}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Détail et Analyse IA (Droite) ── */}
      <div style={{
        flex: 1, background: bgColor, borderRadius: 24, padding: 32,
        border: `1px solid ${borderColor}`, overflowY: "auto"
      }} className="tabs-scroll">
        {!selectedArticle ? (
          <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: theme.textMuted }}>
            <span style={{ fontSize: 48, marginBottom: 16 }}>🗞️</span>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Sélectionne un article pour l'analyser</span>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24, animation: "fadeUp 0.3s ease" }}>

            {/* Header Article */}
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: "white", background: selectedArticle.color, padding: "4px 10px", borderRadius: 8 }}>
                  {selectedArticle.source}
                </span>
                <a href={selectedArticle.link} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: theme.primary, textDecoration: "none", fontWeight: 700 }}>
                  Lire l'original ↗
                </a>
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 900, color: theme.text, lineHeight: 1.3, margin: 0 }}>
                {selectedArticle.title}
              </h2>
            </div>

            {error && (
              <div style={{ padding: 16, background: "rgba(239,68,68,0.1)", color: "#EF4444", borderRadius: 12, fontWeight: 600 }}>
                {error}
              </div>
            )}

            {analysisLoading ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, gap: 16 }}>
                <div style={{ fontSize: 32, animation: "pulse 1.5s infinite" }}>🤖</div>
                <div style={{ color: theme.textMuted, fontWeight: 600 }}>Claude lit et analyse l'article...</div>
              </div>
            ) : (analysisData || articleContent) ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>

                {/* Summary & Audio */}
                {analysisData && (
                <div style={{
                  background: isDarkMode ? "rgba(77, 107, 254,0.1)" : "rgba(77, 107, 254,0.05)",
                  padding: 24, borderRadius: 16, border: `1px solid ${theme.primary}40`
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: theme.primary, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>📝</span> Résumé
                      <span style={{ fontSize: 11, background: "rgba(255,255,255,0.2)", padding: "2px 8px", borderRadius: 6, color: theme.text }}>
                        Niveau {analysisData.level}
                      </span>
                    </h3>
                    <button
                      onClick={() => handleReadAloud(analysisData.summary)}
                      style={{
                        padding: "8px 16px", borderRadius: 12, cursor: "pointer",
                        background: isReadingAloud ? "#EF4444" : theme.primary,
                        color: "white", border: "none", fontWeight: 700, fontSize: 13,
                        display: "flex", alignItems: "center", gap: 8, transition: "background 0.2s"
                      }}
                    >
                      {isReadingAloud ? "⏹️ Stop" : "🔊 Écouter"}
                    </button>
                  </div>
                  <div style={{ fontSize: 16, color: theme.text, lineHeight: 1.6 }}>
                    {analysisData.summary}
                  </div>
                </div>
                )}

                {/* Article complet (lecture hors-ligne) */}
                {articleContent && (
                  <details style={{
                    background: isDarkMode ? "rgba(255,255,255,0.03)" : "var(--mm-bg-elev)",
                    padding: 20, borderRadius: 16, border: `1px solid ${borderColor}`,
                  }}>
                    <summary style={{ cursor: "pointer", fontSize: 15, fontWeight: 800, color: theme.text, listStyle: "none", display: "flex", alignItems: "center", gap: 8 }}>
                      📖 Lire l'article complet
                      <span style={{ fontSize: 11, color: theme.textMuted, fontWeight: 600 }}>
                        · {Math.ceil(articleContent.split(/\s+/).length / 200)} min de lecture
                      </span>
                    </summary>
                    <div style={{ marginTop: 16, fontSize: 15, color: theme.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {articleContent}
                    </div>
                  </details>
                )}

                {/* Key Phrase */}
                {analysisData?.keyPhrase && (
                  <div style={{ textAlign: "center", padding: "16px 24px", background: "linear-gradient(135deg, rgba(245,158,11,0.1), rgba(239,68,68,0.1))", borderRadius: 16, border: "1px dashed rgba(245,158,11,0.4)" }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: "#F59E0B", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Expression clé à retenir</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: theme.text, fontStyle: "italic" }}>"{analysisData.keyPhrase}"</div>
                  </div>
                )}

                {/* Vocabulary */}
                {analysisData?.vocabulary?.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 16px 0", color: theme.text }}>📚 Vocabulaire clé</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                    {analysisData.vocabulary?.map((v, i) => (
                      <div key={i} style={{
                        background: isDarkMode ? "rgba(255,255,255,0.03)" : "var(--mm-bg-elev)",
                        padding: 16, borderRadius: 16, border: `1px solid ${borderColor}`
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <strong style={{ fontSize: 16, color: theme.primary }}>{v.word}</strong>
                          <span style={{ fontSize: 10, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", background: isDarkMode ? "rgba(255,255,255,0.1)" : "rgba(77,107,254,0.05)", padding: "2px 6px", borderRadius: 4 }}>
                            {v.frequency === "high" ? "fréquent" : v.frequency === "medium" ? "moyen" : "rare"}
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: theme.text, marginBottom: 8 }}>{v.definition}</div>
                        <div style={{ fontSize: 12, color: theme.textMuted, fontStyle: "italic", borderLeft: `2px solid ${theme.primary}40`, paddingLeft: 8 }}>
                          "{v.example}"
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                )}

                {/* Comprehension Quiz */}
                {analysisData?.comprehensionQuestions?.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 16px 0", color: theme.text }}>🎯 Questions de compréhension</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    {analysisData.comprehensionQuestions?.map((q, i) => (
                      <details key={i} style={{
                        background: isDarkMode ? "rgba(255,255,255,0.03)" : "var(--mm-bg-elev)",
                        borderRadius: 16, border: `1px solid ${borderColor}`, padding: 16
                      }}>
                        <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 15, color: theme.text, listStyle: "none", outline: "none" }}>
                          <span style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                            <span style={{ color: theme.primary }}>Q{i + 1}.</span>
                            <span style={{ flex: 1 }}>{q.question}</span>
                            <span style={{ fontSize: 12, color: theme.textMuted }}>▶ Révéler</span>
                          </span>
                        </summary>
                        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${borderColor}` }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                            {q.options.map((opt, j) => {
                              const isCorrect = opt.startsWith(q.answer);
                              return (
                                <div key={j} style={{
                                  padding: "8px 12px", borderRadius: 8, fontSize: 14,
                                  background: isDarkMode ? "rgba(255,255,255,0.05)" : "white",
                                  border: `1px solid ${isCorrect ? "#10B981" : borderColor}`,
                                  color: theme.text
                                }}>
                                  {opt}
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: 13, color: theme.text, background: "rgba(16,185,129,0.1)", padding: 12, borderRadius: 8, borderLeft: "4px solid #10B981" }}>
                            <strong>Explication : </strong>{q.explanation}
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </div>
                )}

              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
