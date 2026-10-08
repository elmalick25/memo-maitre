// src/lib/weeklyDigest.js
// ═══════════════════════════════════════════════════════════════════════════
// CALCULATEUR DU BULLETIN HEBDOMADAIRE D'ANALYSE COGNITIVE
//
// Analyse l'historique d'apprentissage sur une fenêtre glissante de 7 jours.
// Calcule les gains de rétention réels, les victoires mnésiques (ex-bloquantes),
// le module star et formule une recommandation personnalisée.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Vérifie si le moment actuel est propice à l'apparition de la synthèse hebdo.
 * Actif le dimanche à partir de 18h00 jusqu'au lundi 14h00.
 * @param {Date} [date]
 * @returns {boolean}
 */
export function isWeeklyDigestTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const day = d.getDay(); // 0 = Dimanche, 1 = Lundi
  const hour = d.getHours();
  return (day === 0 && hour >= 18) || (day === 1 && hour < 14);
}

/**
 * Génère une clé unique pour la semaine en cours (ex: "2026-W40").
 */
export function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Formate un intervalle de dates lisible en français.
 */
function formatWeekRange(startDate, endDate) {
  const opts = { day: "numeric", month: "short" };
  const startStr = startDate.toLocaleDateString("fr-FR", opts);
  const endStr = endDate.toLocaleDateString("fr-FR", opts);
  return `${startStr} — ${endStr}`;
}

/**
 * Analyse l'état des expressions et des sessions pour construire le bilan.
 * @param {Array} expressions
 * @param {Array} sessions
 * @param {Date} [referenceDate]
 */
export function computeWeeklyDigest(expressions = [], sessions = [], referenceDate = new Date()) {
  const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const refMs = ref.getTime();
  const weekStartMs = refMs - 7 * 24 * 3600 * 1000;
  const weekStartDate = new Date(weekStartMs);

  const weekKey = getWeekKey(ref);
  const weekRange = formatWeekRange(weekStartDate, ref);

  const list = Array.isArray(expressions) ? expressions : [];
  const sessList = Array.isArray(sessions) ? sessions : [];

  // 1. Décompte de l'activité sur les 7 derniers jours
  const activeDatesSet = new Set();
  let totalReviews = 0;

  // Depuis les sessions enregistrées
  sessList.forEach((s) => {
    if (!s?.date) return;
    const t = new Date(s.date).getTime();
    if (!isNaN(t) && t >= weekStartMs && t <= refMs) {
      const dStr = String(s.date).slice(0, 10);
      activeDatesSet.add(dStr);
      totalReviews += Number(s.count) || 0;
    }
  });

  // Depuis l'historique direct des cartes si sessions incomplètes
  let cardReviewsInWeek = 0;
  const reviewedCardsThisWeek = [];

  list.forEach((e) => {
    let cardReviewedThisWeek = false;
    (e?.reviewHistory || []).forEach((h) => {
      if (!h?.date) return;
      const t = new Date(h.date).getTime();
      if (!isNaN(t) && t >= weekStartMs && t <= refMs) {
        const dStr = String(h.date).slice(0, 10);
        activeDatesSet.add(dStr);
        cardReviewsInWeek += 1;
        cardReviewedThisWeek = true;
      }
    });
    if (cardReviewedThisWeek) {
      reviewedCardsThisWeek.push(e);
    }
  });

  // Nombre total de révisions consolidé
  const finalReviewCount = Math.max(totalReviews, cardReviewsInWeek);
  const activeDays = Math.min(7, activeDatesSet.size);

  // 2. Fiches montées en consolidation / palier
  const stabilizedCards = reviewedCardsThisWeek.filter((e) => {
    const lvl = Number(e.level) || 0;
    const interval = Number(e.interval) || 0;
    return lvl >= 3 || interval >= 5 || e.masteryStage === "recalled" || e.masteryStage === "mastered";
  });

  // 3. Fiches complexes débloquées (ex-leeches qui ont progressé)
  const conqueredLeeches = reviewedCardsThisWeek.filter((e) => {
    const lapses = Number(e.lapses) || 0;
    const lvl = Number(e.level) || 0;
    return lapses >= 2 && lvl >= 2;
  });

  // 4. Calcul du taux de rétention de la semaine
  let retentionRate = 85; // valeur saine par défaut si peu d'historique
  if (reviewedCardsThisWeek.length >= 3) {
    const successfulCount = reviewedCardsThisWeek.filter((e) => (e.level || 0) >= 1).length;
    retentionRate = Math.round((successfulCount / reviewedCardsThisWeek.length) * 100);
  }

  // 5. Module Star (catégorie la plus travaillée)
  const categoryCounts = {};
  reviewedCardsThisWeek.forEach((e) => {
    const cat = e.category || "Général";
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  let starCategory = "Général";
  let maxCatCount = 0;
  Object.entries(categoryCounts).forEach(([cat, count]) => {
    if (count > maxCatCount) {
      maxCatCount = count;
      starCategory = cat;
    }
  });

  // 6. Analyse des cartes d'anglais & incubation
  const englishCards = list.filter((e) =>
    (e.category && /anglais|english/i.test(e.category)) || (e.lang && String(e.lang).startsWith("en"))
  );
  const incubatingCount = englishCards.filter((e) => (e.level || 0) > 0 && (e.level || 0) < 4).length;

  // 7. Recommandation stratégique personnalisée pour la semaine suivante
  let focusRecommendation = "Maintenir la régularité sur tes révisions quotidiennes.";
  const dormantCount = list.filter((e) => !e.lastReview && (e.level === 0 || e.level === undefined) && !e.paused).length;

  if (conqueredLeeches.length > 0) {
    focusRecommendation = `Bravo pour les ${conqueredLeeches.length} cartes difficiles surmontées ! Continue de stabiliser « ${starCategory} ».`;
  } else if (dormantCount >= 5) {
    focusRecommendation = `Tu as ${dormantCount} fiches dormantes : lance une micro-session pour amorcer leur mémorisation.`;
  } else if (incubatingCount > 0) {
    focusRecommendation = `${incubatingCount} expressions anglaises sont en incubation active : garde le cap de la pratique orale.`;
  } else if (retentionRate < 75) {
    focusRecommendation = `Taux de rétention à ${retentionRate}% : privilégie de courtes sessions fréquentes plutôt que des blocs denses.`;
  } else {
    focusRecommendation = `Excellente solidité mnésique (${retentionRate}%). Prêt à introduire de nouvelles notions en ${starCategory}.`;
  }

  return {
    weekKey,
    weekRange,
    totalReviews: finalReviewCount,
    activeDays,
    retentionRate,
    stabilizedCount: stabilizedCards.length,
    conqueredLeechesCount: conqueredLeeches.length,
    conqueredSample: conqueredLeeches.slice(0, 3).map((c) => c.front || ""),
    starCategory,
    starCategoryCount: maxCatCount,
    incubatingCount,
    dormantCount,
    focusRecommendation,
  };
}
