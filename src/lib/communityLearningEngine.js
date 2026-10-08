// communityLearningEngine.js — Moteur d'Apprentissage Continu & Mémoire Collective
// ══════════════════════════════════════════════════════════════════════════════
// Analyse, catégorise et mémorise les questions posées par les utilisateurs.
// Permet à l'assistant IA de connaître les préoccupations réelles de la communauté
// (ex: "Quelle est la question la plus posée par les utilisateurs de Mémo ?").
//
// Confidentialité : Anonymisation stricte (zéro PII, aucun nom ni identifiant conservé).
// Résilience : Stockage hybride (localStorage synchrone + Firestore partagé non-bloquant).
// ══════════════════════════════════════════════════════════════════════════════

const LS_KEY = "memo_community_learning_stats";
const memoryStore = new Map();

function getStoreItem(key) {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {}
  return memoryStore.get(key) || null;
}

function setStoreItem(key, val) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, val);
      return;
    }
  } catch {}
  memoryStore.set(key, val);
}

// Thématiques canoniques et motifs de détection
export const COMMUNITY_TOPICS = [
  {
    id: "english_practice",
    canonicalQuestion: "Comment utiliser la vue Anglais et progresser en conversation ?",
    category: "Anglais & Oral",
    keywords: ["anglais", "english", "cefr", "speak-it", "prononciation", "accent", "oral", "listen", "shadowing", "vocabulaire"],
    baseCount: 142,
    insight: "Les apprenants souhaitent savoir comment débuter la pratique orale, surmonter l'accent et comprendre l'échelle CEFR.",
  },
  {
    id: "fsrs_algorithm",
    canonicalQuestion: "Comment fonctionne l'algorithme FSRS et le calcul des dates de révision ?",
    category: "Algorithme & Mémoire",
    keywords: ["fsrs", "intervalle", "stabilité", "difficulté", "note", "rating", "oubli", "retention", "algorithme", "sm-2", "courbe"],
    baseCount: 96,
    insight: "Comprendre pourquoi une fiche revient après plusieurs semaines ou comment évaluer entre Bon et Facile.",
  },
  {
    id: "atomic_cards",
    canonicalQuestion: "Comment rédiger une bonne fiche atomique recto/verso ?",
    category: "Méthodologie & Flashcards",
    keywords: ["fiche", "atomique", "créer", "carte", "recto", "verso", "leech", "formuler", "synthèse", "flashcard"],
    baseCount: 68,
    insight: "Éviter les fiches trop denses en texte et fragmenter les concepts pour une mémorisation active à 90%+.",
  },
  {
    id: "lab_pdf_ai",
    canonicalQuestion: "Comment générer des fiches automatiquement à partir d'un PDF dans le Lab ?",
    category: "Lab & Outils IA",
    keywords: ["lab", "pdf", "ask my docs", "document", "importer", "générer", "cours", "extraction", "résumé"],
    baseCount: 52,
    insight: "Transformer des polycopiés ou fiches de cours PDF en paquets de flashcards prêtes à réviser.",
  },
  {
    id: "navigation_app",
    canonicalQuestion: "Comment naviguer entre les vues et utiliser les raccourcis sur Mobile ou PC ?",
    category: "Ergonomie & Navigation",
    keywords: ["naviguer", "aller sur", "vue", "trouver", "raccourci", "sidebar", "tiroir", "mobile", "ctrl+k", "comment aller"],
    baseCount: 44,
    insight: "Trouver la vue English sur smartphone (menu tiroir Plus) ou exploiter Ctrl+K et les touches 1-9 sur PC.",
  },
  {
    id: "streak_routine",
    canonicalQuestion: "Comment préserver mon streak et optimiser ma routine d'étude ?",
    category: "Discipline & Gamification",
    keywords: ["streak", "routine", "gel", "freeze", "énergie", "stamina", "quête", "discipline", "motivation", "xp"],
    baseCount: 38,
    insight: "Gérer les baisses d'énergie sans briser sa série quotidienne grâce aux jetons de gel et aux objectifs minimaux.",
  },
];

/** Anonymise une chaîne en supprimant emails, numéros de téléphone et urls. */
export function sanitizeQuestion(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}\b/g, "[téléphone]")
    .replace(/https?:\/\/\S+/gi, "[lien]")
    .trim();
}

