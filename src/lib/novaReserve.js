// novaReserve.js — Anti-dette des fiches Nova (4 piliers)
// 1) Curation : erreurs réelles 100 %, vocabulaire coach plafonné par session.
// 2) Réserve : aucune fiche créée n'est due le jour même (J+1 minimum).
// 3) Injection : étalement quotidien selon les places de la Review
//    (10 erreurs Nova / jour, 10 vocabulaire Nova / jour).
// 4) Assainissement : fiches Nova jamais révisées et en retard → réétalées.
import { isNovaCard, isNovaMistakeCard, NOVA_MISTAKE_DAILY_SLOTS } from "./memoryLab.js";

export const COACH_VOCAB_PER_SESSION = 5;
export const NOVA_VOCAB_DAILY_SLOTS = 10;

export function addDaysISO(iso, n) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Pilier 1 : garde toutes les erreurs, plafonne le vocabulaire du coach. */
export function curateNovaBatch(cards, alreadyKeptVocab = 0, cap = COACH_VOCAB_PER_SESSION) {
  let room = Math.max(0, cap - alreadyKeptVocab);
  const kept = [];
  const dropped = [];
  for (const c of cards || []) {
    if (c?.source === "user_error" || c?._source === "user_error") { kept.push(c); continue; }
    if (room > 0) { kept.push(c); room--; } else dropped.push(c);
  }
  return { kept, dropped };
}

const lane = (c) => (isNovaMistakeCard(c) ? "mistake" : "vocab");
const capOf = (l) => (l === "mistake" ? NOVA_MISTAKE_DAILY_SLOTS : NOVA_VOCAB_DAILY_SLOTS);

function buildLoad(existing, today) {
  const load = new Map();
  for (const e of existing || []) {
    if (!e || !isNovaCard(e) || !e.nextReview || e.nextReview <= today) continue;
    const k = lane(e) + "|" + e.nextReview;
    load.set(k, (load.get(k) || 0) + 1);
  }
  return load;
}

function nextFreeDay(load, l, today) {
  for (let i = 1; i < 3650; i++) {
    const day = addDaysISO(today, i);
    const k = l + "|" + day;
    if ((load.get(k) || 0) < capOf(l)) { load.set(k, (load.get(k) || 0) + 1); return day; }
  }
  return addDaysISO(today, 1);
}

/** Piliers 2 + 3 : date chaque nouvelle fiche à partir de J+1 selon les places libres. */
export function scheduleNovaCards(newCards, existing, today) {
  const load = buildLoad(existing, today);
  return (newCards || []).map((c) => ({ ...c, nextReview: nextFreeDay(load, lane(c), today), _novaReserve: true }));
}

/** Pilier 4 : fiches Nova jamais révisées et dues/en retard → réserve étalée. */
export function sanitizeNovaBacklog(expressions, today) {
  const list = Array.isArray(expressions) ? expressions : [];
  const isStale = (e) => e && isNovaCard(e) && !e.paused && (e.repetitions || 0) === 0
    && !(e.reviewHistory && e.reviewHistory.length) && e.nextReview && e.nextReview < today;
  const stale = list.filter(isStale);
  if (!stale.length) return { list, moved: 0 };
  // Les erreurs d'abord, puis les plus anciennes.
  stale.sort((a, b) => (lane(a) === lane(b) ? String(a.nextReview).localeCompare(String(b.nextReview)) : lane(a) === "mistake" ? -1 : 1));
  const load = buildLoad(list.filter((e) => !isStale(e)), today);
  // Le jour même reste alimenté : on autorise aujourd'hui comme 1er jour pour le stock.
  const todayLoad = { mistake: 0, vocab: 0 };
  for (const e of list) if (e && isNovaCard(e) && e.nextReview === today) todayLoad[lane(e)]++;
  const dates = new Map();
  for (const e of stale) {
    const l = lane(e);
    if (todayLoad[l] < capOf(l)) { todayLoad[l]++; dates.set(e.id, today); }
    else dates.set(e.id, nextFreeDay(load, l, today));
  }
  return {
    list: list.map((e) => (dates.has(e?.id) ? { ...e, nextReview: dates.get(e.id), _novaReserve: true } : e)),
    moved: stale.length,
  };
}
