// src/lib/english/dailyOralTargets.js — Sélecteur cognitif des cibles orales du jour pour Nova Live
import { englishCategoryFilter } from '../../hooks/useProductiveUse.js';

/**
 * Retourne la date locale au format YYYY-MM-DD
 */
export function getTodayDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Extrait le sens court en français depuis le verso de la fiche
 */
export function extractShortMeaning(backText) {
  if (!backText || typeof backText !== 'string') return '';

  // 1. Détection "Vrai sens :"
  const vraiSensMatch = backText.match(/(?:📖\s*)?(?:\*{0,2}Vrai sens\s*(?:\(FR\))?\s*:\*{0,2})\s*([^\n🧩💬⚠️]+)/i);
  if (vraiSensMatch && vraiSensMatch[1]) {
    const clean = vraiSensMatch[1].replace(/[`*_~]/g, '').trim().split(/[🧩💬⚠️\n]/)[0].trim();
    if (clean) return clean;
  }

  // 2. Détection flèche "↳"
  const arrowMatch = backText.match(/^[↳\->]+\s*([^\n🧩💬⚠️]+)/m);
  if (arrowMatch && arrowMatch[1]) {
    const clean = arrowMatch[1].replace(/[`*_~]/g, '').trim();
    if (clean) return clean;
  }

  // 3. Première ligne épurée
  const lines = backText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('🧩') && !l.startsWith('💬') && !l.startsWith('⚠️') && !l.startsWith('* **'));

  if (lines.length > 0) {
    return lines[0]
      .replace(/^#+\s*/g, '')
      .replace(/\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]{2}/gu, '')
      .replace(/(?:\*{0,2}Vrai sens\s*:\*{0,2})/gi, '')
      .replace(/[`*_~]/g, '')
      .trim();
  }

  return backText.slice(0, 60).trim();
}

/**
 * Génère des variations morphologiques courantes pour détecter l'usage à l'oral
 * (ex: "cut corners" -> ["cut corners", "cutting corners", "cuts corners"])
 */
export function generateOralVariants(expression) {
  if (!expression || typeof expression !== 'string') return [];
  const base = expression.toLowerCase().trim().replace(/[.,!?;:]/g, '');
  const variants = new Set([base]);

  // Remplacement tiret / espace
  variants.add(base.replace(/-/g, ' '));
  variants.add(base.replace(/\s+/g, '-'));

  // Détection verbes simples (stems / ing / ed / s)
  const words = base.split(/\s+/);
  if (words.length > 0) {
    const first = words[0];
    const rest = words.slice(1).join(' ');

    // Irréguliers fréquents
    const irregulars = {
      cut: ['cutting', 'cuts'],
      burn: ['burned', 'burnt', 'burning', 'burns'],
      take: ['took', 'taken', 'taking', 'takes'],
      get: ['got', 'gotten', 'getting', 'gets'],
      make: ['made', 'making', 'makes'],
      go: ['went', 'gone', 'going', 'goes'],
      come: ['came', 'coming', 'comes'],
      give: ['gave', 'given', 'giving', 'gives'],
      keep: ['kept', 'keeping', 'keeps'],
      put: ['putting', 'puts'],
      bring: ['brought', 'bringing', 'brings'],
      run: ['ran', 'running', 'runs'],
      break: ['broke', 'broken', 'breaking', 'breaks'],
      turn: ['turned', 'turning', 'turns'],
      call: ['called', 'calling', 'calls'],
      look: ['looked', 'looking', 'looks'],
      give_up: ['gave up', 'giving up', 'gives up'],
    };

    if (irregulars[first]) {
      irregulars[first].forEach(inflected => {
        variants.add(rest ? `${inflected} ${rest}` : inflected);
      });
    } else if (first.endsWith('e')) {
      variants.add(rest ? `${first}d ${rest}` : `${first}d`);
      variants.add(rest ? `${first.slice(0, -1)}ing ${rest}` : `${first.slice(0, -1)}ing`);
      variants.add(rest ? `${first}s ${rest}` : `${first}s`);
    } else {
      variants.add(rest ? `${first}ed ${rest}` : `${first}ed`);
      variants.add(rest ? `${first}ing ${rest}` : `${first}ing`);
      variants.add(rest ? `${first}s ${rest}` : `${first}s`);
    }
  }

  return Array.from(variants);
}

/**
 * Teste si une cible orale a été prononcée dans un texte de transcription
 */
export function isTargetSpoken(target, transcriptText) {
  if (!target || !transcriptText || typeof transcriptText !== 'string') return false;
  const normalized = transcriptText.toLowerCase();

  // Test direct de l'expression
  const base = (target.front || target.expression || '').toLowerCase().trim();
  if (base && normalized.includes(base)) return true;

  // Test des variantes
  const variants = target.variants || generateOralVariants(base);
  for (const v of variants) {
    if (v && v.length >= 3 && normalized.includes(v)) {
      return true;
    }
  }

  return false;
}

/**
 * Sélecteur d'élite des cibles orales du jour
 * @param {Array} expressions - Liste complète des fiches
 * @param {object} [options]
 * @param {number} [options.limit=3] - Nombre de fiches cibles (max 4 pour charge cognitive optimale)
 * @param {string} [options.todayDateStr] - Date forcée pour tests
 */
export function getDailyOralTargets(expressions, { limit = 3, todayDateStr = getTodayDateString() } = {}) {
  if (!Array.isArray(expressions) || expressions.length === 0) {
    return { targets: [], source: 'empty', totalReviewedToday: 0 };
  }

  const englishCards = expressions.filter(englishCategoryFilter);
  if (englishCards.length === 0) {
    return { targets: [], source: 'empty', totalReviewedToday: 0 };
  }

  // 1. Détecter les fiches révisées aujourd'hui
  const reviewedToday = [];
  englishCards.forEach(card => {
    let wasReviewedToday = false;
    let lastRating = null;

    if (Array.isArray(card.reviewHistory)) {
      const todayReview = card.reviewHistory.find(r => r && (r.date === todayDateStr || String(r.timestamp || '').startsWith(todayDateStr)));
      if (todayReview) {
        wasReviewedToday = true;
        lastRating = todayReview.rating ?? todayReview.score ?? null;
      }
    }

    if (!wasReviewedToday && typeof card.lastReviewed === 'string' && card.lastReviewed.startsWith(todayDateStr)) {
      wasReviewedToday = true;
    }
    if (!wasReviewedToday && card.lastReviewDate === todayDateStr) {
      wasReviewedToday = true;
    }

    if (wasReviewedToday) {
      reviewedToday.push({ card, lastRating });
    }
  });

  const totalReviewedToday = reviewedToday.length;

  let selectedCards = [];
  let source = 'today_reviews';

  if (totalReviewedToday > 0) {
    // Priorité cognitive :
    // 1) Fiches où l'étudiant a eu du mal (rating 1 'again', rating 2 'hard', ou interval < 2)
    const struggleCards = reviewedToday
      .filter(({ card, lastRating }) => lastRating === 1 || lastRating === 2 || (card.interval ?? 0) <= 1 || (card.lapses ?? 0) > 0)
      .map(({ card }) => ({ card, priority: 1 }));

    // 2) Fiches révisées aujourd'hui normales
    const struggleIds = new Set(struggleCards.map(s => s.card.id));
    const smoothCards = reviewedToday
      .filter(({ card }) => !struggleIds.has(card.id))
      .map(({ card }) => ({ card, priority: 2 }));

    selectedCards = [...struggleCards, ...smoothCards].slice(0, limit).map(s => s.card);
  } else {
    // Fallback gracieux si aucune révision faite aujourd'hui :
    // Prendre les fiches dues (nextReview <= now) ou les fiches fragiles en cours d'apprentissage
    source = 'due_fallback';
    const now = new Date();

    const dueCards = englishCards
      .filter(c => c.nextReview && new Date(c.nextReview) <= now)
      .sort((a, b) => new Date(a.nextReview || 0).getTime() - new Date(b.nextReview || 0).getTime());

    const learningCards = englishCards
      .filter(c => (c.repetitions ?? 0) > 0 && (c.interval ?? 0) < 5);

    const alreadyDue = new Set(dueCards.map(c => c.id));
    const combinedFallback = [...dueCards, ...learningCards.filter(c => !alreadyDue.has(c.id))];

    selectedCards = combinedFallback.length > 0 ? combinedFallback.slice(0, limit) : englishCards.slice(0, limit);
  }

  // Formatage propre pour Nova Voice Prompt & HUD UI
  const targets = selectedCards.map(card => {
    const front = (card.front || '').trim();
    const back = extractShortMeaning(card.back || '');
    return {
      id: card.id || `target-${front}`,
      front,
      back,
      cleanFront: front.toLowerCase(),
      variants: generateOralVariants(front),
      example: card.example || '',
      category: card.category || 'Anglais',
      isHard: (card.interval ?? 0) <= 2,
    };
  });

  return {
    targets,
    source,
    totalReviewedToday,
  };
}
