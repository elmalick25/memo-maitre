/**
 * extraSessionEngine.js
 * Logique pure pour la préparation et la sélection de cartes
 * pour les sessions supplémentaires (extra) et de reprise.
 */

/**
 * Retourne le décompte des cartes actives (non archivées / non en pause) par module.
 * @param {Array} expressions
 * @returns {Record<string, number>}
 */
export function getAvailableCardsByModule(expressions = []) {
  const counts = {};
  for (const card of expressions) {
    if (card?.paused) continue;
    const cat = (card.category || "").trim() || "Général";
    counts[cat] = (counts[cat] || 0) + 1;
  }
  return counts;
}

/**
 * Sélectionne intelligemment un lot de cartes pour une session extra.
 * Priorise :
 * 1. Les fiches déjà dues / échues (nextReview <= now)
 * 2. Les fiches avec un niveau de maîtrise plus bas (level plus faible)
 * 3. Les fiches à échéance la plus proche
 *
 * @param {Object} options
 * @param {Array} options.expressions
 * @param {Array} [options.dailySessionPreview]
 * @param {string} [options.selectedModule="all"] - "all" ou nom du module
 * @param {number} [options.count=10]
 * @param {number} [options.nowMs]
 * @returns {Array} pickedCards
 */
export function pickExtraSessionCards({
  expressions = [],
  dailySessionPreview = [],
  selectedModule = "all",
  count = 10,
  nowMs = Date.now(),
} = {}) {
  let pool = expressions.filter((e) => e && !e.paused);

  if (selectedModule && selectedModule !== "all") {
    pool = pool.filter((e) => {
      const cat = (e.category || "").trim() || "Général";
      return cat === selectedModule;
    });
  }

  if (pool.length === 0) return [];

  const previewIds = new Set((dailySessionPreview || []).map((c) => c?.id).filter(Boolean));
  const fromPreview = pool.filter((c) => previewIds.has(c.id));
  const others = pool.filter((c) => !previewIds.has(c.id));

  others.sort((a, b) => {
    const aDue = a.nextReview ? new Date(a.nextReview).getTime() : 0;
    const bDue = b.nextReview ? new Date(b.nextReview).getTime() : 0;
    const aIsDue = aDue <= nowMs;
    const bIsDue = bDue <= nowMs;

    if (aIsDue && !bIsDue) return -1;
    if (!aIsDue && bIsDue) return 1;
    if (aDue !== bDue) return aDue - bDue;
    return (a.level || 0) - (b.level || 0);
  });

  const candidatePool = [...fromPreview, ...others];
  return candidatePool.slice(0, Math.max(1, count));
}
