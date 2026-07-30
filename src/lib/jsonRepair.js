// jsonRepair.js — Parseur JSON tolérant aux réponses LLM tronquées / entourées de fences.
// Cause racine du bug "L'IA n'a renvoyé aucune expression exploitable" :
// la réponse était coupée au milieu d'une chaîne (limite de tokens) et l'ancien
// safeParseJSON ne savait fermer qu'un seul niveau.

// Retire ```json ... ``` (même si la fence de fin manque à cause d'une troncature)
export function stripFences(input) {
  const s = String(input || "").trim();
  const closed = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (closed) return closed[1].trim();
  const open = s.match(/```(?:json)?\s*([\s\S]*)$/i);
  if (open) return open[1].trim();
  return s;
}

// Isole le début du JSON (le modèle ajoute parfois du texte avant)
function sliceToJsonStart(s) {
  const i = s.search(/[[{]/);
  return i > 0 ? s.slice(i) : s;
}

// Ferme les structures encore ouvertes à la position `end` puis tente un parse.
function closeAndParse(s, end) {
  let out = s.slice(0, end);
  // Retire une virgule ou une clé pendante en fin de chaîne
  out = out.replace(/[\s,]+$/, "");
  out = out.replace(/,?\s*"[^"\\]*"\s*:\s*$/, "");
  out = out.replace(/[\s,]+$/, "");

  const stack = [];
  let inStr = false, esc = false;
  for (const c of out) {
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") stack.push(c);
    else if (c === "}" || c === "]") stack.pop();
  }
  if (inStr) return null; // coupe au milieu d'une chaîne : point de coupe invalide
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === "{" ? "}" : "]";

  try { return JSON.parse(out); } catch { return null; }
}

// Répare un JSON tronqué en cherchant, depuis la fin, le dernier point de coupe
// qui permet de reconstruire un document valide.
export function repairTruncatedJSON(input) {
  const s = sliceToJsonStart(stripFences(input));
  if (!s) return null;
  for (let i = s.length; i > 0; i--) {
    const c = s[i - 1];
    // Candidats plausibles de fin de valeur complète
    if (c !== '"' && c !== "}" && c !== "]" && !/[0-9el]/.test(c)) continue;
    const parsed = closeAndParse(s, i);
    if (parsed && typeof parsed === "object") return parsed;
  }
  return null;
}

// Parseur principal : parse direct, puis réparation.
export function safeParseJSON(str) {
  const cleaned = sliceToJsonStart(stripFences(str));
  if (!cleaned) throw new Error("Réponse IA vide.");
  try { return JSON.parse(cleaned); } catch { /* on tente la réparation */ }

  const repaired = repairTruncatedJSON(cleaned);
  if (repaired) return repaired;

  throw new Error("JSON invalide/tronqué : " + cleaned.slice(0, 200));
}

export default safeParseJSON;