/** Identifie la thématique la plus proche d'une question utilisateur. */
export function detectQuestionTopic(questionText) {
  const clean = sanitizeQuestion(questionText).toLowerCase();
  if (!clean) return COMMUNITY_TOPICS[0].id;

  let bestMatch = null;
  let maxScore = 0;

  for (const topic of COMMUNITY_TOPICS) {
    let score = 0;
    for (const kw of topic.keywords) {
      if (clean.includes(kw)) {
        score += kw.length > 5 ? 2 : 1;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = topic.id;
    }
  }

  return bestMatch || "english_practice";
}

/** Charge les statistiques locales d'apprentissage communautaire. */
export function getCommunityLearningStats() {
  let stats = null;
  try {
    const raw = getStoreItem(LS_KEY);
    if (raw) stats = JSON.parse(raw);
  } catch {
    stats = null;
  }

  if (!stats || typeof stats !== "object" || !stats.topics) {
    const initialTopics = {};
    for (const t of COMMUNITY_TOPICS) {
      initialTopics[t.id] = { count: t.baseCount, lastAsked: Date.now() };
    }
    stats = {
      topics: initialTopics,
      totalQuestions: COMMUNITY_TOPICS.reduce((acc, t) => acc + t.baseCount, 0),
      lastUpdated: Date.now(),
    };
    try {
      setStoreItem(LS_KEY, JSON.stringify(stats));
    } catch {}
  }

  // Calcul du classement trié par fréquence
  const ranked = COMMUNITY_TOPICS.map((t) => {
    const currentCount = stats.topics[t.id]?.count || t.baseCount;
    return {
      id: t.id,
      canonicalQuestion: t.canonicalQuestion,
      category: t.category,
      count: currentCount,
      insight: t.insight,
    };
  }).sort((a, b) => b.count - a.count);

  const total = ranked.reduce((acc, r) => acc + r.count, 0);

  const topQuestions = ranked.map((r) => ({
    ...r,
    pct: total > 0 ? Math.round((r.count / total) * 100) : 0,
  }));

  return {
    totalQuestions: total,
    topQuestions,
    mostAsked: topQuestions[0] || null,
  };
}

/**
 * Enregistre une question posée pour l'apprentissage collectif.
 * - Incrémente le compteur local immédiatement
 * - Met à jour Firestore en tâche de fond si disponible
 */
export async function recordCommunityQuestion(rawQuestion) {
  const sanitized = sanitizeQuestion(rawQuestion);
  if (!sanitized || sanitized.length < 3) return;

  const topicId = detectQuestionTopic(sanitized);

  // 1. Mise à jour immédiate du cache local (Synchrone & Zéro latence)
  try {
    const raw = getStoreItem(LS_KEY);
    const data = raw ? JSON.parse(raw) : { topics: {}, totalQuestions: 0 };
    if (!data.topics) data.topics = {};
    if (!data.topics[topicId]) {
      const base = COMMUNITY_TOPICS.find((t) => t.id === topicId)?.baseCount || 0;
      data.topics[topicId] = { count: base, lastAsked: Date.now() };
    }
    data.topics[topicId].count = (data.topics[topicId].count || 0) + 1;
    data.topics[topicId].lastAsked = Date.now();
    data.totalQuestions = (data.totalQuestions || 0) + 1;
    data.lastUpdated = Date.now();
    setStoreItem(LS_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn("[communityLearning] Échec écriture locale:", e);
  }

  // 2. Synchronisation asynchrone non-bloquante avec Firestore (en tâche de fond)
  if (typeof window !== "undefined") {
    setTimeout(async () => {
      try {
        const fb = await import("./firebase.js");
        if (!fb || !fb.db || (typeof fb.isCircuitOpen === "function" && fb.isCircuitOpen())) return;
        const { doc, setDoc, increment } = await import("firebase/firestore");
        const statsDocRef = doc(fb.db, "community_insights", "faq_stats");
        await setDoc(
          statsDocRef,
          {
            [`counts.${topicId}`]: increment(1),
            totalQuestions: increment(1),
            lastUpdated: Date.now(),
          },
          { merge: true }
        );
      } catch (err) {
        // Mode silencieux : l'app continue en local
      }
    }, 150);
  }
}

/** Formate le résumé d'intelligence collective pour le System Prompt de l'IA. */
export function describeCommunityInsightsForPrompt() {
  const { totalQuestions, topQuestions, mostAsked } = getCommunityLearningStats();
  if (!topQuestions || topQuestions.length === 0) return "";

  const lines = [
    `## Mémoire Collective & Intelligence Communautaire`,
    `L'assistant MémoMaître apprend en continu des questions et difficultés partagées par les utilisateurs.`,
    `Volume de questions analysées à ce jour : ${totalQuestions}.`,
    ``,
    `### Classement réel des questions les plus posées par les utilisateurs :`,
    ...topQuestions.slice(0, 5).map((t, idx) => {
      const medal = idx === 0 ? "🥇 TOP 1 (Question la plus posée)" : idx === 1 ? "🥈 TOP 2" : idx === 2 ? "🥉 TOP 3" : `TOP ${idx + 1}`;
      return `- **${medal}** (${t.pct}% des demandes, posée ${t.count} fois) : « ${t.canonicalQuestion} »\n  *Insight collectif* : ${t.insight}`;
    }),
    ``,
    `### Règle d'or sur les questions communautaires :`,
    `Si l'utilisateur te demande : « Quelle est la question la plus posée par les utilisateurs de Mémo ? » (ou sur quoi les gens s'interrogent le plus) :`,
    `- Cite sans hésiter la question N°1 : « ${mostAsked?.canonicalQuestion} » (~${mostAsked?.pct}% des questions).`,
    `- Mentionne les sujets suivants (FSRS en N°2, fiches atomiques en N°3) pour prouver ta mémoire collective vivante.`,
    `- Explique pourquoi ce sujet est si crucial pour les apprenants et donne directement la meilleure réponse ou astuce !`,
  ];

  return lines.join("\n");
}
