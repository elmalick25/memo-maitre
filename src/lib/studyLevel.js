// Niveau d'études saisi librement → rang numérique, puis correspondance avec les bourses.
const LEVELS = [
  { rank: 7, label: "Doctorat", re: /\b(doctorat|phd|th[eè]se|bac\s*\+\s*[89])\b/i },
  { rank: 6, label: "Master 2", re: /\b(m\s*2|master\s*2|bac\s*\+\s*5|ing[eé]nieur)\b/i },
  { rank: 5, label: "Master 1", re: /\b(m\s*1|master\s*1|master|bac\s*\+\s*4)\b/i },
  { rank: 4, label: "Licence 3", re: /\b(l\s*3|licence\s*3|bachelor|licence|bac\s*\+\s*3)\b/i },
  { rank: 3, label: "Licence 2", re: /\b(l\s*2|licence\s*2|bts|dut|bac\s*\+\s*2)\b/i },
  { rank: 2, label: "Licence 1", re: /\b(l\s*1|licence\s*1|bac\s*\+\s*1)\b/i },
  { rank: 1, label: "Terminale / Bac", re: /\b(bac|baccalaur[eé]at|terminale|lyc[eé]e)\b/i },
];

export const STUDY_LEVEL_SUGGESTIONS = ["Terminale / Bac", "Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2", "Doctorat"];

export function parseStudyLevel(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  const hit = LEVELS.find((l) => l.re.test(value));
  return hit ? { rank: hit.rank, label: hit.label } : null;
}

/** Rang du dernier niveau en cours requis pour candidater à la bourse. */
export function requiredRank(item) {
  const text = `${item?.title || ""} ${item?.level || ""} ${item?.eligibility?.academicLevel || ""}`;
  if (/doctora|phd|postdoc/i.test(item?.title || "")) return 6;
  if (/master\s*1\s*valid|master\s*valid|m1\s*valid/i.test(text)) return 6;
  if (/licence|bachelor|bac\s*\+\s*3|l3|undergraduate degree/i.test(text)) return 4;
  if (/baccalaur|terminale|bac\b/i.test(text)) return 1;
  return 4;
}

/** Visible si l'étudiant est au niveau requis (dernière année en cours) ou au-dessus, sans dépasser le cycle visé. */
export function matchesStudyLevel(item, rank) {
  if (!rank) return true;
  const need = requiredRank(item);
  const target = need >= 6 ? 7 : need === 1 ? 4 : 6;
  return rank >= need && rank <= target;
}
