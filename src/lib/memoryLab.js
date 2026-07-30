// src/lib/memoryLab.js
//
// Couche « science de la mémoire » pour Second Cerveau.
// Toutes les fonctions sont pures (déterministes, aucun side-effect) pour être
// facilement testables et composables. Elles ne dépendent d'AUCUN state React.
//
// Objectifs (basés sur la littérature retrieval-practice + FSRS) :
//   1. Anti-interférence : ne jamais réviser deux fiches sémantiquement
//      similaires à la suite → protège la spécificité de l'encodage
//      (interférence rétroactive/proactive, McGeoch 1932, Anderson 1974).
//   2. Interleaving : mélanger les modules dans une session → transfert
//      d'apprentissage supérieur au blocking (Rohrer & Taylor 2007).
//   3. Détection de leeches (fiches "sangsues") : après N ratés, la fiche
//      n'a plus besoin de plus de reviews mais d'une REFORMULATION
//      (recommandation Anki + SuperMemo "20 rules" #6).
//   4. Composition de session ciblée « points faibles » : booster massif
//      pour les cartes à faible rétention prédite.

// ── Tokenization + similarité Jaccard sur le recto ────────────────────────
const STOPWORDS_FR = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du", "d", "l",
  "et", "ou", "mais", "car", "donc", "or", "ni",
  "est", "sont", "être", "a", "ai", "as", "avoir", "au", "aux",
  "que", "qui", "quoi", "quel", "quelle", "quels", "quelles",
  "ce", "cet", "cette", "ces", "se", "sa", "son", "ses",
  "mon", "ma", "mes", "ton", "ta", "tes", "notre", "votre", "leur", "leurs",
  "en", "y", "à", "dans", "sur", "sous", "pour", "par", "avec", "sans",
  "ne", "pas", "plus", "moins", "très", "trop", "aussi",
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "the", "a", "an", "of", "in", "on", "and", "or", "to", "is", "are",
  "was", "were", "be", "been", "being", "for", "with", "as", "by",
]);

function tokenize(text) {
  if (!text) return [];
  return String(text)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // accents → ascii
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS_FR.has(t));
}

function jaccard(a, b) {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  const union = setA.size + setB.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Similarité entre deux fiches basée sur le recto (front). On ne prend PAS
 * le verso : c'est le recto qui déclenche le rappel, et c'est là que
 * l'interférence se produit ("Danemark…?" vs "Suède…?" → confusion).
 */
export function cardSimilarity(a, b) {
  const ta = tokenize(a?.front);
  const tb = tokenize(b?.front);
  return jaccard(ta, tb);
}

// ── Anti-interférence : réorganise la queue pour espacer les fiches proches ──
/**
 * Réorganise une file pour qu'aucune paire de fiches sémantiquement proches
 * (même catégorie + similarité recto > threshold) ne soit consécutive.
 * Algorithme : simple pass gloutonne — pour chaque position i, si le voisin
 * i-1 est trop proche, on cherche dans les positions futures une fiche
 * "safe" à insérer à sa place et on décale l'originale plus loin.
 * On ne change pas la composition, uniquement l'ordre.
 *
 * @param {Array} queue - Fiches déjà triées par priorité.
 * @param {Object} opts
 * @param {number} opts.simThreshold - Seuil Jaccard (défaut 0.34).
 * @param {number} opts.lookAhead - Fenêtre de recherche (défaut 6).
 * @returns {Array} Nouvelle file réordonnée.
 */
export function antiInterferenceReorder(queue, opts = {}) {
  const { simThreshold = 0.34, lookAhead = 6 } = opts;
  if (!Array.isArray(queue) || queue.length < 3) return queue ? [...queue] : [];

  const result = [...queue];
  for (let i = 1; i < result.length; i++) {
    const prev = result[i - 1];
    const cur = result[i];
    const tooClose =
      (prev.category === cur.category && cardSimilarity(prev, cur) >= simThreshold) ||
      cardSimilarity(prev, cur) >= simThreshold + 0.15;
    if (!tooClose) continue;

    // Chercher dans les positions [i+1, i+lookAhead] une fiche "safe"
    let swapIdx = -1;
    const end = Math.min(result.length - 1, i + lookAhead);
    for (let j = i + 1; j <= end; j++) {
      const cand = result[j];
      if (cardSimilarity(prev, cand) < simThreshold) {
        swapIdx = j;
        break;
      }
    }
    if (swapIdx > 0) {
      // Insertion "chirurgicale" : on déplace cand à la position i et on
      // décale la fiche originale de i vers swapIdx (permutation ciblée).
      const cand = result.splice(swapIdx, 1)[0];
      result.splice(i, 0, cand);
    }
    // Sinon : pas de swap possible, on garde l'ordre (mieux qu'un blocage).
  }
  return result;
}

// ── Interleaving multi-modules ────────────────────────────────────────────
/**
 * Distribue une file en round-robin par catégorie (interleaving).
 * Contrairement à un simple tri, on préserve l'ordre relatif dans chaque
 * catégorie (par priorité), puis on tresse.
 */
export function interleaveByCategory(queue) {
  if (!Array.isArray(queue) || queue.length === 0) return [];
  const byCat = new Map();
  queue.forEach((c) => {
    const k = c.category || "Divers";
    if (!byCat.has(k)) byCat.set(k, []);
    byCat.get(k).push(c);
  });
  const buckets = [...byCat.values()];
  const out = [];
  const cursors = buckets.map(() => 0);
  let done = false;
  while (!done) {
    done = true;
    for (let b = 0; b < buckets.length; b++) {
      if (cursors[b] < buckets[b].length) {
        out.push(buckets[b][cursors[b]++]);
        done = false;
      }
    }
  }
  return out;
}

// ── Détection de leech ────────────────────────────────────────────────────
/**
 * Compte les échecs (q===0) et calcule un score de leech.
 * Basé sur : nb total d'échecs + taux d'échec récent + streak actuel.
 */
export function analyzeLeech(card, opts = {}) {
  const {
    lapseThreshold = 4,     // 4+ échecs cumulés → leech
    recentWindow = 6,       // fenêtre "récente" de N révisions
    recentFailRate = 0.5,   // ≥50% de fails récents → leech
  } = opts;

  const history = Array.isArray(card?.reviewHistory) ? card.reviewHistory : [];
  const explicitLapse = typeof card?.lapseCount === "number" ? card.lapseCount : null;
  const totalLapses = explicitLapse ?? history.filter((h) => h && h.q === 0).length;

  const recent = history.slice(-recentWindow);
  const recentLapses = recent.filter((h) => h && h.q === 0).length;
  const rate = recent.length ? recentLapses / recent.length : 0;

  // Streak courant de "Again"
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]?.q === 0) streak++;
    else break;
  }

  const isLeech =
    totalLapses >= lapseThreshold ||
    (recent.length >= 4 && rate >= recentFailRate) ||
    streak >= 3;

  // Sévérité 0..1 pour trier
  const severity = Math.min(
    1,
    totalLapses / 8 + rate * 0.5 + Math.min(streak, 5) * 0.1,
  );

  return { isLeech, severity, totalLapses, recentFailRate: rate, againStreak: streak };
}

