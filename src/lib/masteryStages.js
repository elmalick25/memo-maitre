// src/lib/masteryStages.js
// ─────────────────────────────────────────────────────────────────────────────
// Suivi du pipeline de statuts "production active" — indépendant du scheduling
// FSRS. Une fiche peut être "recalled" (bien mémorisée) mais toujours jamais
// "produced" en contexte réel. Ce module dérive le stage à partir des données
// SRS existantes ET des usages productifs enregistrés.
//
// Pipeline logique :
//   discovered  → aucune révision (repetitions = 0)
//   recognized  → repetitions > 0 (au moins une révision réussie)
//   recalled    → repetitions >= 2 ET interval >= 5 (rappel espacé stable)
//   produced    → au moins 1 usage productif correct (voice/chat/writing/dictation)
//   mastered    → >= 2 usages productifs corrects dans >= 2 contextes DISTINCTS,
//                 espacés d'au moins 48h.
//
// Toutes les fonctions ici sont PURES : elles ne touchent pas au storage.
// C'est l'appelant (MemoMaster / EnglishPractice) qui persiste le résultat.
// ─────────────────────────────────────────────────────────────────────────────

export const MASTERY_STAGES = ['discovered', 'recognized', 'recalled', 'produced', 'mastered'];

const MS_48H = 48 * 3600 * 1000;

function toMs(dateLike) {
  if (dateLike == null) return null;
  if (typeof dateLike === 'number') return dateLike;
  const t = Date.parse(dateLike);
  return Number.isFinite(t) ? t : null;
}

/**
 * Renvoie les contextes DISTINCTS ayant fait l'objet d'un usage productif correct.
 * (Dérivé — pas stocké — pour un seul point de vérité.)
 */
export function getDistinctProductiveContexts(expression) {
  const uses = Array.isArray(expression?.productiveUses) ? expression.productiveUses : [];
  const set = new Set();
  for (const u of uses) {
    if (u && u.correct && typeof u.context === 'string') set.add(u.context);
  }
  return Array.from(set);
}

/**
 * Compte les usages productifs corrects.
 */
export function countCorrectProductiveUses(expression) {
  const uses = Array.isArray(expression?.productiveUses) ? expression.productiveUses : [];
  return uses.filter(u => u && u.correct).length;
}

/**
 * Détermine si l'expression a au moins 2 usages productifs corrects dans des
 * contextes distincts espacés d'au moins 48h.
 */
export function hasMasteryPattern(expression) {
  const uses = (Array.isArray(expression?.productiveUses) ? expression.productiveUses : [])
    .filter(u => u && u.correct)
    .map(u => ({ ...u, _ms: toMs(u.date) }))
    .filter(u => u._ms != null)
    .sort((a, b) => a._ms - b._ms);

  if (uses.length < 2) return false;

  // Cherche deux usages, contextes distincts, séparés d'au moins 48h.
  for (let i = 0; i < uses.length; i++) {
    for (let j = i + 1; j < uses.length; j++) {
      if (uses[i].context !== uses[j].context && (uses[j]._ms - uses[i]._ms) >= MS_48H) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Dérive le mastery stage à partir de l'état SRS + productiveUses.
 * Pure — n'écrit rien.
 */
export function computeMasteryStage(expression) {
  if (!expression || typeof expression !== 'object') return 'discovered';
  const reps = Number(expression.repetitions) || 0;
  const interval = Number(expression.interval) || 0;
  const correctUses = countCorrectProductiveUses(expression);

  if (hasMasteryPattern(expression)) return 'mastered';
  if (correctUses >= 1) return 'produced';
  if (reps >= 2 && interval >= 5) return 'recalled';
  if (reps > 0) return 'recognized';
  return 'discovered';
}

/**
 * Retourne une nouvelle version de l'expression avec l'usage productif enregistré
 * et le stage recalculé. NE persiste pas.
 *
 * @param {object} expression
 * @param {{ context: 'voice'|'chat'|'writing'|'dictation', correct: boolean, note?: string, date?: string|number }} entry
 */
export function recordProductiveUse(expression, entry) {
  const context = entry?.context || 'chat';
  const correct = !!entry?.correct;
  const note = typeof entry?.note === 'string' ? entry.note : undefined;
  const date = entry?.date || new Date().toISOString();
  const uses = Array.isArray(expression?.productiveUses) ? expression.productiveUses.slice() : [];
  uses.push({ date, context, correct, ...(note ? { note } : {}) });

  const next = {
    ...expression,
    productiveUses: uses,
    lastProductiveUseAt: correct ? Date.now() : (expression?.lastProductiveUseAt ?? null),
  };
  next.masteryStage = computeMasteryStage(next);
  return next;
}

/**
 * Sélectionne les expressions au stage "recalled" (mémorisées mais jamais
 * produites en contexte réel), triées par ancienneté du dernier créneau.
 * Source des "missions" de pratique (Phase 2/5).
 */
export function getExpressionsNeedingProduction(expressions, limit = 10) {
  if (!Array.isArray(expressions)) return [];
  return expressions
    .map(e => {
      // Toujours recalculer le stage à la volée (rétrocompat pour les fiches
      // sans champ masteryStage persisté).
      const stage = e.masteryStage || computeMasteryStage(e);
      return { e, stage };
    })
    .filter(x => x.stage === 'recalled')
    .sort((a, b) => {
      const da = toMs(a.e.lastProductiveUseAt) ?? toMs(a.e.updatedAt) ?? toMs(a.e.createdAt) ?? 0;
      const db_ = toMs(b.e.lastProductiveUseAt) ?? toMs(b.e.updatedAt) ?? toMs(b.e.createdAt) ?? 0;
      return da - db_;
    })
    .slice(0, limit)
    .map(x => x.e);
}

/**
 * Passe rétro-compat : garantit qu'une expression possède un masteryStage.
 * Utilisé au chargement dans MemoMaster.jsx sans écraser un stage déjà défini.
 */
export function ensureMasteryStage(expression) {
  if (!expression || typeof expression !== 'object') return expression;
  if (expression.masteryStage && MASTERY_STAGES.includes(expression.masteryStage)) {
    return expression;
  }
  return { ...expression, masteryStage: computeMasteryStage(expression) };
}

/**
 * Résumé pour stats / rapport hebdo — nb par stage + usages productifs sur N jours.
 */
export function getMasteryBreakdown(expressions) {
  const acc = { discovered: 0, recognized: 0, recalled: 0, produced: 0, mastered: 0 };
  (expressions || []).forEach(e => {
    const s = e?.masteryStage || computeMasteryStage(e);
    if (acc[s] != null) acc[s] += 1;
  });
  return acc;
}

export function countProductiveUsesInWindow(expressions, sinceMs) {
  let n = 0;
  (expressions || []).forEach(e => {
    (e?.productiveUses || []).forEach(u => {
      const t = toMs(u?.date);
      if (t != null && t >= sinceMs && u.correct) n++;
    });
  });
  return n;
}
