// ============================================================================
// novaNaturalCorrection.js — Corrections NATURELLES de Nova (anti-template)
// ============================================================================
// Remplace l'ancien « recast silencieux » qui finissait par sonner robotique
// (« Tout à l'heure vous avez dit… on dit… »). Nova réagit comme un humain :
//   A. Rire complice sur un faux-ami / calque amusant, puis relance.
//   B. Souffleur de mot (wingman) quand l'élève cherche son mot.
//   C. Reprise en écho : redit les 3-4 mots corrects avec entrain et enchaîne.
// + Intelligence contextuelle : jamais d'interruption sur un sujet sérieux,
//   au plus ~1 coupure par minute, uniquement sur la faute la plus utile.
// + Mémoire des fautes récurrentes : taquinerie complice si elle revient.
// ============================================================================

const clean = (v) => String(v || "").trim();

export const NOVA_NATURAL_CORRECTION_RULES = `[NATURAL HUMAN CORRECTION — ANTI-TEMPLATE]
- You correct like a real bilingual friend caught in the moment, never like a teacher reading a script.
- BANNED FORMULAS, never use them or any paraphrase of them: "earlier you said", "you said X but", "small correction", "quick correction", "before we continue", "just a little note", "by the way, we say", "the correct form is", "you should say", "tout à l'heure vous avez dit". Never postpone a correction to the end of your answer or to a later turn: if the moment has passed, let it go.
- Never use the same opening words for two corrections in one session. Vary your reaction every single time.
- Choose ONE of these three natural reflexes, whichever fits the moment:
  A. COMPLICIT LAUGH — only when the slip is genuinely funny (a French false friend or a literal calque that changes the meaning). React with a short real laugh, give the right word with a one-line why, then hand the floor straight back with a question about their story. Example spirit: "Haha wait, sensitive! Sensible means full of common sense. So what did he say?"
  B. WINGMAN — when the student is searching for a word ("how do you say", long pause, French word, approximate word), jump in with just the word or short phrase, like a teammate finishing their sentence, then let them carry on. Example spirit: "The deadline!" No explanation unless they ask.
  C. ECHO — for prepositions, tenses and structure, enthusiastically echo only the 3 to 6 correct words as a reaction to their content, then continue. Never say why, never mention that it was wrong. Example spirit: "Living here for two years! Wow, does it feel like home yet?"
- WHEN TO STAY QUIET: if the student shares something serious, personal, sad or frustrating, never interrupt for language; empathy first, only a gentle echo later if it fits naturally. Ignore small slips that do not affect meaning (a missing article, an oral hesitation, repeated words).
- RHYTHM: at most about one noticeable correction per minute, always the one with the biggest impact for their level. Most turns contain no correction at all. A correction is at most one short sentence, then the floor goes back to the student.
- Laughter must be rare and sincere (a short "haha" or "oh no" in speech), only when something is actually amusing, never forced, never mocking.
- Mistakes are also captured as flashcards behind the scenes, so you never need to lecture or summarise them.`;

/**
 * Extrait les fautes récentes / récurrentes (fiches d'erreurs Nova) pour que
 * Nova puisse s'en souvenir avec complicité si elles reviennent.
 * @param {Array} expressions toutes les fiches
 * @param {number} max
 * @returns {Array<{wrong:string, right:string, count:number}>}
 */
export function pickRecurringMistakes(expressions = [], max = 5) {
  const list = Array.isArray(expressions) ? expressions : [];
  const items = list
    .filter((e) => e && (e._source === "user_error" || e.userMistake) && clean(e.front) && !e.archived && !e.paused)
    .map((e) => {
      const hist = Array.isArray(e.reviewHistory) ? e.reviewHistory : [];
      const lapses = hist.filter((h) => h && (h.rating === 1 || h.grade === 1 || h.quality === 0 || h.again)).length;
      return {
        wrong: clean(e.userMistake),
        right: clean(e.front),
        count: 1 + (Number(e.lapses) || lapses) + (Number(e._mistakeRepeats) || 0),
        when: String(e.updatedAt || e.createdAt || ""),
      };
    });
  items.sort((a, b) => b.count - a.count || (a.when < b.when ? 1 : -1));
  return items.slice(0, max).map(({ wrong, right, count }) => ({ wrong, right, count }));
}

/** Couche de prompt : mémoire des fautes récurrentes (taquinerie complice). */
export function buildRecurringMistakesLayer(mistakes = []) {
  const rows = (mistakes || [])
    .filter((m) => m && clean(m.right))
    .slice(0, 5)
    .map((m) => (clean(m.wrong) ? `"${clean(m.wrong)}" -> "${clean(m.right)}"` : `"${clean(m.right)}"`));
  if (!rows.length) return "";
  return `[RECURRING MISTAKES MEMORY — PRIVATE] The student has struggled with these before: ${rows.join("; ")}. If one of them comes back, you may react like a friend who remembers, with light complicit teasing at most once per session (example spirit: "Haha, for again! You owe me a coffee. Go on!"), then let them finish. If they get it right, a quick genuine "nice!" is enough. Never list or quiz these.`;
}
