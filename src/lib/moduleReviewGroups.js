// Groupes de révision d'un module ("Réviser toutes les fiches actives").
// Règle : une fiche déjà révisée aujourd'hui sort du compteur du jour,
// comme dans la vue Révision — le nombre diminue au fil de la journée.
import { isNovaCard, isNovaMistakeCard } from "./memoryLab.js";

export function wasReviewedOn(card, dateStr) {
  if (!card || !dateStr) return false;
  if (Array.isArray(card.reviewHistory) && card.reviewHistory.some((h) => h && h.date === dateStr)) return true;
  if (card.lastReviewDate === dateStr) return true;
  if (typeof card.lastReviewed === "string" && card.lastReviewed.startsWith(dateStr)) return true;
  return false;
}

export function remainingToday(cards, dateStr) {
  return (cards || []).filter((c) => !c.paused && !wasReviewedOn(c, dateStr));
}

const GENERIC_LABELS = {
  classic: "📘 Fiches classiques",
  qcm: "☑️ QCM",
  cloze: "🧩 Textes à trous",
  code: "💻 Code",
  image: "🖼️ Images",
  audio: "🔊 Audio",
};

function genericTypeOf(card) {
  const raw = card.cardType || card.type || card._type || card.format;
  return typeof raw === "string" && raw.trim() ? raw.trim().toLowerCase() : "classic";
}

/**
 * Retourne les groupes de fiches d'un module, chacun avec `cards` (actives)
 * et `remaining` (pas encore révisées aujourd'hui).
 * Module anglais : erreurs en direct / vocabulaire & idiomes / autres fiches.
 * Autres modules : regroupement par type de fiche.
 */
export function getModuleReviewGroups(cards, { isEnglish = false, today } = {}) {
  const active = (cards || []).filter((c) => !c.paused);
  const groups = [];
  if (isEnglish) {
    const mistakes = active.filter(isNovaMistakeCard);
    const vocab = active.filter((c) => isNovaCard(c) && !isNovaMistakeCard(c));
    const others = active.filter((c) => !isNovaCard(c) && !isNovaMistakeCard(c));
    groups.push({ key: "mistakes", label: "🔴 Mes erreurs en direct", cards: mistakes });
    groups.push({ key: "vocab", label: "💡 Vocabulaire & idiomes", cards: vocab });
    groups.push({ key: "nova", label: "🎙️ Fiches du coach Nova", cards: [...mistakes, ...vocab] });
    groups.push({ key: "classic", label: "📘 Autres fiches d'anglais", cards: others });
  } else {
    const byType = new Map();
    for (const c of active) {
      const t = genericTypeOf(c);
      if (!byType.has(t)) byType.set(t, []);
      byType.get(t).push(c);
    }
    for (const [t, list] of byType) {
      groups.push({ key: t, label: GENERIC_LABELS[t] || `🗂️ ${t.charAt(0).toUpperCase()}${t.slice(1)}`, cards: list });
    }
  }
  return groups
    .filter((g) => g.cards.length > 0)
    .map((g) => ({ ...g, remaining: remainingToday(g.cards, today) }));
}
