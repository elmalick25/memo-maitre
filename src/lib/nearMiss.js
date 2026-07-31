// src/lib/nearMiss.js
// ═══════════════════════════════════════════════════════════════════════════
// CHANTIER 11 — « Tu es à deux doigts de… »
//
// Le hook central de fin de session : ne jamais dire « stop », toujours
// montrer à quel point on est PROCHE de quelque chose. Règle absolue : le
// near-miss doit être VRAI. Il est calculé sur l'état réel, jamais inventé,
// jamais gonflé. Si rien n'est proche, on renvoie null et l'UI n'affiche rien
// (mieux vaut pas de hook qu'un hook mensonger).
//
// PURE : aucune écriture, aucun state.
// ═══════════════════════════════════════════════════════════════════════════

import { XP_LEVELS } from "../constants/gamification.js";
import { questSummary } from "./dailyQuests.js";

/** XP restante avant le prochain niveau (null si niveau max). */
export function xpToNextLevel(totalXP) {
  const xp = Math.max(0, Number(totalXP) || 0);
  let level = 0;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i]) level = i;
    else break;
  }
  const next = XP_LEVELS[level + 1];
  if (next === undefined) return null;
  return { level, nextLevel: level + 1, remaining: Math.max(0, next - xp), span: next - XP_LEVELS[level] };
}

/**
 * Calcule tous les near-miss VRAIS, triés du plus proche au plus lointain.
 *
 * @param {object} input
 *   totalXP, questState, sessionBestCombo, bestComboEver,
 *   badges: [{ label, icon, cur, max }] (progression réelle, déjà calculée),
 *   avgXPPerReview: XP moyenne par carte observée sur la session.
 * @returns {Array<{ id, icon, text, remaining, unit, priority }>}
 */
export function computeNearMiss(input = {}) {
  const out = [];
  const avgXP = Math.max(1, Math.round(Number(input.avgXPPerReview) || 10));

  // 1. Niveau
  const lvl = xpToNextLevel(input.totalXP);
  if (lvl && lvl.remaining > 0 && lvl.remaining <= Math.max(120, avgXP * 12)) {
    out.push({
      id: "level",
      icon: "🎚️",
      text: `Encore ${lvl.remaining} XP pour le niveau ${lvl.nextLevel}`,
      hint: `≈ ${Math.ceil(lvl.remaining / avgXP)} carte(s)`,
      remaining: Math.ceil(lvl.remaining / avgXP),
      unit: "cartes",
      priority: 1,
    });
  }

  // 2. Quêtes du jour / hebdo
  if (input.questState) {
    const q = questSummary(input.questState);
    q.daily.forEach((quest) => {
      if (quest.done) return;
      const left = quest.max - quest.cur;
      if (left <= Math.max(3, Math.ceil(quest.max * 0.35))) {
        out.push({
          id: `quest:${quest.id}`,
          icon: quest.icon,
          text: `Plus que ${left} pour boucler « ${quest.label} » (+${quest.xp} XP)`,
          remaining: left,
          unit: "pas",
          priority: q.doneCount === q.total - 1 ? 0 : 2, // dernière quête = top priorité
        });
      }
    });
    if (q.weekly && !q.weekly.done) {
      const left = q.weekly.max - q.weekly.cur;
      out.push({
        id: "weekly",
        icon: q.weekly.icon,
        text: `Quête de la semaine : ${q.weekly.cur}/${q.weekly.max} — ${left} restant`,
        remaining: left,
        unit: "pas",
        priority: 5,
      });
    }
  }

  // 3. Record de combo
  const best = Number(input.bestComboEver) || 0;
  const cur = Number(input.sessionBestCombo) || 0;
  if (best > 0 && cur > 0 && cur < best && best - cur <= 5) {
    out.push({
      id: "combo",
      icon: "⚡",
      text: `Ton meilleur combo de la session était à ${best - cur} de ton record (${best})`,
      remaining: best - cur,
      unit: "bonnes réponses",
      priority: 3,
    });
  } else if (cur > 0 && cur >= best && best > 0) {
    out.push({
      id: "combo_record",
      icon: "🏅",
      text: `Nouveau record de combo : ${cur} !`,
      remaining: 0,
      unit: "",
      priority: 4,
    });
  }

  // 4. Badge le plus proche (progression réelle fournie par l'appelant)
  (input.badges || []).forEach((b) => {
    const left = (b.max || 0) - (b.cur || 0);
    if (left > 0 && left <= Math.max(3, Math.ceil((b.max || 1) * 0.15))) {
      out.push({
        id: `badge:${b.id || b.label}`,
        icon: b.icon || "🏆",
        text: `Badge « ${b.label} » : plus que ${left}`,
        remaining: left,
        unit: "pas",
        priority: 3,
      });
    }
  });

  return out.sort((a, b) => a.priority - b.priority || a.remaining - b.remaining);
}

/** Le meilleur near-miss (ou null s'il n'y a rien de vrai à annoncer). */
export function bestNearMiss(input) {
  return computeNearMiss(input)[0] || null;
}

/**
 * Estimation TRANSPARENTE du gain d'un « Encore N cartes » : fourchette basse
 * (tout en Hard) → fourchette haute (tout en Good avec combo maintenu).
 * L'incertitude porte sur le coffre (chantier 8), jamais sur le prix affiché.
 */
export function estimateNextCards(n = 5, { avgXPPerReview = 10, comboMult = 1 } = {}) {
  const count = Math.max(1, Math.round(n));
  const low = Math.round(count * Math.max(3, avgXPPerReview * 0.6));
  const high = Math.round(count * Math.max(6, avgXPPerReview * Math.max(1, comboMult)));
  return { count, low, high, label: low === high ? `≈ ${low} XP` : `≈ ${low}-${high} XP` };
}
