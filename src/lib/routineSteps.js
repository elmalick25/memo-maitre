// src/lib/routineSteps.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 24 — UNE SEULE source de vérité pour la routine quotidienne.
//
// Avant : la liste des 14 étapes était dupliquée (DailyRoutineTracker.jsx + le
// bloc « Alertes routine » du dashboard). Modifier la routine désynchronisait
// l'alerte silencieusement.
// Maintenant : tout le monde importe ce module. PURE — aucune écriture ici.
// ═══════════════════════════════════════════════════════════════════════════

export const ROUTINE_STORAGE_KEY = "memomaitre_daily_routine_v2";
export const ROUTINE_STREAK_KEY = "memomaitre_routine_streak_v1";
export const PERIODS_ORDER = ["matin", "midi", "soir", "nuit_debut", "nuit"];

export const ROUTINE_STEPS = [
  // ─── MATIN ───────────────────────────────────────────────────────────────
  {
    id: "matin_stats",
    period: "matin",
    periodLabel: "☀️ Matin",
    periodColor: "#F59E0B",
    icon: "📊",
    label: "Stats du jour",
    sub: "Voir les fiches dues, la progression, le streak",
    duration: 2,
    actionId: "stats",
    tip: "Commence par savoir combien de fiches tu as à réviser aujourd'hui",
  },
  {
    id: "matin_revision",
    period: "matin",
    periodLabel: "☀️ Matin",
    periodColor: "#F59E0B",
    icon: "🧠",
    label: "Révision FSRS",
    sub: "Réviser TOUTES les fiches dues (Flow State recommandé)",
    duration: 20,
    actionId: "review",
    tip: "La révision du matin = mémoire fraîche. C'est le meilleur moment scientifiquement.",
  },
  {
    id: "matin_actu",
    period: "matin",
    periodLabel: "☀️ Matin",
    periodColor: "#F59E0B",
    icon: "📰",
    label: "Actualités Tech",
    sub: "Veille technologique + créer des fiches sur les news importantes",
    duration: 10,
    actionId: "veille",
    tip: "1 news = au moins 1 fiche. Crée des fiches sur ce qui t'intéresse ou t'est utile.",
  },

  // ─── PAUSE MIDI ────────────────────────────────────────────────────────────
  {
    id: "pause_revision",
    period: "midi",
    periodLabel: "⚡ Pauses",
    periodColor: "#4D6BFE",
    icon: "⚡",
    label: "Révision en pause",
    sub: "5-10 min de révision pendant les pauses de la journée",
    duration: 10,
    actionId: "review",
    tip: "Les micro-sessions en pause consolident la mémoire à long terme.",
  },

  // ─── SOIR 18h ─────────────────────────────────────────────────────────────
  {
    id: "soir_video_en",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "🎬",
    label: "Vidéo Anglais",
    sub: "Regarder 1 vidéo en anglais (podcast, YouTube, news)",
    duration: 10,
    actionId: "practice",
    tip: "Utilise CoachNewsAnchor pour les actualités en anglais ou Live News Module.",
  },
  {
    id: "soir_ajout_expressions",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "✍️",
    label: "Ajouter expressions apprises",
    sub: "Créer des fiches sur les expressions entendues dans la vidéo",
    duration: 5,
    actionId: "add",
    tip: "Tape les expressions dans la section Ajouter → Chat Copilot IA pour les enrichir automatiquement.",
  },
  {
    id: "soir_ecrit",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "📝",
    label: "Écriture en anglais",
    sub: "Rédiger quelques phrases ou un court paragraphe en anglais",
    duration: 5,
    actionId: "practice",
    tip: "Dans EnglishPractice → Mode Écriture. Génère une évaluation IA de ta rédaction.",
  },
  {
    id: "soir_dictee",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "🎧",
    label: "Dictée anglaise",
    sub: "Écouter et retranscrire un passage en anglais",
    duration: 5,
    actionId: "practice",
    tip: "CoachSpeedListening avec vitesse réduite au départ, puis augmenter progressivement.",
  },
  {
    id: "soir_parler",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "🗣️",
    label: "Parler anglais",
    sub: "Conversation orale avec Nova AI ou en mode VoiceMirror",
    duration: 5,
    actionId: "practice",
    tip: "Ouvre EnglishPractice → Nova Voice. Parle de ta journée ou d'un sujet de ton choix.",
  },
  {
    id: "soir_revision_nouvelles",
    period: "soir",
    periodLabel: "🌆 Soir (18h)",
    periodColor: "#7C3AED",
    icon: "🔄",
    label: "Révision fiches fraîches",
    sub: "Réviser les fiches créées le soir (1ère révision à chaud)",
    duration: 10,
    actionId: "review",
    tip: "Crée tes fiches d'abord, puis révise-les immédiatement. Le premier rappel est crucial.",
  },

  // ─── APRÈS LE SOIR ─────────────────────────────────────────────────────────
  {
    id: "apres_fiches_cours",
    period: "nuit_debut",
    periodLabel: "📚 Après (cours)",
    periodColor: "#0891B2",
    icon: "📚",
    label: "Fiches des cours du jour",
    sub: "Créer les fiches sur les matières étudiées aujourd'hui",
    duration: 20,
    actionId: "add",
    tip: "Utilise Batch IA ou le Lab (si tu as un PDF de cours) pour générer vite.",
  },
  {
    id: "apres_revision_cours",
    period: "nuit_debut",
    periodLabel: "📚 Après (cours)",
    periodColor: "#0891B2",
    icon: "🎯",
    label: "Révision des fiches de cours",
    sub: "Réviser immédiatement les fiches créées depuis les cours du jour",
    duration: 15,
    actionId: "review",
    tip: "La révision immédiate après création = taux de mémorisation x2.",
  },

  // ─── NUIT ──────────────────────────────────────────────────────────────────
  {
    id: "nuit_review_finale",
    period: "nuit",
    periodLabel: "🌙 Nuit",
    periodColor: "#6D28D9",
    icon: "🌙",
    label: "Review finale",
    sub: "Terminer les fiches dues restantes si session pas complète",
    duration: 20,
    actionId: "review",
    tip: "Révision avant le sommeil = consolidation pendant la nuit. Très puissant scientifiquement.",
  },
  {
    id: "nuit_expressions_soir",
    period: "nuit",
    periodLabel: "🌙 Nuit",
    periodColor: "#6D28D9",
    icon: "💡",
    label: "Expressions de la nuit",
    sub: "Ajouter les expressions ou mots appris avant de dormir",
    duration: 5,
    actionId: "add",
    tip: "Les 5 dernières minutes avant de dormir = or pur pour la mémorisation.",
  },
];