/**
 * Renvoie les leeches triées par sévérité décroissante, limité à `limit`.
 */
export function pickLeeches(cards, limit = 20, opts = {}) {
  if (!Array.isArray(cards)) return [];
  return cards
    .map((c) => ({ card: c, ...analyzeLeech(c, opts) }))
    .filter((x) => x.isLeech)
    .sort((a, b) => b.severity - a.severity)
    .slice(0, limit)
    .map((x) => x.card);
}

// ── Composition de session « points faibles » ────────────────────────────
/**
 * Compose une session équilibrée pour maximiser l'apprentissage :
 *   - 50% leeches / points faibles (fiches qui bloquent réellement)
 *   - 35% dues (rappel espacé normal)
 *   - 15% consolidation (fiches à haute rétention à espacer davantage)
 * On dédoublonne par id. La sortie est finalement interleave + anti-interférence.
 */
export function composeWeakSpotSession(allCards, opts = {}) {
  const { target = 20, todayISO } = opts;
  const cards = Array.isArray(allCards) ? allCards : [];
  const leeches = pickLeeches(cards, Math.ceil(target * 0.5));
  const usedIds = new Set(leeches.map((c) => c.id));

  const due = cards
    .filter((c) => !usedIds.has(c.id))
    .filter((c) => !todayISO || (c.nextReview && c.nextReview <= todayISO))
    .sort((a, b) => (a.nextReview || "").localeCompare(b.nextReview || ""))
    .slice(0, Math.ceil(target * 0.35));
  due.forEach((c) => usedIds.add(c.id));

  const consolidation = cards
    .filter((c) => !usedIds.has(c.id))
    .filter((c) => (c.level || 0) >= 4)
    .sort((a, b) => (b.level || 0) - (a.level || 0))
    .slice(0, Math.max(1, Math.floor(target * 0.15)));

  const merged = [...leeches, ...due, ...consolidation];
  return antiInterferenceReorder(interleaveByCategory(merged));
}

// ── Incrément de lapseCount (à appeler côté state MemoMaster) ─────────────
/**
 * Renvoie le nouveau lapseCount pour une carte après une réponse.
 * grade FSRS : 1=Again, 2=Hard, 3=Good, 4=Easy. Ici on utilise l'échelle
 * MemoMaster q (0, 1, 3, 5) → q===0 est l'échec.
 */
export function nextLapseCount(card, q) {
  const cur = typeof card?.lapseCount === "number" ? card.lapseCount : 0;
  return q === 0 ? cur + 1 : cur;
}