export function getPeriodMeta(period) {
  const map = {
    matin: { label: "☀️ Matin", short: "Ce matin", color: "#F59E0B", bg: "rgba(245,158,11,0.08)" },
    midi: { label: "⚡ Pauses journée", short: "Pauses de la journée", color: "#4D6BFE", bg: "rgba(77,107,254,0.08)" },
    soir: { label: "🌆 Soir — 18h (Anglais)", short: "Ce soir — 18h · Anglais", color: "#7C3AED", bg: "rgba(124,58,237,0.08)" },
    nuit_debut: { label: "📚 Fiches des cours du jour", short: "Après les cours", color: "#0891B2", bg: "rgba(8,145,178,0.08)" },
    nuit: { label: "🌙 Nuit — Avant de dormir", short: "Avant de dormir", color: "#6D28D9", bg: "rgba(109,40,217,0.08)" },
  };
  return map[period] || { label: period, short: period, color: "#888", bg: "rgba(0,0,0,0.05)" };
}

/** Période de routine correspondant à une heure de la journée. */
export function periodForHour(hour) {
  const h = Number(hour);
  if (h >= 5 && h < 12) return "matin";
  if (h >= 12 && h < 18) return "midi";
  if (h >= 18 && h < 21) return "soir";
  if (h >= 21 && h < 23) return "nuit_debut";
  return "nuit";
}

export const ROUTINE_TOTAL_MINUTES = ROUTINE_STEPS.reduce((s, x) => s + x.duration, 0);

export function getStep(id) {
  return ROUTINE_STEPS.find((s) => s.id === id) || null;
}

/**
 * Résumé PUR de l'état de la routine du jour.
 * @param {object} checked  { [stepId]: true }
 * @param {number} hour     heure courante (0-23)
 */
export function routineSummary(checked = {}, hour = new Date().getHours()) {
  const done = ROUTINE_STEPS.filter((s) => checked[s.id]);
  const period = periodForHour(hour);
  const idx = PERIODS_ORDER.indexOf(period);
  const pending = ROUTINE_STEPS.filter((s) => s.period === period && !checked[s.id]);
  const earlier = ROUTINE_STEPS.filter(
    (s) => PERIODS_ORDER.indexOf(s.period) < idx && !checked[s.id]
  );
  const remaining = ROUTINE_STEPS.filter((s) => !checked[s.id]);
  const minutesLeftNow = pending.reduce((s, x) => s + x.duration, 0);
  return {
    steps: ROUTINE_STEPS,
    period,
    periodMeta: getPeriodMeta(period),
    doneCount: done.length,
    total: ROUTINE_STEPS.length,
    pct: Math.round((done.length / ROUTINE_STEPS.length) * 100),
    doneMinutes: done.reduce((s, x) => s + x.duration, 0),
    totalMinutes: ROUTINE_TOTAL_MINUTES,
    pending,
    earlier,
    remaining,
    minutesLeftNow,
    isComplete: done.length === ROUTINE_STEPS.length,
    nextStep: pending[0] || earlier[0] || remaining[0] || null,
  };
}

/**
 * CHANTIER 27 — Cadrage POSITIF (jamais « en retard »).
 * Renvoie { tone, icon, text, cta } ou null si rien d'utile à dire.
 */
export function routineFraming(summary) {
  if (!summary) return null;
  const { pending, earlier, remaining, periodMeta, minutesLeftNow, doneCount, total } = summary;
  if (summary.isComplete) {
    return { tone: "celebration", icon: "🏆", text: `Journée Parfaite : ${total}/${total} étapes bouclées.`, cta: "Revoir ma routine" };
  }
  const left = total - doneCount;
  if (left <= 2) {
    return {
      tone: "nearmiss",
      icon: "🎯",
      text: `Encore ${left} étape${left > 1 ? "s" : ""} → Journée Parfaite + coffre garanti.`,
      cta: "Finir maintenant",
    };
  }
  if (pending.length > 0) {
    return {
      tone: "opportunity",
      icon: "✨",
      text: `${pending.length} étape${pending.length > 1 ? "s" : ""} ${periodMeta.short.toLowerCase()} t'attend${pending.length > 1 ? "ent" : ""} — ${minutesLeftNow} min pour avancer ta journée.`,
      cta: "Ouvrir la routine",
    };
  }
  if (earlier.length > 0) {
    const mins = earlier.reduce((s, x) => s + x.duration, 0);
    return {
      tone: "opportunity",
      icon: "🕰️",
      text: `${earlier.length} étape${earlier.length > 1 ? "s" : ""} encore disponible${earlier.length > 1 ? "s" : ""} de plus tôt — ${mins} min pour les rattraper tranquillement.`,
      cta: "Rattraper",
    };
  }
  if (remaining.length > 0) {
    return { tone: "neutral", icon: "🌙", text: `Rien d'obligatoire maintenant — ${remaining.length} étape(s) plus tard dans la journée.`, cta: "Voir la routine" };
  }
  return null;
}

/** Near-miss routine, au format de lib/nearMiss.js (ou null). */
export function routineNearMiss(summary) {
  if (!summary || summary.isComplete) return null;
  const left = summary.total - summary.doneCount;
  if (left > 2) return null;
  return {
    id: "routine",
    icon: "🌟",
    text: `Encore ${left} étape${left > 1 ? "s" : ""} de routine → Journée Parfaite (coffre garanti)`,
    remaining: left,
    unit: "étapes",
    priority: 0,
  };
}
